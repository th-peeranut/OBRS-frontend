/**
 * OBRS-1023 visual evidence — the customer-facing departure-date field, in each
 * of the three shipped languages.
 *
 * Run TWICE against the same dev server: once with the two templates reverted
 * to `dateFormat="dd/mm/yy"` (BEFORE) and once with the fix in place (AFTER).
 * `--label` names the pass; nothing else changes between the two runs, so the
 * pair is a controlled comparison rather than two unrelated screenshots.
 *
 *   node e2e/capture-obrs-1023-dateformat.mjs --label before
 *   node e2e/capture-obrs-1023-dateformat.mjs --label after
 *
 * The script PRINTS the input's text for every language as well as shooting it.
 * The bug is a string, and a string read out of the DOM is evidence a reviewer
 * can check without trusting my eyes on a PNG (CORE.md: measure, don't eyeball).
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4321';
// `e2e/out/` is gitignored on purpose — capture evidence lives on the Jira
// card, which is the review surface; the SCRIPT is what the repo keeps.
const OUT = path.resolve('e2e/out/obrs-1023');
const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error('--label <before|after> is required — an unlabelled pair proves nothing');
  }
  return process.argv[i + 1];
})();

const LANGS = [
  { code: 'th', endonym: 'ไทย' },
  { code: 'en', endonym: 'English' },
  { code: 'zh', endonym: '中文' },
];

/** This runs against a dev server with no backend, so the station-list fetch
 *  fails and SweetAlert throws up "ระบบมีปัญหาชั่วคราว" over the whole page. It
 *  is unrelated to this card but it intercepts every click, and it comes back
 *  after each language switch (the switch re-fetches server-localized data).
 *  Dismissed rather than ignored — the date field itself needs no backend, so
 *  the evidence is still about the format and nothing else. */
async function dismissBackendErrorModal(page) {
  for (let i = 0; i < 4; i++) {
    const confirm = page.locator('.swal2-confirm');
    if (!(await confirm.isVisible().catch(() => false))) {
      return;
    }
    await confirm.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

/** Pick a date from the open panel, one whole week ahead of today, so the shot
 *  never lands on today's cell (which is styled differently and could be
 *  mistaken for the highlight rather than the selection). */
async function pickDateOneWeekOut(page) {
  await page.locator('#home-departure-date').click();
  const panel = page.locator('.p-datepicker-panel');
  await panel.waitFor({ state: 'visible', timeout: 10_000 });

  const target = new Date();
  target.setDate(target.getDate() + 7);
  const day = String(target.getDate());

  // Only cells belonging to THIS month — the panel also renders the trailing
  // days of the previous month and the leading days of the next one, and both
  // carry the same day numbers.
  await panel
    .locator('td:not(.p-datepicker-other-month) > span', { hasText: new RegExp(`^${day}$`) })
    .first()
    .click();
  await panel.waitFor({ state: 'hidden', timeout: 10_000 });
  return target;
}

async function switchLanguageViaUi(page, endonym) {
  await dismissBackendErrorModal(page);
  await page.locator('.navbar-lang-trigger').first().click();
  await page.locator('.navbar-lang-item', { hasText: endonym }).first().click();
  await page.waitForTimeout(400); // the i18n JSON fetch + setTranslation
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await mkdir(OUT, { recursive: true });

// Start from Thai every time, so the language SWITCH is what is being observed
// and not the initial load. A reload between languages would hide exactly the
// half of the defect AC#3 is about.
await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await dismissBackendErrorModal(page);

const picked = await pickDateOneWeekOut(page);
const results = [];

for (const { code, endonym } of LANGS) {
  if (code !== 'th') {
    await switchLanguageViaUi(page, endonym);
  }
  await dismissBackendErrorModal(page);
  const shown = await page.locator('#home-departure-date').inputValue();
  results.push({ lang: code, shown });

  const field = page.locator('#home-departure-date').locator('xpath=ancestor::div[contains(@class,"form-group-obrs")][1]');
  await field.screenshot({ path: path.join(OUT, `${LABEL}-${code}-field.png`) });
}

await page.screenshot({ path: path.join(OUT, `${LABEL}-full.png`), fullPage: false });
await browser.close();

console.log(`\nOBRS-1023 ${LABEL.toUpperCase()} — date picked: ${picked.toDateString()}`);
for (const { lang, shown } of results) {
  console.log(`  ${lang.padEnd(3)} -> "${shown}"`);
}
console.log(`\nshots: ${OUT}`);
