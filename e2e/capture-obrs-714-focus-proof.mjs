/**
 * OBRS-714 evidence -- the logo is a LINK now, shown with the browser's own focus ring.
 *
 * A plain before/after screenshot of these pages is worthless: the fix wraps the
 * logo in an `<a>` and changes not one pixel at rest (BEFORE and AFTER
 * `login-desktop-en-dark.png` came out the same byte length). So this walks the
 * page with Tab, exactly as a keyboard user does, and photographs where focus
 * lands. BEFORE, Tab never reaches the logo -- there is nothing focusable there.
 * AFTER, it stops on the anchor and Chrome draws its own ring. Nothing is
 * injected or drawn by this script.
 *
 *   OBRS_BASE_URL=http://localhost:4365 OBRS_VARIANT=AFTER  node e2e/capture-obrs-714-focus-proof.mjs
 *   OBRS_BASE_URL=http://localhost:5274 OBRS_VARIANT=BEFORE node e2e/capture-obrs-714-focus-proof.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const VARIANT = process.env.OBRS_VARIANT ?? 'AFTER';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve(`e2e/out/obrs-714/${VARIANT.toLowerCase()}`);
const MAX_TABS = 25;

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
  await ctx.addInitScript(() => window.localStorage.setItem('app_language', 'th'));
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  const order = [];
  let reachedLogo = false;
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return {
        tag: el.tagName,
        cls: String(el.className || '').slice(0, 40),
        href: el.getAttribute ? el.getAttribute('href') : null,
        isLogoLink: !!el.closest && !!el.closest('.logo-section'),
      };
    });
    order.push(at);
    if (at && at.isLogoLink) {
      reachedLogo = true;
      await page.screenshot({ path: path.join(OUT, `${VARIANT}-login-logo-focus-ring.png`) });
      console.log(`${VARIANT}: Tab #${i + 1} landed on the logo — ${at.tag} href=${at.href}`);
      break;
    }
  }

  if (!reachedLogo) {
    await page.screenshot({ path: path.join(OUT, `${VARIANT}-login-logo-focus-ring.png`) });
    console.log(`${VARIANT}: ${MAX_TABS} tabs, focus NEVER reached the logo — nothing focusable there.`);
  }
  console.log(`${VARIANT} tab order: ${JSON.stringify(order.map((o) => (o ? `${o.tag}${o.href ? '[' + o.href + ']' : ''}` : 'null')))}`);

  await ctx.close();
  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
