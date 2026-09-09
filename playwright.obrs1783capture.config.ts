import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1783 AC-4 — BEFORE/AFTER evidence for the OPEN-seating seat line.
 *
 *   npx playwright test --config=playwright.obrs1783capture.config.ts
 *
 * Hermetic on the gate lane's terms (playwright.gate.config.ts, rule 1): the
 * spec fulfils every `/api/**` call itself and seeds its own session, so there
 * is no backend, no database and no SIT dependency.
 *
 * OBRS1783_OUT selects the output folder, which is how the BEFORE run is taken:
 * revert the template, run with OBRS1783_OUT=captures/obrs-1783/before, restore.
 */
const PORT = process.env['OBRS1783_PORT'] ?? '4283';

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1783-capture.spec.ts'],
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
