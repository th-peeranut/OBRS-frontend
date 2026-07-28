import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the direction-selector feature on /home.
 * Serves on port 4201 (4200 is occupied).
 * Passes --disable-web-security so CORS is not enforced while running on
 * localhost:4201 against the live SIT backend (CORS is pinned to :4200).
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/direction-selector.spec.ts',
  timeout: 90_000,
  retries: 0,
  reporter: [
    ['html', { outputFolder: 'playwright-report-direction-selector' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:4201',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Via npm so `prestart:sit` runs the local-env shape gate first (OBRS-536).
    command: 'npm run start:sit -- --port 4201',
    url: 'http://localhost:4201',
    reuseExistingServer: true,
    timeout: 150 * 1000,
  },
});
