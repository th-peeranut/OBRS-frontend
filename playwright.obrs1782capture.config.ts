import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1782 - the CAPTURE lane for this card's Jira evidence.
 *
 *   npx playwright test --config=playwright.obrs1782capture.config.ts
 *
 * Same shape as playwright.obrs812capture.config.ts, and `--configuration gate`
 * for the same reason: it is the build the staff contrast gate measures, so a
 * frame here and a ratio there describe the same page.
 *
 * Not part of the committed regression suite - the verdict belongs to
 * staff-contrast-gate.spec.ts and to the invariant-B self-test in
 * customer-contrast-gate.spec.ts; what this lane adds is the pictures.
 */
const PORT = process.env['OBRS1782_PORT'] ?? '4291';

export default defineConfig({
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1782-tiles-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 300_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx ng serve --configuration gate --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
