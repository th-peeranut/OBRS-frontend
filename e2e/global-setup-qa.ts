/**
 * QA global setup — targets the alt port (4201) used when the main ng-serve
 * on :4200 is occupied by the main worktree. Generates the admin-auth.json
 * storage state so stub-based admin tests can use real JWT from SIT.
 */
import { chromium, FullConfig } from '@playwright/test';
import path from 'path';
import laneTreeGuard from './support/lane-tree-guard';

const AUTH_FILE = path.resolve(__dirname, 'fixtures/admin-auth.json');
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://localhost:4201';

async function globalSetup(config: FullConfig): Promise<void> {
  // OBRS-1611: this lane brings its own globalSetup, so the tree guard is CALLED here
  // rather than wired as the entry point -- same banner, same refusal, and it has to
  // run before the login below, which would otherwise be typed into another tree.
  laneTreeGuard(config);


  const browser = await chromium.launch({
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
  });
  const page = await browser.newPage();

  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });

  await page.goto(`${BASE_URL}/login`);

  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill('admin@system.local');
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();

  // Wait for navigation away from login — up to 60 s for Koyeb cold-start
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });

  await page.context().storageState({ path: AUTH_FILE });
  await browser.close();
}

export default globalSetup;
