// OBRS-577 live verification against SIT — measured, not eyeballed.
//
// Account: customer@system.local has 37 bookings (measured via the API), so the
// new page size of 20 makes every load-more path reachable: page 1 = 20 rows,
// one append = 37, button then gone.
//
// The mutation-reload window (the regression this run nearly shipped twice) is
// exercised via the reschedule dialog's ABANDON path — opening then dismissing
// the dialog dispatches rescheduleAbandoned$ -> invokeLoadMyBookingsApi({
// preserveWindow: true }), the same reload as cancel/change-seat/change-stop,
// with ZERO data mutation on a shared SIT.
//
// i18n uses the REAL switcher (.navbar-lang-trigger -> .navbar-lang-item) and
// the REAL storage key (app_language). An earlier version of this script used
// invented keys, silently never switched, and reported three Thai reads as
// three passing locales.
//
// Usage: node e2e/verify-obrs577-load-more.mjs <baseUrl> <outDir>

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4229';
const OUT = process.argv[3] || 'tmp/out-577';
mkdirSync(OUT, { recursive: true });

const rows = [];
const fails = [];
function check(name, ok, detail) {
  rows.push({ name, ok, detail });
  if (!ok) fails.push(`${name} :: ${detail}`);
}

const CARD = '.booking-card:not(.booking-card--skeleton)';
const COUNT = '.my-bookings__count';
const MORE = '.my-bookings__load-more button';
const RAWKEY = /MY_BOOKINGS\.|\{\{/;

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').waitFor({ timeout: 90000 });
  await page.locator('input[type="email"]').fill('customer@system.local');
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000 });
  await page.goto(`${BASE}/my-bookings`, { waitUntil: 'domcontentloaded' });
  await page.locator(CARD).first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// count every request the page makes for the booking list, so "it appended"
// can never be claimed without a request having actually gone out.
const listReqs = [];
page.on('request', (r) => { if (r.url().includes('/bookings/me')) listReqs.push(r.url()); });

await login(page);

// ── 1. first page = 20 rows, count line, button ──────────────────────────────
const n0 = await page.locator(CARD).count();
check('AC1 first page renders exactly 20 rows (size=100 hardcode is gone)', n0 === 20, `rows=${n0}`);
const countText0 = ((await page.locator(COUNT).textContent().catch(() => '')) ?? '').trim();
check('AC4 count line shows loaded 20 of true total 37', countText0.includes('20') && countText0.includes('37'), `"${countText0}"`);
check('AC5 (th) no raw key in count line', countText0.length > 0 && !RAWKEY.test(countText0), `"${countText0}"`);
const moreVisible = await page.locator(MORE).isVisible().catch(() => false);
check('AC4 Load-more button visible while rows remain', moreVisible, `visible=${moreVisible}`);
await page.screenshot({ path: join(OUT, 'AFTER-01-first-page.png') });

// ── 2. the click must issue a request and APPEND ─────────────────────────────
const reqsBefore = listReqs.length;
const firstRowBefore = await page.locator(CARD).first().innerText();
const scrollBefore = await page.evaluate(() => window.scrollY);
let overlaySeen = false;

await page.locator(MORE).scrollIntoViewIfNeeded();
await page.locator(MORE).click();
for (let i = 0; i < 24; i++) {
  const o = await page.locator('.p-dialog-mask, .loading-overlay, .p-component-overlay').count().catch(() => 0);
  if (o > 0) overlaySeen = true;
  if ((await page.locator(CARD).count()) > 20) break;
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1000);

const newReqs = listReqs.slice(reqsBefore);
check('the Load-more click actually issues an HTTP request', newReqs.length > 0, `requests=${JSON.stringify(newReqs)}`);
check('the request asks for page=1&size=20', newReqs.some((u) => u.includes('page=1') && u.includes('size=20')), `requests=${JSON.stringify(newReqs)}`);

const n1 = await page.locator(CARD).count();
check('AC1 append reaches the full 37 rows', n1 === 37, `rows=${n1}`);
const firstRowAfter = await page.locator(CARD).first().innerText();
check('AC1 append does NOT replace — row 1 unchanged', firstRowAfter === firstRowBefore, 'first card identity');
const scrollAfter = await page.evaluate(() => window.scrollY);
check('a11y no jump to top of page on append', scrollAfter >= scrollBefore, `${scrollBefore} -> ${scrollAfter}`);
check('load-more raises no full-page blocking overlay', !overlaySeen, `overlaySeen=${overlaySeen}`);

const countText1 = ((await page.locator(COUNT).textContent().catch(() => '')) ?? '').trim();
check('AC4 count line switches to the all-loaded wording', countText1 !== countText0 && countText1.includes('37'), `"${countText1}"`);
const moreGone = !(await page.locator(MORE).isVisible().catch(() => false));
check('AC4 Load-more button disappears on the last page', moreGone, `stillVisible=${!moreGone}`);
await page.screenshot({ path: join(OUT, 'AFTER-02-appended-37.png') });

