/**
 * OBRS-714 evidence -- every public auth page has an in-tab way home, and it is
 * really clickable where it sits.
 *
 * Run it twice against the SAME `ng serve`, checking the 8 templates +
 * shared.module.ts out to their `origin/dev` shape in between:
 *
 *   OBRS_VARIANT=AFTER  node e2e/capture-obrs-714-auth-exits.mjs
 *   git checkout origin/dev -- <the 8 templates> src/app/shared/shared.module.ts
 *   OBRS_VARIANT=BEFORE node e2e/capture-obrs-714-auth-exits.mjs
 *   git checkout HEAD -- <the same files>
 *
 * What each measurement claims, and what it does not:
 *
 *  - **`inViewport` is read off getBoundingClientRect**, not off a scroll that a
 *    `click()` performed for us. OBRS-463 shipped a control that only Playwright
 *    could reach, because `click()` scrolls first and then reports success.
 *  - **`hitTestable` is `elementFromPoint` at the element's own centre.** It is
 *    the question "would a finger landing here hit this link", and it answers NO
 *    when something overlays it -- which is exactly what the global error alert
 *    does, so the alert is dismissed by clicking its real OK button first.
 *  - **The tap proof at the end is a real `page.tap()`** on a touch-enabled
 *    mobile context, with no `force`, followed by a URL assertion. That is the
 *    only step that proves the link NAVIGATES rather than merely exists.
 *
 * There is no backend on this lane, so the OTP page's `sendOtp()` fails and the
 * shared error alert opens -- the owner's exact 2026-07-26 report. That is
 * captured, then dismissed, because the card's claim is about the page a user is
 * left on AFTER the alert is closed.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const VARIANT = process.env.OBRS_VARIANT ?? 'AFTER';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve(`e2e/out/obrs-714/${VARIANT.toLowerCase()}`);

const ROUTES = [
  ['login', '/login'],
  ['login-mobile', '/login-mobile'],
  ['register', '/register'],
  ['otp-validate', '/otp/login/0924362756'],
  ['forget-password', '/forget-password'],
  ['reset-password', '/reset-password'],
  ['verify-email', '/verify-email'],
  ['change-email-confirm', '/change-email/confirm'],
];
const VIEWPORTS = [
  ['desktop', { width: 1536, height: 864 }, false],
  ['mobile', { width: 390, height: 844 }, true],
];
const LANGS = ['th', 'en', 'zh'];
const THEMES = ['light', 'dark'];

/** Only these get a PNG -- the matrix below measures all 96 combinations. */
const SHOT_ROUTES = new Set(['otp-validate', 'login']);

const rows = [];
const failures = [];

/** The probe that runs inside the page. Returns null when the element is absent. */
const PROBE = `(sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2);
  const cy = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  return {
    href: el.getAttribute('href'),
    target: el.getAttribute('target'),
    box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
    hitTestable: !!hit && el.contains(hit),
    text: (el.textContent || '').trim().slice(0, 40),
  };
}`;

async function contextFor(browser, viewport, hasTouch, lang, theme) {
  const ctx = await browser.newContext({ viewport, hasTouch, isMobile: hasTouch });
  await ctx.addInitScript(
    ([l, t]) => {
      window.localStorage.setItem('app_language', l);
      window.localStorage.setItem('app_admin_theme', t);
    },
    [lang, theme],
  );
  return ctx;
}

