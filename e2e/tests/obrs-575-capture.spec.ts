import { expect, test } from '@playwright/test';

const ASSETS = 'e2e-evidence/OBRS-575';

test('BEFORE — Home on origin/dev, LOGGED IN, no recent-route strip (port 4576)', async ({
  page,
}) => {
  await page.goto('http://localhost:4576/login');
  await page.fill('#email', 'customer@system.local');
  await page.fill('#password', 'P@ssw0rd');
  await page.click('.login-btn');

  // Prove the session is real BEFORE shooting. The first version of this test
  // waited only on `.booking-card`, which renders whether or not anyone is
  // signed in — the login silently failed and it captured a logged-out Home,
  // so BEFORE/AFTER differed by two variables (feature AND auth) instead of
  // one. The AFTER captures below were only accidentally safe: they wait on
  // `.recent-route-btn`, which cannot exist logged out.
  await page.waitForSelector('.navbar-avatar', { timeout: 20_000 });

  await page.goto('http://localhost:4576/');
  await page.waitForSelector('.booking-card', { timeout: 15_000 });
  await expect(page.locator('.navbar-avatar')).toBeVisible();
  await expect(page.locator('app-recent-routes-quick-pick .recent-route-btn')).toHaveCount(0);

  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${ASSETS}/before-home-no-strip.png`, fullPage: false });
});

test('AFTER — Home page with the strip, light mode (port 4575)', async ({ page }) => {
  await page.goto('http://localhost:4575/login');
  await page.fill('#email', 'customer@system.local');
  await page.fill('#password', 'P@ssw0rd');
  await page.click('.login-btn');
  // Wait for the SESSION, not for a stopwatch. A fixed 3s sleep here is what
  // let a slow login slip through: the JWT was not stored yet, `goto('/')`
  // booted the app logged out, and the test carried on and captured the wrong
  // page. `.navbar-avatar` only exists once authenticated, so a failed login
  // now fails the test instead of quietly changing what it measures.
  // (Ruled out: SIT does not rate-limit these logins — three back-to-back
  // POST /api/auth/login calls all returned 200.)
  await page.waitForSelector('.navbar-avatar', { timeout: 30_000 });
  await page.goto('http://localhost:4575/');
  await page.waitForSelector('.booking-card', { timeout: 15000 });
  await page.waitForSelector('app-recent-routes-quick-pick .recent-route-btn', { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${ASSETS}/after-home-with-strip-light.png`, fullPage: false });
});

test('AFTER-dark — the strip in dark mode (port 4575)', async ({ page }) => {
  await page.goto('http://localhost:4575/login');
  await page.fill('#email', 'customer@system.local');
  await page.fill('#password', 'P@ssw0rd');
  await page.click('.login-btn');
  // Wait for the SESSION, not for a stopwatch. A fixed 3s sleep here is what
  // let a slow login slip through: the JWT was not stored yet, `goto('/')`
  // booted the app logged out, and the test carried on and captured the wrong
  // page. `.navbar-avatar` only exists once authenticated, so a failed login
  // now fails the test instead of quietly changing what it measures.
  // (Ruled out: SIT does not rate-limit these logins — three back-to-back
  // POST /api/auth/login calls all returned 200.)
  await page.waitForSelector('.navbar-avatar', { timeout: 30_000 });
  await page.goto('http://localhost:4575/');
  await page.waitForSelector('.booking-card', { timeout: 15000 });
  await page.waitForSelector('app-recent-routes-quick-pick .recent-route-btn', { timeout: 15000 });
  await page.locator('.theme-toggle-btn').first().click();
  await page.waitForFunction(() => document.body.classList.contains('is-dark'), { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${ASSETS}/after-home-with-strip-dark.png`, fullPage: false });
});
