/**
 * QA playwright config — used when the main worktree occupies :4200.
 * Serves on :4201 and passes --disable-web-security so SIT CORS restriction
 * (pinned to :4200 origin) is bypassed for tests that hit the live backend.
 */
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://localhost:4201';

export default defineConfig({
  globalSetup: './e2e/global-setup-qa.ts',
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
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
    command: `npx ng serve --configuration sit --port 4201 --no-live-reload`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
