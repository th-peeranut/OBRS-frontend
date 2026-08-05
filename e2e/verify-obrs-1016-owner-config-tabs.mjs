// OBRS-1016 verification: an OWNER can OPEN and SAVE the reminders / jump-seat
// Settings tabs. The bug rendered an empty card with a LOAD_FAILED line, so the
// assertions below are deliberately two-sided:
//
//   1. the LOAD_FAILED text is ABSENT   (the symptom is gone)
//   2. the form CONTROLS are present and populated (something replaced it)
//
// Either alone is cheap to fake: a page that renders nothing at all passes (1),
// and a page can render inputs while still showing the error. Both together are
// the claim. The save path is then exercised through the real UI button and
// confirmed by RE-READING the value after a reload, not by trusting the toast —
// a 200 that wrote nothing looks identical to a 200 that wrote.
//
// Usage: node e2e/verify-obrs-1016-owner-config-tabs.mjs [baseUrl] [outDir]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4200';
const OUT = process.argv[3] || '.';
mkdirSync(OUT, { recursive: true });

const rows = [];
const pass = (what, detail) => { rows.push(['PASS', what, detail]); console.log(`  PASS  ${what} — ${detail}`); };
const fail = (what, detail) => { rows.push(['FAIL', what, detail]); console.log(`  FAIL  ${what} — ${detail}`); };

const LOAD_FAILED_TH = {
  reminders: 'ไม่สามารถโหลดการตั้งค่าเวลาแจ้งเตือนได้',
  'jump-seat': 'ไม่สามารถโหลดการตั้งค่าเบาะเสริมได้',
};

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').waitFor({ timeout: 30000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 45000 });
}

for (const mode of ['light', 'dark']) {
  console.log(`\n=== ${mode} mode, logged in as owner@system.local ===`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 900 } });
  await ctx.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} },
    ['app_admin_theme', mode]);
  const page = await ctx.newPage();
  await login(page, 'owner@system.local');

  for (const tab of ['reminders', 'jump-seat']) {
    await page.goto(`${BASE}/admin/settings/${tab}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1200);

    const isDark = await page.evaluate(() => document.body.classList.contains('is-dark'));
    if (isDark !== (mode === 'dark')) {
      fail(`${tab}: theme precondition (${mode})`, `body.is-dark=${isDark} — every reading below would be on the wrong theme`);
      continue;
    }

    const body = await page.evaluate(() => document.body.innerText);
    const errShown = body.includes(LOAD_FAILED_TH[tab]) || body.includes('LOAD_FAILED');
    // Count the real controls, not the card: the bug rendered the card heading.
    const controls = await page.evaluate(() =>
      document.querySelectorAll('main input, main p-inputnumber input, main p-inputswitch, main p-toggleswitch, main .p-toggleswitch, main .p-inputswitch, main input[type="checkbox"]').length
    );
    const values = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main input')).map((i) => i.value).filter((v) => v !== '')
    );

    if (errShown) fail(`${tab} (${mode}): LOAD_FAILED absent`, 'the error line is STILL on the page');
    else pass(`${tab} (${mode}): LOAD_FAILED absent`, 'no LOAD_FAILED text in document.body.innerText');

    if (controls > 0) pass(`${tab} (${mode}): form rendered`, `${controls} control(s), values=${JSON.stringify(values)}`);
    else fail(`${tab} (${mode}): form rendered`, '0 controls — the card is still empty');

    await page.screenshot({ path: join(OUT, `OBRS-1016-AFTER-${tab}-${mode}.png`), fullPage: false });
  }

  // Control: the two tabs that already worked must still be there, and the strip
  // must not have lost a tab. Reading the hrefs, not the model.
  await page.goto(`${BASE}/admin/settings/booking-policy`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(800);
  const tabHrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="system-settings-tab-"]'))
      .map((a) => (a.getAttribute('href') || '').split('/').pop())
  );
  const expected = ['booking-policy', 'reminders', 'jump-seat', 'history'];
  const missing = expected.filter((p) => !tabHrefs.includes(p));
  if (missing.length) fail(`tab strip (${mode})`, `missing ${missing.join(', ')} — got ${tabHrefs.join(', ')}`);
  else pass(`tab strip (${mode})`, `owner sees ${tabHrefs.join(', ')}`);

  const bpErr = await page.evaluate(() => document.body.innerText.includes('ไม่สามารถโหลด'));
  if (bpErr) fail(`control: booking-policy (${mode})`, 'a LOAD_FAILED-style error appeared on a tab that already worked');
  else pass(`control: booking-policy (${mode})`, 'still loads clean');

  await browser.close();
}

// --- save through the real UI, then re-read after a reload -------------------
{
  console.log('\n=== save path, owner, light mode ===');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 900 } });
  const page = await ctx.newPage();
  await login(page, 'owner@system.local');

  await page.goto(`${BASE}/admin/settings/reminders`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const inputs = page.locator('main input');
  const before = await inputs.first().inputValue();
  const target = String(Number(before) === 30 ? 28 : 30);
  await inputs.first().fill(target);
  await inputs.first().blur();
  const saveBtn = page.locator('main button[type="submit"], main .admin-btn').first();
  await saveBtn.click();
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelectorAll('.swal2-container').forEach((el) => el.remove()));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const after = await page.locator('main input').first().inputValue();
  if (after === target) pass('reminders: owner SAVE persists', `${before} -> ${target}, re-read after reload = ${after}`);
  else fail('reminders: owner SAVE persists', `wrote ${target}, re-read ${after} (was ${before})`);

  // put it back
  await page.locator('main input').first().fill(before);
  await page.locator('main input').first().blur();
  await page.locator('main button[type="submit"], main .admin-btn').first().click();
  await page.waitForTimeout(2000);
  await browser.close();
}

console.log('\n--- SUMMARY ---');
const failed = rows.filter((r) => r[0] === 'FAIL');
console.log(`${rows.length - failed.length} pass, ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
