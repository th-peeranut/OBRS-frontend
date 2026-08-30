// Standalone capture script for OBRS-1558 visual evidence (not a Playwright test, not part of the
// suite). No backend, no database: the two surfaces this card touches are forms, so every response
// they read is stubbed and the pictures are of the FORMS, which is what changed.
//
// Both labels are shot against ONE server on :4400, one after the other, so only one `ng serve` is
// alive at a time:
//   npx ng serve --port 4400      (this branch)  -> node e2e/scripts/capture-obrs1558.js AFTER
//   ... from an origin/dev worktree              -> node e2e/scripts/capture-obrs1558.js BEFORE
//
// The BEFORE run stubs the SAME payload, nickname included. That is deliberate: origin/dev's
// interfaces simply have no such key, so the field is absent from both forms there - which is
// exactly the "before" the owner needs to see, and it proves the difference is the code and not a
// thinner fixture.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const LABEL = (process.argv[2] || 'AFTER').toUpperCase();
// The box runs several sessions at once, so the port is whichever one was free (OBRS_PORT).
const BASE = `http://localhost:${process.env.OBRS_PORT || 4400}`;
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1558');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

// The driver the LINE board names. Full name AND nickname both present, so the screens show which
// one each surface chooses rather than showing the only value there is.
const ME = {
  id: 11,
  title: 'MR',
  firstName: 'สมชาย',
  middleName: null,
  lastName: 'ขับดี',
  nickname: 'ตุ๊ก',
  email: 'driver@system.local',
  phoneNumber: '0811111111',
  preferredLocale: 'th',
  pdpaConsentVersion: '1.0',
};

const USER_ROW = {
  id: 11,
  title: 'MR',
  firstName: 'สมชาย',
  middleName: null,
  lastName: 'ขับดี',
  nickname: 'ตุ๊ก',
  fullName: 'สมชาย ขับดี',
  email: 'driver@system.local',
  phoneNumber: '0811111111',
  preferredLocale: 'th',
  status: 'active',
  createdAt: '2026-08-01T09:00:00+07:00',
  updatedAt: '2026-08-01T09:00:00+07:00',
  lastLoginAt: '2026-08-29T18:12:00+07:00',
  roles: ['driver'],
  locked: false,
  accountLockedUntil: null,
  salesPointCodes: [],
  activeSalesPointCode: null,
  guest: false,
};

async function newSeededPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'fake-owner-token-for-capture');
    localStorage.setItem('auth_username', 'owner@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['owner', 'admin']));
  });
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  // Catch-all FIRST, specifics after: Playwright lets the last-registered route win.
  await page.route('**/api/**', (route) => json(route, ok([])));
  await page.route('**/private/users/me**', (route) => json(route, ok(ME)));
  await page.route('**/private/users/11', (route) => json(route, ok(USER_ROW)));
  await page.route('**/private/users?**', (route) => json(route, ok([USER_ROW])));
  await page.route('**/private/users', (route) => json(route, ok([USER_ROW])));
  return page;
}

async function open(browser, route) {
  const page = await newSeededPage(browser);
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const swal = await page.locator('.swal2-popup').count();
  if (swal !== 0) throw new Error(`${route}: ${swal} swal popup(s) on screen - the shot would be of an error, not the form`);
  return page;
}

async function shoot(page, name, note) {
  await page.screenshot({ path: path.join(ASSETS_DIR, name) });
  console.log(`captured ${name} — ${note}`);
}

/** What the running page actually shows, so the log is evidence and not a caption. */
async function readNickname(page, selector) {
  const el = page.locator(selector);
  if ((await el.count()) === 0) return null;
  return el.first().inputValue();
}

async function main() {
  const browser = await chromium.launch();
  const measured = {};

  // ---- 1 + 2: the account page, the surface every staff member has for themselves ----
  const account = await open(browser, '/account');
  measured.accountReadShowsNickname = await account.locator('[data-testid="profile-nickname"]').count();
  await shoot(account, `OBRS-1558-${LABEL}-account-read.png`, `read view · nickname rows=${measured.accountReadShowsNickname}`);

  await account.locator('[data-testid="profile-edit"]').click();
  await account.waitForTimeout(600);
  measured.accountFormNickname = await readNickname(account, '#account-profile-nickname');
  await shoot(account, `OBRS-1558-${LABEL}-account-form.png`, `edit form · nickname field=${JSON.stringify(measured.accountFormNickname)}`);
  await account.close();

  // ---- 3: the owner's User Management modal, the surface that fills it in for someone else ----
  const users = await open(browser, '/admin/users');
  await users.waitForSelector('table tbody tr', { timeout: 15000 });
  await users.locator('table tbody tr').first().locator('button.admin-icon-btn').nth(-2).click();
  await users.waitForSelector('.user-editor-modal', { timeout: 15000 });
  await users.waitForTimeout(900);
  measured.adminFormNickname = await readNickname(users, 'input[formcontrolname="nickname"]');
  await shoot(users, `OBRS-1558-${LABEL}-admin-user-modal.png`, `edit modal · nickname field=${JSON.stringify(measured.adminFormNickname)}`);
  await users.close();

  await browser.close();
  console.log(`\n${LABEL} measured: ${JSON.stringify(measured, null, 2)}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
