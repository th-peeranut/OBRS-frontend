import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1578 — the spend-by-payee screen, on the OWN-DB lane.
 *
 *   npx playwright test --config=playwright.obrs1578capture.config.ts
 *
 * OWN-DB rather than SIT, for two reasons that both make SIT impossible rather than merely
 * inconvenient. The backend half of this card is not on SIT — the `expense-by-payee` endpoint only
 * exists on this branch — so the screen would render its load error there. And the premise the
 * screen is built around (five bills in one year, exactly one in another, the lone one being the
 * SECOND-largest payee) is a state a shared environment cannot be put into on demand.
 *
 * Reuses `start-e2e-backend.ps1` unchanged (OBRS-184): it drops and rebuilds the database every
 * run, applies OBRS-backend's schema.sql -> data.sql, then this card's fixture.
 */
const FRONTEND_PORT = process.env['E2E_FRONTEND_PORT'] ?? '4212';
// 8181 is not a free choice: `environment.e2e.ts` hard-codes `apiUrl: http://localhost:8181`, so
// the browser calls 8181 no matter what this file says, and every sibling capture config leaves
// `start-e2e-backend.ps1` on its own 8181 default. A first run of this lane set 8183 here without
// passing it through to the script's env, so the backend came up on 8181 while Playwright polled
// an 8183 that was never going to open -- 15 minutes of waiting, then `webServer was not able to
// start`, with a perfectly healthy backend in the log above it.
const BACKEND_PORT = process.env['E2E_BACKEND_PORT'] ?? '8181';
const BASE_URL = `http://localhost:${FRONTEND_PORT}`;
const API_URL = `http://localhost:${BACKEND_PORT}`;

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['**/obrs-1578-payee-spend-report.spec.ts'],
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
        E2E_DB_NAME: process.env['E2E_DB_NAME'] ?? 'obrs1578qa',
        E2E_FIXTURE_SQL: process.env['E2E_FIXTURE_SQL'] ?? 'obrs-1578-payee-spend-fixture.sql',
        E2E_FRONTEND_URL: BASE_URL,
        // Left to start-e2e-backend.ps1's own default (the sibling OBRS-backend checkout)
        // unless overridden. While this card is in review the backend half lives on its
        // branch, so that run passes OBRS_BACKEND_DIR=...\OBRS-backend-wt-obrs-1578; once
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