/** Close the shared error alert the way a user does -- its own OK button. */
async function dismissAlert(page) {
  let dismissed = 0;
  // Six rounds, not one: with no backend the OTP page raises the alert from more
  // than one failed call, and a second one can open AFTER the first is closed.
  // A single click left the logo covered in 10 of 96 combinations - which the
  // hit test caught, and which is exactly what the hit test is for.
  for (let i = 0; i < 6; i++) {
    const ok = page.locator('.swal2-confirm');
    if (!(await ok.isVisible().catch(() => false))) {
      await page.waitForTimeout(500);
      if (!(await ok.isVisible().catch(() => false))) break;
    }
    await ok.click().catch(() => {});
    dismissed++;
    await page.locator('.swal2-container').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  return dismissed;
}

async function measure(page, key, route, viewportName, lang, theme) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const alerts = await dismissAlert(page);
  await page.waitForTimeout(250);

  const logo = await page.evaluate(`(${PROBE})('.logo-section a')`);
  const textExit = await page.evaluate(`(${PROBE})('a[href="/login-mobile"]')`);
  // Context for the mobile fold: if the page's OWN primary action is below it too,
  // an exit below the fold is a long page, not an unreachable control.
  const submit = await page.evaluate(`(${PROBE})('button[type="submit"]')`);
  const inTabHrefs = await page.evaluate(
    `[...document.querySelectorAll('a[href]')].filter(a => a.getAttribute('target') !== '_blank').map(a => a.getAttribute('href'))`,
  );
  const bg = await page.evaluate(`getComputedStyle(document.body).backgroundColor`);
  const htmlLang = await page.evaluate(`document.documentElement.lang`);

  const row = { variant: VARIANT, page: key, viewport: viewportName, lang, theme, htmlLang, bodyBg: bg, alertsDismissed: alerts, logo, textExit, submit, inTabHrefs };
  rows.push(row);

  // A page with no in-tab exit at all is the defect this card exists for.
  if (!inTabHrefs.includes('/')) {
    failures.push(`${key} @ ${viewportName}/${lang}/${theme}: no in-tab link to /`);
  } else if (!logo || !logo.inViewport || !logo.hitTestable) {
    failures.push(`${key} @ ${viewportName}/${lang}/${theme}: logo link present but inViewport=${logo && logo.inViewport} hitTestable=${logo && logo.hitTestable}`);
  }

  console.log(
    `${VARIANT} ${viewportName}/${lang}/${theme} ${key.padEnd(20)} ` +
      `logo=${logo ? `${logo.href} box=${logo.box.join(',')} inVP=${logo.inViewport} hit=${logo.hitTestable}` : 'ABSENT'} ` +
      `exit=${textExit ? `${textExit.href} inVP=${textExit.inViewport} hit=${textExit.hitTestable} "${textExit.text}"` : '-'} ` +
      `submitInVP=${submit ? submit.inViewport : '-'} ` +
      `alerts=${alerts} hrefs=${JSON.stringify(inTabHrefs)}`,
  );
  return row;
}

/** The one step that proves NAVIGATION: a real finger tap, no force, then the URL. */
async function tapProof(browser) {
  const ctx = await contextFor(browser, { width: 390, height: 844 }, true, 'th', 'light');
  const page = await ctx.newPage();
  const results = {};

  for (const [label, selector, expected] of [
    ['logo', '.logo-section a', '/'],
    ['text-exit', 'a[href="/login-mobile"]', '/login-mobile'],
  ]) {
    await page.goto(`${BASE}/otp/login/0924362756`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await dismissAlert(page);
    const target = page.locator(selector).first();
    if (!(await target.isVisible().catch(() => false))) {
      results[label] = 'ABSENT — nothing to tap';
      console.log(`${VARIANT} tap ${label}: ABSENT`);
      continue;
    }
    await target.tap();
    await page.waitForTimeout(1200);
    const landed = new URL(page.url()).pathname;
    results[label] = { expected, landed, ok: landed === expected };
    console.log(`${VARIANT} tap ${label}: expected ${expected} landed ${landed} ${landed === expected ? 'OK' : 'MISMATCH'}`);
    if (landed !== expected) failures.push(`tap ${label}: expected ${expected}, landed ${landed}`);
  }

  await ctx.close();
  return results;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const [viewportName, viewport, hasTouch] of VIEWPORTS) {
    for (const lang of LANGS) {
      for (const theme of THEMES) {
        const ctx = await contextFor(browser, viewport, hasTouch, lang, theme);
        const page = await ctx.newPage();
        for (const [key, route] of ROUTES) {
          await measure(page, key, route, viewportName, lang, theme);
          if (SHOT_ROUTES.has(key)) {
            await page.screenshot({
              path: path.join(OUT, `${VARIANT}-${key}-${viewportName}-${lang}-${theme}.png`),
              fullPage: false,
            });
          }
        }
        await ctx.close();
      }
    }
  }

  const taps = await tapProof(browser);
  await browser.close();

  await writeFile(path.join(OUT, `measurements-${VARIANT}.json`), JSON.stringify({ variant: VARIANT, base: BASE, rows, taps, failures }, null, 2));

  console.log(`\n${VARIANT}: ${rows.length} measurements, ${failures.length} failures`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  // BEFORE is EXPECTED to fail — it is the defect. Only AFTER is a gate.
  if (VARIANT === 'AFTER' && failures.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
