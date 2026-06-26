import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4201',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Port 4201 is used (4200 is occupied by another worktree's ng-serve).
          // SIT CORS allows only localhost:4200; --disable-web-security bypasses
          // CORS for any unmocked calls while all critical endpoints are mocked via page.route.
          args: ['--disable-web-security'],
        },
      },
    },
  ],
  webServer: {
    command: 'ng serve --configuration sit --port 4201',
    url: 'http://localhost:4201',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
