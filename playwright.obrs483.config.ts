import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-483 — the local full-stack lane for the open-seating reschedule /
 * change-stop / change-seat flows, modeled directly on playwright.local.config.ts
 * (OBRS-184) but pointed at e2e/fixtures/obrs483-open-seating-fixture.sql and this
 * QA session's own backend worktree/database (obrs483qa on :8181) instead of the
 * reschedule lane's obrs184qa.
 *
 *   npx playwright test --config=playwright.obrs483.config.ts
 *
 * The backend webServer entry below is `reuseExistingServer: true` unconditionally
 * (not env-gated like OBRS-184's) because this lane's backend is booted by hand
 * against a hand-picked BE worktree (the one carrying the OBRS-483 fix,
 * OBRS-backend-wt-obrs-483-open-seating) rather than a sibling checkout — Playwright
 * only spawns the fallback command if :8181/api/routes is NOT already reachable.
 */

const FRONTEND_PORT = process.env['E2E_FRONTEND_PORT'] ?? '4210';
const BACKEND_PORT = process.env['E2E_BACKEND_PORT'] ?? '8181';
const BASE_URL = `http://localhost:${FRONTEND_PORT}`;
const API_URL = `http://localhost:${BACKEND_PORT}`;

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: '**/obrs-483-open-seating.spec.ts',
  timeout: 90_000,

  fullyParallel: false,
  workers: 1,
  retries: 0,

  reporter: [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      // Fallback only — this QA run boots the backend by hand (see the session's
      // report for the exact command) against obrs483qa on :8181, seeded with
      // schema.sql -> data.sql -> obrs483-open-seating-fixture.sql. Playwright will
      // only actually run this command if that backend is NOT already reachable.
      command:
        'pwsh -NoProfile -ExecutionPolicy Bypass -File e2e/scripts/start-e2e-backend.ps1',
      url: `${API_URL}/api/routes`,
      timeout: 900_000,
      reuseExistingServer: true,
      stdout: 'pipe',
      stderr: 'pipe',
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
