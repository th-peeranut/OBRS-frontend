import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1572 - the CAPTURE lane for this card's Jira evidence.
 *
 *   npx playwright test --config=playwright.obrs1572capture.config.ts
 *
 * Same shape as playwright.obrs969capture.config.ts, on the default configuration:
 * nothing here depends on an environment-specific flag, and every /api/** call is
 * fulfilled by the spec's fixtures, so nothing reaches SIT.
 *
 * Not part of the committed regression suite - the card ships comments, and what this
 * lane adds is the pictures plus the two composited fills the `_loading.scss` note cites.
 */
const PORT = process.env['OBRS1572_PORT'] ?? '4273';

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1572-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 180_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx ng serve --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