// ── 3. AC3 filter change resets AND the count is the FILTERED total ─────────
// API ground truth (measured): expired=23, confirmed=13, cancelled=1, total=37
const pills = page.locator('.filter-pill');
const pillTexts = await pills.allInnerTexts();
let confirmedIdx = pillTexts.findIndex((t) => /ยืนยัน|Confirm|确认/i.test(t.trim()));
check('a "confirmed" status pill exists', confirmedIdx >= 0, `pills=${JSON.stringify(pillTexts)}`);
if (confirmedIdx >= 0) {
  await pills.nth(confirmedIdx).click();
  await page.waitForTimeout(3000);
  const nf = await page.locator(CARD).count();
  check('AC3 filter change replaces the appended list (13 rows, not 37)', nf === 13, `rows=${nf}`);
  const countF = ((await page.locator(COUNT).textContent().catch(() => '')) ?? '').trim();
  check('AC3/AC4 count line shows the FILTERED total 13, never 37', countF.includes('13') && !countF.includes('37'), `"${countF}"`);
  check('AC4 no stuck Load-more on a single-page filter', !(await page.locator(MORE).isVisible().catch(() => false)), 'button hidden');
  await page.screenshot({ path: join(OUT, 'AFTER-03-filtered-confirmed.png') });
  await pills.nth(0).click();
  await page.waitForTimeout(3000);
}

// ── 4. REGRESSION GUARD: a preserveWindow reload must NOT collapse to 20 ────
if ((await page.locator(CARD).count()) === 20 && (await page.locator(MORE).isVisible().catch(() => false))) {
  await page.locator(MORE).scrollIntoViewIfNeeded();
  await page.locator(MORE).click();
  await page.waitForTimeout(3500);
}
const nWindow = await page.locator(CARD).count();
check('window re-established (37 rows) before the reload test', nWindow === 37, `rows=${nWindow}`);

let openedDialog = false;
const rescheduleBtn = page.getByRole('button', { name: /เลื่อน|Reschedule|改期/i }).first();
if (await rescheduleBtn.isVisible().catch(() => false)) {
  await rescheduleBtn.click();
  await page.waitForTimeout(2500);
  openedDialog = await page.locator('.p-dialog, [role="dialog"]').first().isVisible().catch(() => false);
  if (openedDialog) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const closeBtn = page.locator('.p-dialog-header-close, button[aria-label="Close"]').first();
    if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
    await page.waitForTimeout(4000);
    const nAfter = await page.locator(CARD).count();
    check('REGRESSION GUARD: preserveWindow reload keeps the 37-row window (must NOT collapse to 20)', nAfter === 37, `rows=${nAfter}`);
    await page.screenshot({ path: join(OUT, 'AFTER-04-window-after-reload.png') });
  }
}
if (!openedDialog) check('reschedule dialog reachable for the window test', false, 'no reschedule dialog opened — window test NOT performed');

// ── 5. i18n via the REAL switcher, live (no reload) ──────────────────────────
const seen = {};
for (const idx of [0, 1, 2]) {
  await page.locator('.navbar-lang-trigger').first().click();
  await page.waitForTimeout(400);
  const items = page.locator('.navbar-lang-item');
  const cnt = await items.count();
  if (idx >= cnt) { check(`AC5 live switch: language item #${idx} exists`, false, `items=${cnt}`); continue; }
  const endonym = (await items.nth(idx).innerText()).trim();
  await items.nth(idx).click();
  await page.waitForTimeout(1800);
  const lang = await page.evaluate(() => localStorage.getItem('app_language'));
  const c = ((await page.locator(COUNT).textContent().catch(() => '')) ?? '').trim();
  const b = ((await page.locator(MORE).textContent().catch(() => '')) ?? '').trim();
  seen[lang] = c;
  check(
    `AC5 LIVE switch to ${lang} (${endonym}): count line translated, no raw key`,
    !!lang && c.length > 0 && !RAWKEY.test(c) && !RAWKEY.test(b),
    `app_language=${lang} count="${c}" button="${b}"`
  );
  await page.screenshot({ path: join(OUT, `AFTER-05-live-${lang}.png`) });
}
const distinct = new Set(Object.values(seen));
check('AC5 the three locales actually render DIFFERENT text (not all Thai)', distinct.size === 3, `by-locale=${JSON.stringify(seen)}`);

// ── 6. i18n cold load per locale, real storage key ──────────────────────────
const cold = {};
for (const code of ['th', 'en', 'zh']) {
  const c2 = await browser.newContext({ viewport: { width: 1536, height: 864 } });
  await c2.addInitScript((lang) => { try { localStorage.setItem('app_language', lang); } catch {} }, code);
  const p2 = await c2.newPage();
  await login(p2);
  const got = await p2.evaluate(() => localStorage.getItem('app_language'));
  const ct = ((await p2.locator(COUNT).textContent().catch(() => '')) ?? '').trim();
  const bt = ((await p2.locator(MORE).textContent().catch(() => '')) ?? '').trim();
  cold[code] = ct;
  check(
    `AC5 COLD load ${code}: precondition landed and text is translated`,
    got === code && ct.length > 0 && !RAWKEY.test(ct) && !RAWKEY.test(bt),
    `app_language=${got} count="${ct}" button="${bt}"`
  );
  await p2.screenshot({ path: join(OUT, `AFTER-06-cold-${code}.png`) });
  await c2.close();
}
check('AC5 cold loads render three DIFFERENT locales', new Set(Object.values(cold)).size === 3, `cold=${JSON.stringify(cold)}`);

await browser.close();

console.log('\n=== OBRS-577 live verification ===');
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  [${r.detail}]`);
console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} passed`);
if (fails.length) {
  console.log('\nFAILURES:');
  for (const f of fails) console.log('  - ' + f);
  process.exitCode = 1;
}
