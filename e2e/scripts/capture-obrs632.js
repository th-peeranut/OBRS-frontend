// OBRS-632 evidence capture — the /account page's PDPA rights surface.
//
//   node e2e/scripts/capture-obrs632.js <outDir> <label>
//
// <label> is BEFORE or AFTER; the ONLY difference between the two runs is which commit the
// frontend is serving. Backend and database are the same in both.
//
// Prereqs: local backend on :8081 against the isolated obrs632qa DB, FE served with
// `--configuration sit` on :4200 with environment.sit.ts apiUrl overridden to :8081.
//
// Every shot asserts its subject before saving. A screenshot has no failure mode — a green PNG of
// a page that never loaded, or of the OLD account page under an AFTER label, proves nothing.
const { chromium } = require('@playwright/test');
const path = require('path');

const OUT_DIR = process.argv[2] || '.';
const LABEL = (process.argv[3] || 'AFTER').toUpperCase();
const BASE = 'http://localhost:4200';
const EMAIL = 'customer@system.local';
const PASSWORD = 'P@ssw0rd';

function fail(msg) {
  console.error(`FAIL [${LABEL}]: ${msg}`);
  process.exitCode = 1;
}

(async () => {
  // 1536x864 at deviceScaleFactor 1 matches the reviewer's viewport at 125% scaling.
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
  const page = await context.newPage();
  const shots = [];

  async function shoot(name, opts = {}) {
    const file = path.join(OUT_DIR, `${LABEL.toLowerCase()}-${name}.png`);
    await page.screenshot({ path: file, ...opts });
    shots.push(file);
    console.log(`saved ${file}`);
  }

  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });

  await page.goto(`${BASE}/account`);
  // Wait on the page's own heading, not on networkidle: the AFTER build issues a GET /users/me
  // that the BEFORE build does not, so a network-based wait would not mean the same thing twice.
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1200);

  // The i18n check has to happen before anything else is believed: served under the wrong
  // configuration this page renders raw keys like "ACCOUNT.TITLE", which still screenshots fine.
  const heading = (await page.locator('h1').first().innerText()).trim();
  if (/^ACCOUNT\./.test(heading)) {
    fail(`page is rendering raw i18n keys ("${heading}") — serve with --configuration sit`);
  }
  console.log(`heading: ${heading}`);

  await shoot('account-page', { fullPage: true });

  const cardCount = await page.locator('.account-card').count();
  const hasProfile = (await page.locator('[data-testid="profile-card"]').count()) > 0;
  const hasClose = (await page.locator('[data-testid="close-account-card"]').count()) > 0;
  const hasBanner = (await page.locator('[data-testid="reconsent-notice"]').count()) > 0;
  console.log(`cards=${cardCount} profileCard=${hasProfile} closeCard=${hasClose} reconsentBanner=${hasBanner}`);

  if (LABEL === 'BEFORE') {
    // Pinning the absence is the point of the BEFORE shot: the endpoints existed, the buttons
    // did not, and "no button" is only evidence if it was asserted rather than eyeballed.
    if (hasProfile || hasClose || hasBanner) {
      fail('BEFORE build already shows the OBRS-632 sections — wrong commit is being served');
    }
    await browser.close();
    console.log(shots.join('\n'));
    return;
  }

  if (!hasProfile) fail('personal-details card missing');
  if (!hasClose) fail('close-account card missing');
  if (!hasBanner) {
    fail('re-consent banner missing — seeded customer has pdpa_consent_version NULL, so it must show');
  }

  // Profile edit form, populated from GET /users/me.
  await page.locator('[data-testid="profile-edit"]').click();
  await page.locator('#account-profile-phone').waitFor({ state: 'visible', timeout: 10000 });
  const phone = await page.locator('#account-profile-phone').inputValue();
  if (phone !== '0812345678') {
    fail(`edit form did not load the real phone from the API (got "${phone}")`);
  }
  await shoot('profile-edit-form', { fullPage: true });
  await page.locator('button.btn-secondary', { hasText: /ยกเลิก|Cancel|取消/ }).first().click();

  // Close-account confirmation dialog.
  await page.locator('[data-testid="close-account-open"]').click();
  const dialog = page.locator('.close-account-modal');
  await dialog.waitFor({ state: 'visible', timeout: 10000 });

  // The submit button must be DISABLED until the phrase is typed — that is the safety, and a
  // screenshot of a dialog cannot show whether the button actually does anything.
  const submit = page.locator('[data-testid="close-account-submit"]');
  if (!(await submit.isDisabled())) {
    fail('close-account submit is enabled before the confirmation phrase is typed');
  }
  const whatHappens = await page.locator('[data-testid="close-account-what-happens"]').innerText();
  console.log(`dialog lead: ${whatHappens.trim()}`);
  await shoot('close-account-dialog');

  // Typed phrase enables it. Read the required phrase off the label rather than hardcoding Thai,
  // so this still asserts correctly if the capture runs under another locale.
  const label = await page.locator('label[for="close-account-confirmation"]').innerText();
  const match = label.match(/[""「"]([^""」"]+)[""」"]/);
  if (!match) {
    fail(`could not read the confirmation phrase out of the label: "${label}"`);
  } else if (/^ACCOUNT\./.test(match[1])) {
    // The dialog resolves the phrase in its CONSTRUCTOR via translate.instant. If the bundle were
    // not loaded yet that returns the key itself — and typing the key back would still "pass".
    fail(`confirmation phrase is an unresolved i18n key: "${match[1]}"`);
  } else {
    await page.locator('[data-testid="close-account-confirmation"]').fill(match[1]);
    await page.waitForTimeout(200);
    if (await submit.isDisabled()) {
      fail(`submit stayed disabled after typing the required phrase "${match[1]}"`);
    }
    await shoot('close-account-dialog-armed');
  }

  await browser.close();
  console.log(shots.join('\n'));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
