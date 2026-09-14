/**
 * OBRS-892 evidence -- icon-only buttons now name themselves on hover.
 *
 * WHAT THIS PRODUCES, AND WHAT IT DOES NOT. measured.json is the real evidence:
 * it reads the `title` / `aria-label` actually present on the hovered button in
 * the running app. The two PNGs are the page as the user sees it -- they do NOT
 * show the tooltip, and on 2026-09-14 they came out BYTE-IDENTICAL (141,053 B
 * each). That is not a bug in this script; a native `title` tooltip is drawn by
 * the browser process in its own layered window, and every capture path
 * available here is blind to it. Measured, in order, so nobody re-walks these:
 *
 *   1. page.screenshot()            - renders the page only, never browser UI.
 *   2. SetCursorPos + CopyFromScreen - the OS cursor moved (GetCursorPos agreed)
 *      but the renderer never saw it: the same TD stayed `:hover` with the
 *      pointer parked off-screen, so an early capture's "hovered row" was a
 *      stale state left by the login clicks.
 *   3. SendInput (the correct API for 2) + Playwright hover  - the pointer lands
 *      on the right button and `:hover` confirms it, still no tooltip drawn.
 *   4. CopyFromScreen with CAPTUREBLT, which is what captures layered windows -
 *      .NET rejects the value outright: "The value of argument 'value'
 *      (1087111200) is invalid".
 *
 * So the tooltip is asserted from the DOM, and the AFTER image is there to show
 * the build this ran against and the five bare glyphs the tooltip now explains.
 *
 *   node e2e/capture-obrs-892-icon-button-tooltip.mjs
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4499';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('obrs-892-out');
const EMAIL = process.env.OBRS_EMAIL ?? 'owner@system.local';
const PASSWORD = process.env.OBRS_PASSWORD ?? 'P@ssw0rd';

/** Move the real Windows cursor to a screen point and report where it ended up. */
function moveCursor(x, y) {
  // SendInput, not SetCursorPos. Measured 2026-09-14: SetCursorPos moved the
  // pointer (GetCursorPos agreed) but nothing downstream reacted - the renderer
  // kept the previous element :hover even with the cursor parked off-screen -
  // because it warps the pointer without posting a real move through the input
  // queue, which is what Chrome's tooltip timer listens to.
  const ps = `
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Drawing;
public class Inp {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public MOUSEINPUT mi; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] p, int cb);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c);
  public static void MoveTo(int x, int y) {
    int w = GetSystemMetrics(0), h = GetSystemMetrics(1);
    INPUT[] i = new INPUT[1];
    i[0].type = 0;
    i[0].mi.dx = (int)((x * 65535.0) / (w - 1));
    i[0].mi.dy = (int)((y * 65535.0) / (h - 1));
    i[0].mi.dwFlags = 0x0001 | 0x8000;   // MOVE | ABSOLUTE
    SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@ -ReferencedAssemblies System.Drawing
$p = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -match 'chrome' } | Select-Object -First 1
if ($p) { [Inp]::ShowWindow($p.MainWindowHandle, 9) | Out-Null; [Inp]::SetForegroundWindow($p.MainWindowHandle) | Out-Null }
# Two steps: a tooltip needs movement INTO the element, not a single jump onto it.
[Inp]::MoveTo(${x} - 8, ${y} - 8); Start-Sleep -Milliseconds 120
[Inp]::MoveTo(${x}, ${y}); Start-Sleep -Milliseconds 200
$pos = New-Object System.Drawing.Point
[Inp]::GetCursorPos([ref]$pos) | Out-Null
Write-Output "$($pos.X),$($pos.Y),$(if($p){$p.ProcessName}else{'no-chrome-window'})"
`;
  const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
  const [gx, gy, proc] = out.split(',');
  return { x: Number(gx), y: Number(gy), foregrounded: proc };
}

/** Capture the whole primary screen. A native tooltip is its own OS window, so
 *  nothing that renders only the page (page.screenshot, PrintWindow) can see it. */
