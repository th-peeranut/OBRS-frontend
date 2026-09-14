import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1727 - the CAPTURE lane for this card's Jira evidence (AC-7).
 *
 *   npx playwright test --config=playwright.obrs1727capture.config.ts
 *
 * Same shape as playwright.obrs1782capture.config.ts. Not part of the committed
 * regression suite: the verdict for this card is the unit suite, and what this lane
 * adds is the three AFTER pictures AC-7 asks for.
 *
 * Fully stubbed - every /api/** call is answered in-browser, so it needs no backend
 * and never reaches SIT.
 */
const PORT = process.env['OBRS1727_PORT'] ?? '4293';

export default defineConfig({
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1727-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 300_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 960 },
  },
  webServer: {
    command: `npx ng serve --configuration gate --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
