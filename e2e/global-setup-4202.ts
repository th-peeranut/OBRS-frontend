/**
 * Global setup for sidebar-hover-expand AND regression Playwright tests
 * served on port 4202. Saves auth state to TWO files:
 *   - fixtures/sidebar-auth.json (used by sidebar-hover-expand.spec.ts)
 *   - fixtures/admin-auth.json   (used by all pre-existing spec files)
 *
 * Chromium is launched with --disable-web-security so the browser does not
 * enforce CORS (SIT backend only allows localhost:4200 as origin; tests run
 * on localhost:4202 per team workaround in verify-sit-fix-alt-port-cors.md).
 */
import { chromium, FullConfig } from '@playwright/test';
import path from 'path';

export const SIDEBAR_AUTH_FILE = path.resolve(__dirname, 'fixtures/sidebar-auth.json');
const ADMIN_AUTH_FILE = path.resolve(__dirname, 'fixtures/admin-auth.json');

async function globalSetup(_config: FullConfig): Promise<void> {
  const browser = await chromium.launch({
    args: ['--disable-web-security'],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });

  await page.goto('http://localhost:4202/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('input[type="email"]').fill('admin@system.local');
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });

  // Save to both paths so sidebar tests AND pre-existing tests can use the same auth
  await context.storageState({ path: SIDEBAR_AUTH_FILE });
  await context.storageState({ path: ADMIN_AUTH_FILE });
  await browser.close();
}

export default globalSetup;
