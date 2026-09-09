import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1787 AC-4 — BEFORE/AFTER evidence for the OPEN-seating seat line on the
 * public /find-booking screen.
 *
 *   npx playwright test --config=playwright.obrs1787capture.config.ts
 *
 * Hermetic on the gate lane's terms (playwright.gate.config.ts, rule 1): the
 * spec fulfils the one `/api/**` call this screen makes, so there is no backend,
 * no database and no SIT dependency.
 *
 * OBRS1787_OUT selects the output folder, which is how the BEFORE run is taken:
 * revert the template, run with OBRS1787_OUT=captures/obrs-1787/before, restore.
 */
const PORT = process.env['OBRS1787_PORT'] ?? '4287';

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1787-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 1400 } } },
  ],
});