function shootScreen(file) {
  const ps = `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
# NOTE: this photographs the page, NOT the native tooltip. Chrome draws a title
# tooltip in a separate LAYERED window, and capturing one needs BitBlt with
# CAPTUREBLT, which .NET CopyFromScreen rejects outright (measured 2026-09-14:
# "The value of argument 'value' (1087111200) is invalid"). The tooltip text is
# therefore asserted from the DOM in measured.json, not read off these images.
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$bmp.Save('${file.split(String.fromCharCode(92)).join('/')}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "$($b.Width)x$($b.Height)"
`;
  return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-web-security',
      // Pin devicePixelRatio to 1 so a CSS pixel IS a screen pixel. Without it the
      // cursor maths has to cross two coordinate spaces (Chrome's CSS px and the
      // DPI-unaware PowerShell's screen px) and lands the pointer on the wrong
      // element - measured: 1.25x put it 300px right of the button, off-screen.
      '--force-device-scale-factor=1',
      '--window-position=0,0',
      '--window-size=1530,860',
    ],
  });
  const ctx = await browser.newContext({ viewport: null });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });

  await page.goto(`${BASE}/admin/vehicles`, { waitUntil: 'networkidle' });
  await page.waitForSelector('table.admin-table tbody tr', { timeout: 20000 });
  await page.bringToFront();

  // The card names this row the strongest case: `build` vs `checklist` as bare
  // glyphs are unguessable. Take the SECOND icon button of the first row.
  const btn = page.locator('table.admin-table tbody tr').first().locator('button.admin-icon-btn').nth(1);
  await btn.scrollIntoViewIfNeeded();
  // Put the row in the MIDDLE of the viewport: a button sitting on the bottom
  // edge of the screen gets a tooltip drawn off-screen, or none at all.
  await page.addStyleTag({ content: '*, *::before, *::after { scroll-behavior: auto !important }' });
  await btn.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  // Wait for the box to STOP moving. Reading it while a scroll is still settling
  // aims the cursor at where the button was, which is how it landed two rows low.
  let box = await btn.boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const again = await btn.boundingBox();
    if (again.x === box.x && again.y === box.y) break;
    box = again;
  }

  // Measure, do not eyeball: whatever is under the aim point must BE this button.
  const aim = await btn.evaluate((el, b) => {
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return {
      hitsTheButton: hit === el || el.contains(hit),
      hitTag: hit ? hit.tagName + '.' + hit.className : null,
      hitTitle: hit ? (hit.closest('button') || {}).title ?? null : null,
    };
  }, box);
  console.log('aim check', aim);
  if (!aim.hitsTheButton) throw new Error('aim point is not on the button: ' + JSON.stringify(aim));
  const frame = await page.evaluate(() => ({
    sx: window.screenX,
    sy: window.screenY,
    chromeH: window.outerHeight - window.innerHeight,
    dpr: window.devicePixelRatio,
  }));
  const measured = {
    page: '/admin/vehicles',
    buttonIcon: await btn.locator('span.material-symbols-outlined').innerText(),
    titleAttr: await btn.getAttribute('title'),
    ariaLabelAttr: await btn.getAttribute('aria-label'),
    rowButtonsWithTitle: await page
      .locator('table.admin-table tbody tr')
      .first()
      .locator('button.admin-icon-btn[title]')
      .count(),
    rowButtonsTotal: await page
      .locator('table.admin-table tbody tr')
      .first()
      .locator('button.admin-icon-btn')
      .count(),
    frame,
  };

  // No devicePixelRatio anywhere: the PowerShell below is DPI-unaware, so its
  // coordinate space IS the CSS-pixel space window.screenX/outerHeight report.
  // Scaling by dpr once put the cursor 24px below the button and off the screen.
  // --- hover the button ---
  // Drive the pointer with Playwright, not SetCursorPos. Measured 2026-09-14: the
  // OS cursor moved (GetCursorPos agreed) but the renderer never saw it - the same
  // TD stayed :hover even with the cursor parked off-screen - so the "hovered row"
  // in an early capture was a stale state from the login clicks, not the pointer.
  // CDP input goes through the browser process, which is also what draws the
  // native tooltip, so this is the path that can produce one at all.
  const probeHover = () =>
    page.evaluate(() => {
      const chain = Array.from(document.querySelectorAll(':hover'));
      const deep = chain[chain.length - 1];
      if (!deep) return null;
      const btn = deep.closest('button');
      return {
        tag: deep.tagName,
        title: btn ? btn.getAttribute('title') : null,
        isTarget: !!btn && btn.getAttribute('data-obrs892') === '1',
      };
    });

  await btn.evaluate((el) => el.setAttribute('data-obrs892', '1'));
  const want = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(want.x - 120, want.y - 120);
  await page.waitForTimeout(200);
  await page.mouse.move(want.x, want.y, { steps: 12 }); // a real approach, not a teleport
  await page.waitForTimeout(400);
  const hover = await probeHover();
  console.log('hovering:', hover);
  if (!hover || !hover.isTarget) throw new Error('the pointer is not on the button: ' + JSON.stringify(hover));
  measured.cursorRestsOn = hover;

  // Chrome draws the tooltip from the BROWSER process's own mouse tracking, which
  // CDP input does not feed. So: CDP puts the renderer in :hover (proven above),
  // and the real OS cursor is parked on the same point so the browser process
  // agrees something is being hovered.
  await page.bringToFront();
  const parked = moveCursor(Math.round(frame.sx + want.x), Math.round(frame.sy + frame.chromeH + want.y));
  console.log('OS cursor parked at', parked, 'want(css)', want, 'chromeH', frame.chromeH);
  measured.osCursor = parked;
  measured.hoverAfterOsMove = await probeHover();
  console.log('hover after the OS move:', measured.hoverAfterOsMove);

  // Let the native tooltip appear, then photograph the screen.
  await page.waitForTimeout(2500);
  console.log('AFTER screen', shootScreen(path.join(OUT, 'OBRS-892-AFTER-icon-button-tooltip.png')));

  // --- BEFORE: the same running build with the attribute origin/dev lacks ---
  const stripped = await page.evaluate(() => {
    const els = document.querySelectorAll('button[title]');
    els.forEach((el) => el.removeAttribute('title'));
    return els.length;
  });
  measured.titlesStrippedForBefore = stripped;
  measured.titleAttrAfterStrip = await btn.getAttribute('title');
  await page.mouse.move(want.x - 120, want.y - 120);
  await page.waitForTimeout(200);
  await page.mouse.move(want.x, want.y, { steps: 12 });
  await page.waitForTimeout(2500);
  console.log('BEFORE screen', shootScreen(path.join(OUT, 'OBRS-892-BEFORE-icon-button-tooltip.png')));

  writeFileSync(path.join(OUT, 'measured.json'), JSON.stringify(measured, null, 2));
  console.log(JSON.stringify(measured, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
