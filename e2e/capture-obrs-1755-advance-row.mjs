/**
 * OBRS-1755 / BR-32 — visual + measured evidence that the advance deduction row
 * is not drawn when nothing was advanced, while box ③ (the form that RECORDS an
 * advance) stays.
 *
 * Owner ruling 2026-09-14, from the AFTER image on the card: a standing
 * `หักเงินที่คนขับขอเบิกไป −0 บาท` is one more line to read before pressing send,
 * on the majority of rounds where no driver asked for cash.
 *
 * Run against the local stack with the OBRS-1755 QA database (schedule 125 is
 * the 01:10 OBRS1755_ROUTE_OUT round the owner screenshotted):
 *
 *   ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev,local \
 *     "-Dspring-boot.run.arguments=--spring.datasource.url=jdbc:postgresql://localhost:5432/obrs1755qa"
 *   npm run start:local
 *   node e2e/capture-obrs-1755-advance-row.mjs --label after
 *
 * Every claim printed is a COUNT from the rendered DOM, and the expected-0 is
 * paired with expected-1 controls on sibling selectors, so a typo'd selector
 * fails loudly instead of reading as "correctly absent".
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const EMAIL = process.env.OBRS_EMAIL ?? 'salesperson@system.local';
const PASSWORD = process.env.OBRS_PASSWORD ?? 'P@ssw0rd';
const OUT = path.resolve('e2e/out/obrs-1755');
const DESKTOP = { width: 1536, height: 864 };

const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error('--label <before|after> is required — an unlabelled pair proves nothing');
  }
  return process.argv[i + 1];
})();

const failures = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`    ${ok ? '✔' : '✘'} ${name}: ${actual} (expected ${expected})`);
  if (!ok) failures.push(`${name}: got ${actual}, expected ${expected}`);
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: DESKTOP });

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('#email').fill(EMAIL);
await page.locator('#password').fill(PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 60_000 });
await page.goto(`${BASE}/staff/sell`, { waitUntil: 'domcontentloaded' });

// The 01:10 OBRS1755_ROUTE_OUT round — a ROUND-cadence counter, no advance recorded.
await page.getByText('01:10').first().click();
await page.getByRole('tab', { name: 'ส่งยอด' }).or(page.getByText('ส่งยอด', { exact: true })).first().click();
await page.locator('[data-testid="remittance-total"], .srt-eq').first().waitFor({ timeout: 30_000 });

const count = (sel) => page.locator(sel).count();

console.log(`\n[${LABEL}] ส่งยอด tab, schedule 01:10 (no advance recorded)`);
// The row under test.
check('remittance-eq-advance rows', await count('[data-testid="remittance-eq-advance"]'), 0);
// Controls on the same screen — these prove the selector language works here.
check('remittance-advance box (③)', await count('[data-testid="remittance-advance"]'), 1);
check('remittance-eq-cash-in row', await count('[data-testid="remittance-eq-cash-in"]'), 1);
check('remittance-eq-return-leg row', await count('[data-testid="remittance-eq-return-leg"]'), 1);

// OBRS-1890 — the same round deducts a whole-round ค่าหัว (57.00, measured on
// schedule 125). It must have a row, and the "no per-head here" note must not
// be denying it: 350 + 300 − 57 has to read as 593 on screen.
check('remittance-eq-per-head row', await count('[data-testid="remittance-eq-per-head"]'), 1);
check('remittance-no-per-head-note', await count('[data-testid="remittance-no-per-head-note"]'), 0);

await page.locator('.srt-eq').first().scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(OUT, `OBRS-1755-${LABEL}-no-advance-row.png`), fullPage: false });

// Typing into box ③ must bring the row straight back: the total may never move
// without a line on screen saying why.
await page.locator('[data-testid="remittance-advance"] input').first().fill('150');
await page.waitForTimeout(300);
check('remittance-eq-advance after typing 150', await count('[data-testid="remittance-eq-advance"]'), 1);
await page.locator('.srt-eq').first().scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(OUT, `OBRS-1755-${LABEL}-advance-row-returns.png`), fullPage: false });

await browser.close();

if (failures.length) {
  console.error(`\n✘ ${failures.length} check(s) failed:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log(`\n✔ all checks passed — images in ${OUT}`);
