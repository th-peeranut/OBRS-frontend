import { chromium, FullConfig } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.resolve(__dirname, 'fixtures/admin-auth.json');

async function globalSetup(_config: FullConfig): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });

  await page.goto('http://localhost:4200/login');

  // Wait for Angular to bootstrap and the email input to be interactive
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });

  await page.locator('input[type="email"]').fill('admin@system.local');
  await page.locator('input[type="password"]').fill('P@ssw0rd');
  await page.locator('button[type="submit"]').click();

  // The login component fires the success SweetAlert without awaiting it, then
  // immediately calls navigateAfterLogin(). The SweetAlert is torn down by the
  // navigation before we can click it — so we just wait for the URL change.
  // 60 s timeout to cover Koyeb cold-start latency on the SIT backend.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });

  await page.context().storageState({ path: AUTH_FILE });
  await browser.close();
}

export default globalSetup;
