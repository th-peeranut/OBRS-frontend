import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-884 — the per-vehicle P&L screen, on the OWN-DB lane.
 *
 *   npx playwright test --config=playwright.obrs884.config.ts
 *
 * OWN-DB rather than SIT, for the reason that lane exists: the screen's whole job is
 * telling three DIFFERENT ฿0s apart, and the three service-window states have to be
 * present in ONE period at once. A shared environment's fleet cannot be in three states
 * on demand, so the premise is only constructible on a database this lane owns.
 *
 * It also needs a backend that HAS the `pl-per-vehicle` export dataset, which is on this
 * card's branch and not on SIT — and proving "the numbers in the file equal the numbers on
 * the screen" (AC 4) means really downloading the file from the same backend the screen
 * just read. `OBRS_BACKEND_DIR` therefore points at this card's backend worktree.
 *
 * Reuses `start-e2e-backend.ps1` unchanged (OBRS-184): it drops and rebuilds the database
 * every run, applies OBRS-backend's schema.sql -> data.sql, then this card's fixture.
 */
const FRONTEND_PORT = process.env['E2E_FRONTEND_PORT'] ?? '4210';
const BACKEND_PORT = process.env['E2E_BACKEND_PORT'] ?? '8181';
const BASE_URL = `http://localhost:${FRONTEND_PORT}`;
const API_URL = `http://localhost:${BACKEND_PORT}`;

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['**/obrs-884-vehicle-pl-report.spec.ts'],
  timeout: 120_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1536, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pwsh -NoProfile -ExecutionPolicy Bypass -File e2e/scripts/start-e2e-backend.ps1',
      url: `${API_URL}/api/routes`,
      // Same generous ceiling as playwright.local.config.ts, for the same reason: a cold
      // Maven build + Flyway + Spring boot is routinely minutes on this machine.
      timeout: 900_000,
      // Default false on purpose (see playwright.local.config.ts): a backend already up
      // was started against a database this run has not rebuilt.
      reuseExistingServer: process.env['E2E_REUSE_SERVERS'] === '1',
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        E2E_DB_NAME: process.env['E2E_DB_NAME'] ?? 'obrs884qa',
        E2E_FIXTURE_SQL: process.env['E2E_FIXTURE_SQL'] ?? 'obrs-884-pl-fixture.sql',
        E2E_FRONTEND_URL: BASE_URL,
        // Left to start-e2e-backend.ps1's own default (the sibling OBRS-backend checkout)
        // unless overridden. While this card is in review the backend half lives on its
        // branch, so that run passes OBRS_BACKEND_DIR=...\OBRS-backend-wt-obrs-884; once
        // it is on dev the sibling checkout is the right answer and no override is needed.
        ...(process.env['OBRS_BACKEND_DIR']
          ? { OBRS_BACKEND_DIR: process.env['OBRS_BACKEND_DIR'] }
          : {}),
      },
    },
    {
      command: `npx ng serve --configuration e2e --port ${FRONTEND_PORT} --no-live-reload`,
      url: BASE_URL,
      timeout: 300_000,
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
