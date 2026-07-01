import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4202',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'ng serve --configuration sit --port 4202',
    url: 'http://localhost:4202',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
