/**
 * OBRS-1071 supplementary probe — the two things the main capture does not
 * measure: the labels under a LIVE in-app language switch (not a cold load,
 * which exercises a different path), and whether the Thai labels fit the menu
 * box (`.admin-profile-menu` is `min-width: 160px`, admin-theme.scss:1206).
 */
import { chromium } from '@playwright/test';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const PASSWORD = process.env.SIT_PASSWORD;
if (!PASSWORD || PASSWORD.length !== 8) throw new Error('SIT_PASSWORD missing or wrong length');

const failures = [];
// Compare by VALUE — `===` on two arrays is an identity test and would report
// every correct label list as a failure.
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? '✔' : '✘'} ${name}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
  if (!ok) failures.push(name);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('#email').fill('driver@system.local');
await page.locator('#password').fill(PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 60_000 });
await page.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded' });

async function menuLabels() {
  if ((await page.locator('.admin-profile-menu').count()) === 0) {
    await page.locator('.admin-profile .admin-avatar').click();
    await page.locator('.admin-profile-menu').waitFor({ timeout: 10_000 });
  }
  await page.waitForTimeout(250);
  return page.locator('.admin-profile-menu a span:nth-child(2)').allInnerTexts();
}

async function closeMenu() {
  await page.locator('.admin-content').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(200);
}

// ── Thai (default) + box fit ──────────────────────────────────────────────────
console.log('\n[th — default]');
const th = await menuLabels();
check('labels', th, ['บัญชีของฉัน', 'การจองของฉัน', 'รายงานของฉัน']);

const box = await page.locator('.admin-profile-menu').evaluate((el) => {
  const items = [...el.querySelectorAll('a, button')];
  return {
    menuWidth: Math.round(el.getBoundingClientRect().width),
    // A wrapped label is taller than one line-height; compare each item's height
    // to the shortest one, which is single-line by construction.
    itemHeights: items.map((i) => Math.round(i.getBoundingClientRect().height)),
    overflowing: items.some((i) => i.scrollWidth > i.clientWidth + 1),
  };
});
console.log(`  menu width ${box.menuWidth}px · item heights ${JSON.stringify(box.itemHeights)}`);
check('any item overflowing its box', box.overflowing, false);
check('all items the same height (none wrapped)', new Set(box.itemHeights).size, 1);

// ── Live in-app language switch, no reload ────────────────────────────────────
for (const [lang, expected] of [
  ['en', ['Account', 'My Bookings', 'My Reports']],
  ['zh', ['我的账户', '我的预订', '我的报告']],
]) {
  await closeMenu();
  await page.locator('app-lang-switcher button').first().click();
  await page.waitForTimeout(300);
  const option = page.locator(`[role="menu"] button, .lang-option, app-lang-switcher button`).filter({ hasText: new RegExp(lang === 'en' ? 'EN|English|อังกฤษ' : 'ZH|中文|จีน', 'i') });
  await option.first().click();
  await page.waitForTimeout(600);
  console.log(`\n[${lang} — live switch, no reload]`);
  check('labels', await menuLabels(), expected);
}

// ── Cold load in the last-selected language ───────────────────────────────────
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
console.log('\n[zh — cold load]');
check('labels', await menuLabels(), ['我的账户', '我的预订', '我的报告']);

await browser.close();
console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
if (failures.length > 0) process.exit(1);
