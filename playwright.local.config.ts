import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-184 — the local full-stack lane.
 *
 *   npx playwright test --config=playwright.local.config.ts
 *
 * Boots BOTH halves and rebuilds the database from source on every run, so a run
 * is reproducible from a clean checkout with no manual setup and no shared state:
 *
 *   1. e2e/scripts/start-e2e-backend.ps1  drops + recreates `obrs184qa`, applies
 *      OBRS-backend's schema.sql -> data.sql -> e2e/fixtures/reschedule-fixture.sql,
 *      then boots the backend on :8181 against it.
 *   2. `ng serve --configuration e2e` serves the app on :4210 pointed at :8181
 *      (src/environments/environment.e2e.ts).
 *
 * WHY NOT SIT (which every other config here uses)
 * `my-bookings-reschedule.spec.ts` needs booking states that only exist by
 * construction — a booking already rescheduled once, a cancelled one, and a seat
 * collision between two bookings. On a shared mutable environment those can only be
 * produced by running the spec, which consumes them, so the next run finds them
 * spent; and its fixtures were pinned to calendar dates that fell into the past,
 * after which the (correct) 4-hour cutoff disabled the button and the spec read
 * that as a defect. Owning the database is what makes those states seedable and the
 * dates relative. See OBRS-184.
 *
 * This does NOT contradict docs/adr/0001-admin-e2e-hits-real-sit-backend.md: that
 * ADR is scoped to the ADMIN write-path specs, whose value is catching contract
 * drift against a deployed backend. This lane still exercises the real backend and
 * the real database — just ones it provisions itself.
 *
 * Requires: local Postgres + `psql` on PATH, and OBRS-backend as a sibling checkout
 * (override with OBRS_BACKEND_DIR). Ports/db/credentials are env-overridable; the
 * defaults below are lane-private so this can run next to a normal :8080 + :4200
 * dev stack without either noticing the other.
 */

const FRONTEND_PORT = process.env['E2E_FRONTEND_PORT'] ?? '4210';
const BACKEND_PORT = process.env['E2E_BACKEND_PORT'] ?? '8181';
const BASE_URL = `http://localhost:${FRONTEND_PORT}`;
const API_URL = `http://localhost:${BACKEND_PORT}`;

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: '**/my-bookings-reschedule.spec.ts',
  timeout: 90_000,

  // The spec is stateful by design: it really reschedules E2E-ELIGIBLE and really
  // cancels E2E-CANCELLED, and later tests assert the resulting states. That ordering
  // only holds in a single worker running the file top-to-bottom.
  fullyParallel: false,
  workers: 1,

  // Retrying would replay a mutation against a database the first attempt already
  // changed, turning a real failure into a confusing different failure. A flake here
  // is a bug in the fixture — surface it rather than paper over it.
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
      // Seeds the database and then boots the backend -- one command, in that order.
      // See the script's header for why this cannot live in globalSetup.
      command: 'pwsh -NoProfile -ExecutionPolicy Bypass -File e2e/scripts/start-e2e-backend.ps1',
      url: `${API_URL}/api/routes`,
      // Generous on purpose. A warm run reaches /api/routes in well under a minute,
      // but the slow path is real and routine: any change on dev invalidates the
      // Maven build, and a full recompile (~676 sources) + 23 Flyway migrations +
      // Spring boot has been measured past five minutes on this machine. A timeout
      // that only fits the warm path turns "your first run of the day" into a
      // failure that looks like a product bug.
      timeout: 900_000,
      // Default false, and that default is the whole point: a backend that is
      // already up was started against a database THIS run has not rebuilt, which is
      // precisely the stale-fixture failure mode this lane exists to eliminate.
      //
      // E2E_REUSE_SERVERS=1 opts out while iterating on the spec itself — it skips
      // a ~2 minute Maven+Flyway+boot cycle per run. Use it only when you are
      // debugging assertions, never to judge whether the suite passes: reusing means
      // the fixture carries whatever the previous run's mutations left behind
      // (a rescheduled E2E-MOVE, a cancelled booking), so a green run under it
      // proves nothing about a clean one.
      reuseExistingServer: process.env['E2E_REUSE_SERVERS'] === '1',
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
