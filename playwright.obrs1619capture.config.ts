import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1619 — the payee drill-down and the CSV button, on the OWN-DB lane.
 *
 *   npx playwright test --config=playwright.obrs1619capture.config.ts
 *
 * A sibling of `playwright.obrs1578capture.config.ts` and OWN-DB for the same two reasons: the
 * backend half of this card (`/expense-by-payee/bills` and the `payee-spend` export dataset) only
 * exists on this branch, so the screen would render its load error on SIT; and the premise the
 * screens are built around — one payee with two bills, one bill with no payee at all — is a state
 * a shared environment cannot be put into on demand.
 *
 * It reuses OBRS-1578's fixture deliberately (see the spec's javadoc): this card adds two ways of
 * reading the same numbers, and a fixture of its own would have made "they still agree" untestable.
 */
const FRONTEND_PORT = process.env['E2E_FRONTEND_PORT'] ?? '4213';
// 8181 is not a free choice: `environment.e2e.ts` hard-codes `apiUrl: http://localhost:8181`, so
// the browser calls 8181 whatever this file says. See the sibling config for the 15 minutes that
// cost once.
const BACKEND_PORT = process.env['E2E_BACKEND_PORT'] ?? '8181';
const BASE_URL = `http://localhost:${FRONTEND_PORT}`;
const API_URL = `http://localhost:${BACKEND_PORT}`;

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['**/obrs-1619-payee-drilldown.spec.ts'],
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
      timeout: 900_000,
      reuseExistingServer: process.env['E2E_REUSE_SERVERS'] === '1',
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        E2E_DB_NAME: process.env['E2E_DB_NAME'] ?? 'obrs1619qa',
        E2E_FIXTURE_SQL: process.env['E2E_FIXTURE_SQL'] ?? 'obrs-1578-payee-spend-fixture.sql',
        E2E_FRONTEND_URL: BASE_URL,
        // While this card is in review the backend half lives on its branch, so the evidence run
        // passes OBRS_BACKEND_DIR=...\OBRS-backend-wt-obrs-1619; once it is on dev the sibling
        // checkout is the right answer and no override is needed.
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
