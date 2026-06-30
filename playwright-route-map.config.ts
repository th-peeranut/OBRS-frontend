import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Interactive Pickup/Drop-off Route Map feature.
 * Serves the frontend worktree on port 4201 (SIT configuration) so it does
 * not conflict with any existing server on 4200.  The new backend endpoint
 * GET /api/routes/{slug}/pickup-dropoff is NOT yet deployed to SIT, so all
 * tests use Playwright HTTP route interception to mock the endpoint.
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/route-map.spec.ts',
  timeout: 90_000,
  retries: 0,
  reporter: [['html', { outputFolder: 'playwright-report-route-map' }], ['list']],
  use: {
    baseURL: 'http://localhost:4201',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    // The direction selector added GET /api/routes before GET /api/routes/{slug}/pickup-dropoff.
    // Without this flag, the /api/routes call fails CORS on port 4201 (SIT CORS allows :4200 only).
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
    command: 'npx ng serve --port 4201 --configuration sit',
    url: 'http://localhost:4201',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
