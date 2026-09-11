// Standalone capture script for OBRS-868 visual evidence (not a Playwright test).
//
// The FE half of this card is what the email's link LANDS on: /find-booking with
// ?bookingNumber=<n>, the public lookup OBRS-857 shipped. No login and no API call are
// involved in the landing itself - the lookup only fires on submit - so this needs no
// auth seeding; the catch-all route is there purely so nothing reaches a real backend.
//
// AFTER only, deliberately: on origin/dev nothing produces this URL, so a "before" frame
// would be a picture of a page nobody could have arrived at. The BEFORE that matters for
// this card is the EMAIL, rendered by Obrs868EvidenceRenderer in the backend repo.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-868');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });
const BOOKING_NUMBER = 'B-ABC234';

async function shoot(browser, baseUrl, language) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(([lang]) => localStorage.setItem('app_language', lang), [language]);
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) })
  );

  await page.goto(`${baseUrl}/find-booking?bookingNumber=${BOOKING_NUMBER}`, {
    waitUntil: 'networkidle',
  });
  const bookingInput = page.locator('[formControlName="bookingNumber"]');
  await bookingInput.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(500);

  const popups = await page.locator('.swal2-popup').count();
  if (popups > 0) {
    throw new Error(`refusing to save: ${popups} swal popup(s) over the page`);
  }

  // Read the state back from the DOM - a frame cannot prove the value came from the URL
  // rather than from a placeholder, and it cannot show that the phone stayed empty.
  const booking = await bookingInput.inputValue();
  const phone = await page.locator('[formControlName="phoneNumber"]').inputValue();
  console.log(`${language}: bookingNumber=${JSON.stringify(booking)} phoneNumber=${JSON.stringify(phone)}`);

  await page.screenshot({ path: path.join(ASSETS_DIR, `OBRS-868-AFTER-find-booking-prefilled-${language}.png`) });
  console.log('captured', `OBRS-868-AFTER-find-booking-prefilled-${language}.png`);
  await page.close();
}

// The BE half's frames: the rendered e-mail itself. Obrs868EvidenceRenderer (OBRS-backend)
// writes the REAL MimeMessage HTML to target/obrs-868/ - run it once in this branch's worktree
// for the AFTER and once in a worktree at origin/dev for the BEFORE, then point these two env
// vars at the two directories.
async function shootEmail(browser, dir, label, language) {
  const file = path.join(dir, `payment-confirmed-${language}.html`);
  if (!fs.existsSync(file)) {
    throw new Error(`no rendered e-mail at ${file} - run Obrs868EvidenceRenderer first`);
  }
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.goto(`file:///${file.split(path.sep).join('/')}`, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const links = await page.locator('a[href*="find-booking"]').count();
  console.log(`${label} email ${language}: find-booking links = ${links}`);

  await page.screenshot({
    path: path.join(ASSETS_DIR, `OBRS-868-${label}-email-${language}.png`),
    fullPage: true,
  });
  console.log('captured', `OBRS-868-${label}-email-${language}.png`);
  await page.close();
}

async function main() {
  const base = process.env.BASE_URL || 'http://localhost:4200';
  const browser = await chromium.launch();

  if (process.env.EMAIL_AFTER_DIR) {
    await shootEmail(browser, process.env.EMAIL_AFTER_DIR, 'AFTER', 'th');
    await shootEmail(browser, process.env.EMAIL_AFTER_DIR, 'AFTER', 'en');
  }
  if (process.env.EMAIL_BEFORE_DIR) {
    await shootEmail(browser, process.env.EMAIL_BEFORE_DIR, 'BEFORE', 'th');
    await shootEmail(browser, process.env.EMAIL_BEFORE_DIR, 'BEFORE', 'en');
  }
  if (!process.env.SKIP_PAGE) {
    await shoot(browser, base, 'th');
    await shoot(browser, base, 'en');
  }

  await browser.close();
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
