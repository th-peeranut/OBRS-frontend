/**
 * OBRS-1735 + OBRS-1736 — AFTER evidence for the two cards that shared one branch.
 *
 *   npx ng serve --port 4322
 *   node e2e/capture-obrs-1735-1736-range-sweep.mjs
 *
 * OBRS-1735: the swept `app-admin-date-range-picker` on all 9 report pages, and
 * the behaviour AC2 turns on — a half-picked range must NOT wipe a range error
 * that is already on screen (obrs-scrutinize found the picker doing exactly that).
 * OBRS-1736: the settlements driver-cash sub-filter refusing a span over 366 days,
 * which it used to accept silently.
 *
 * Capture script only (OBRS-1704): it photographs and prints what it saw, and
 * fails only when there was nothing to photograph.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4322';
const OUT = path.resolve(
  '..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1735-1736'
);
const ok = (data) => ({ code: 200, message: 'OK', data });

const PAGES = [
  'reports', 'revenue-analytics', 'booking-trend', 'route-performance',
  'customer-behavior', 'ops-efficiency', 'settlements', 'refund-void-report',
  'cash-online-reconciliation-report',
];

async function stub(page, theme) {
  await page.addInitScript(([mode]) => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('app_admin_theme', mode);
    localStorage.setItem('auth_token', 'obrs-1735-capture-token');
    localStorage.setItem('auth_username', 'owner@capture.local');
    localStorage.setItem('auth_roles', JSON.stringify(['owner', 'admin']));
  }, [theme]);
  // Every page here changed only its FILTER row, so the fixture is the minimum
  // that lets the page render — not a re-derivation of each report's own data.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) })
  );
  await page.route('**/accounts.google.com/**', (route) => route.abort());
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const seen = {};

// OBRS-1735 — one shot per swept page: exactly one range trigger, no old pair
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(180000);
  await stub(page, 'light');
  for (const slug of PAGES) {
    await page.goto(BASE + '/admin/' + slug, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('app-admin-date-range-picker .p-inputtext', { state: 'visible', timeout: 120000 });
    await page.waitForTimeout(400);
    seen[slug] = await page.evaluate(() => ({
      rangePickers: document.querySelectorAll('app-admin-date-range-picker').length,
      // the sub-filter on settlements is OBRS-1753's job, so it is EXPECTED to
      // still hold two of the old single-date fields; every other page holds none
      legacyDateFields: document.querySelectorAll('.app-date-field:not(.app-date-field--range)').length,
    }));
    await page.screenshot({ path: path.join(OUT, 'after-1735-' + slug + '.png') });
  }
  await ctx.close();
}

// OBRS-1735 — AC2: a half-picked range must not wipe a range error already shown
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(180000);
  await stub(page, 'light');
  await page.goto(BASE + '/admin/reports', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('app-admin-date-range-picker .p-inputtext', { state: 'visible', timeout: 120000 });

  // page.evaluate runs outside Angular's zone, so every drive below has to ask
  // for change detection itself or the DOM never catches up with the field.
  const render = () => page.evaluate(() => {
    window.ng.applyChanges(window.ng.getComponent(document.querySelector('app-reports-page')));
  });
  const shownError = () => page.evaluate(() => document.querySelector('.admin-error')?.textContent?.trim() ?? '');

  // drive a >366-day span through the picker's own output, then photograph the error
  await page.evaluate(() => {
    const el = document.querySelector('app-admin-date-range-picker');
    window.ng.getComponent(el).rangeChange.emit({ from: new Date(2024, 0, 1), to: new Date(2026, 0, 1) });
  });
  await render();
  await page.waitForTimeout(500);
  const errorBefore = await shownError();
  await page.screenshot({ path: path.join(OUT, 'after-1735-ac2-error-shown.png') });

  // the half-picked state the picker used to forward: it must now reach nobody
  const emittedOnHalfPick = await page.evaluate(() => {
    const cmp = window.ng.getComponent(document.querySelector('app-admin-date-range-picker'));
    let got = null;
    const sub = cmp.rangeChange.subscribe((r) => { got = r; });
    cmp.onValueChange([new Date(2026, 5, 1), null]);
    sub.unsubscribe();
    return got;
  });
  await render();
  await page.waitForTimeout(400);
  const errorAfter = await shownError();
  await page.screenshot({ path: path.join(OUT, 'after-1735-ac2-error-survives-half-pick.png') });
  seen.ac2 = { errorBefore, errorAfter, emittedOnHalfPick, held: !!errorBefore && errorBefore === errorAfter };
  await ctx.close();
}

// OBRS-1736 — the driver-cash sub-filter refuses a span over 366 days
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(180000);
  await stub(page, 'light');
  await page.goto(BASE + '/admin/settlements', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="driver-cash-days-filter"]', { state: 'visible', timeout: 120000 });
  await page.waitForTimeout(400);

  const drive = (from, to) => page.evaluate(([f, t]) => {
    const cmp = window.ng.getComponent(document.querySelector('app-settlements-page'));
    cmp.onDriverCashFromDateChange(new Date(f));
    cmp.onDriverCashToDateChange(new Date(t));
    return cmp.driverCashRangeError;
  }, [from, to]);

  const atCap = await drive('2026-01-01T00:00:00', '2027-01-02T00:00:00');   // 366 days
  await page.waitForTimeout(300);
  await page.locator('[data-testid="driver-cash-days-filter"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'after-1736-at-cap-accepted.png') });

  const pastCap = await drive('2026-01-01T00:00:00', '2027-01-03T00:00:00'); // 367 days
  await page.waitForTimeout(300);
  const shown = await page.evaluate(() =>
    Array.from(document.querySelectorAll('app-driver-cash-days-list .admin-error')).map((n) => n.textContent.trim())
  );
  await page.locator('[data-testid="driver-cash-days-filter"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'after-1736-past-cap-refused.png') });
  seen.driverCash = { atCap, pastCap, shown };
  await ctx.close();
}

await browser.close();
await writeFile(path.join(OUT, 'result.json'), JSON.stringify(seen, null, 2));
console.log(JSON.stringify(seen, null, 2));

const problems = [];
for (const slug of PAGES) {
  if (seen[slug]?.rangePickers !== 1) problems.push(slug + ': ' + seen[slug]?.rangePickers + ' range picker(s), expected 1');
  const expectedLegacy = slug === 'settlements' ? 2 : 0;
  if (seen[slug]?.legacyDateFields !== expectedLegacy)
    problems.push(slug + ': ' + seen[slug]?.legacyDateFields + ' legacy date field(s), expected ' + expectedLegacy);
}
if (!seen.ac2?.held) problems.push('AC2: the error did not survive the half-pick: ' + JSON.stringify(seen.ac2));
if (seen.ac2?.emittedOnHalfPick !== null) problems.push('AC2: the picker emitted on a half-pick: ' + JSON.stringify(seen.ac2?.emittedOnHalfPick));
if (seen.driverCash?.atCap !== '') problems.push('1736: a 366-day span was refused: ' + seen.driverCash?.atCap);
if (!seen.driverCash?.shown?.length) problems.push('1736: a 367-day span showed no message');

if (problems.length) { console.error('FAIL:\n  ' + problems.join('\n  ')); process.exit(2); }
console.log('OK: ' + (PAGES.length + 4) + ' image(s) in ' + OUT);
