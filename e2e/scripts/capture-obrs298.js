// OBRS-298 evidence capture. Run with the local backend (profile dev,local against the
// isolated obrs298 DB) on :8080 and `npm run start:local` on :4200.
//
//   node e2e/scripts/capture-obrs298.js <outDir> <label>
//
// <label> is BEFORE or AFTER — the ONLY difference between the two runs is which commit
// the backend and frontend are serving. The script asserts what it captured rather than
// trusting the screenshot: a green PNG of the wrong row proves nothing.
const { chromium } = require('@playwright/test');
const path = require('path');

const OUT_DIR = process.argv[2] || '.';
const LABEL = (process.argv[3] || 'AFTER').toUpperCase();
const BASE = 'http://localhost:4200';

(async () => {
  // 1536x864 at deviceScaleFactor 1 matches the reviewer's viewport at 125% scaling.
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').fill('admin@system.local');
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });

  await page.goto(`${BASE}/admin/bookings`);
  // The row badge only renders after the per-booking payment fetch resolves, so wait on
  // the row itself, not on a networkidle proxy.
  const row = page.locator('tbody tr', { hasText: 'DRV-FIXTURE-1' }).first();
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);

  // A row carries TWO .admin-status badges: booking status first, then PAYMENT status.
  // Index 1 is the one this card changes — .first() silently captures the booking-status
  // badge and produces an evidence shot of the wrong column.
  const badges = row.locator('span.admin-status');
  const count = await badges.count();
  if (count < 2) {
    throw new Error(`expected 2 status badges in the row, found ${count}`);
  }
  const badge = badges.nth(1);
  const badgeText = (await badge.innerText()).trim();
  const badgeClass = await badge.getAttribute('class');
  const bg = await badge.evaluate((el) => getComputedStyle(el).backgroundColor);
  const colour = await badge.evaluate((el) => getComputedStyle(el).color);
  const bookingBadgeText = (await badges.nth(0).innerText()).trim();

  console.log(JSON.stringify(
    { label: LABEL, bookingStatusBadge: bookingBadgeText, paymentStatusBadge: badgeText, badgeClass, backgroundColor: bg, color: colour },
    null, 2
  ));

  await page.screenshot({ path: path.join(OUT_DIR, `OBRS-298-${LABEL}-bookings-list.png`) });

  // The detail modal carries the second badge plus the outstanding figure that makes the
  // whole point: nothing is owed.
  await row.locator('button', { hasText: /view|ดู/i }).first().click().catch(() => row.click());
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT_DIR, `OBRS-298-${LABEL}-detail-modal.png`) });

  await browser.close();
})().catch((e) => {
  console.error('CAPTURE FAILED:', e.message);
  process.exit(1);
});
