import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-577 — the local full-stack lane for /my-bookings' incremental "Load more".
 *
 *   npx playwright test --config=playwright.obrs577.config.ts
 *
 * Same shape as playwright.local.config.ts (OBRS-184): boots BOTH halves and rebuilds
 * the database from source on every run.
 *
 *   1. e2e/scripts/start-e2e-backend.ps1  drops + recreates `obrs577qa`, applies
 *      OBRS-backend's schema.sql -> data.sql -> e2e/fixtures/obrs577-load-more-fixture.sql,
 *      then boots the backend on :8182 against it.
 *   2. `ng serve --configuration e2e` serves the app on :4211 pointed at :8181
 *      (src/environments/environment.e2e.ts:26 — verified, it is not configurable).
 *
 * WHY NOT SIT (which every other config here uses)
 * The card's own AC1/AC4/AC3/mutation-reload checks all need an account with MORE THAN
 * 20 bookings, split across two independently-sized status buckets. No SIT seed account
 * clears 20 (the highest is customer@system.local at 37, read-only baseline — see the
 * OBRS-577 QA run) and creating dozens of real bookings there is not a reasonable ask.
 * Owning the database makes ">20 bookings, two buckets, one to cancel without touching
 * shared SIT data" a one-line fixture fact instead of an unreasonable one. Distinct
 * FRONTEND port and db name from playwright.local.config.ts (4211/obrs577qa vs
 * 4210/obrs184qa) — but the BACKEND port is deliberately the SAME :8181 for both
 * (see the inline note on BACKEND_PORT below), so the two lanes must run
 * SEQUENTIALLY, never side by side. An earlier version of this header said 8182 and
 * "both lanes can run without colliding"; it contradicted the code two lines down and
 * would have sent the next reader hunting for a port nothing ever binds.
 */

const FRONTEND_PORT = process.env['E2E_FRONTEND_PORT'] ?? '4211';
// environment.e2e.ts hardcodes apiUrl to http://localhost:8181 (OBRS-184's own lane) and
// is not build-time-configurable, so this lane's backend MUST also bind :8181 — distinct
// DB name (obrs577qa vs obrs184qa) is what keeps the two lanes from colliding, run
// sequentially rather than at the same time as playwright.local.config.ts.
const BACKEND_PORT = process.env['E2E_BACKEND_PORT'] ?? '8181';
const BASE_URL = `http://localhost:${FRONTEND_PORT}`;
const API_URL = `http://localhost:${BACKEND_PORT}`;

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: '**/obrs577-my-bookings-load-more.spec.ts',
  timeout: 90_000,

  // The cancel test really cancels one of the fixture's confirmed bookings, and a later
  // test in the same file may read the resulting state — keep the file single-worker,
  // top-to-bottom, same discipline as playwright.local.config.ts.
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
      command: 'pwsh -NoProfile -ExecutionPolicy Bypass -File e2e/scripts/start-e2e-backend.ps1',
      url: `${API_URL}/api/routes`,
      timeout: 900_000,
      reuseExistingServer: process.env['E2E_REUSE_SERVERS'] === '1',
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        E2E_DB_NAME: 'obrs577qa',
        E2E_BACKEND_PORT: BACKEND_PORT,
        E2E_FRONTEND_URL: BASE_URL,
        E2E_FIXTURE_SQL: 'obrs577-load-more-fixture.sql',
        // Throwaway worktree on origin/dev (9fd9cc4d), NOT the shared main OBRS-backend
        // clone -- that clone is on an unrelated branch with staged changes mid-session.
        // See the QA run notes for OBRS-577.
        OBRS_BACKEND_DIR: 'C:\\Users\\thpee\\Desktop\\workshop\\OBRS-backend-wt-577qa',
        // OBRS-1162: the JAVA_HOME override that used to sit here is GONE. It read
        //
        //     JAVA_HOME: 'C:\\Program Files\\Java\\jdk-25.0.3',
        //
        // and its comment said plainly that start-e2e-backend.ps1's own default
        // (jdk-21.0.11) was stale after OBRS-921 moved the pom to <java.version>25</...>,
        // and that overriding here was cheaper than editing a script shared by two lanes.
        // That trade bought one working lane and left the repository with TWO written-down
        // JDK paths instead of one - and this one pinned the PATCH level, so installing
        // 25.0.4 and removing 25.0.3 would kill it while <java.version> never moved.
        // start-e2e-backend.ps1 now derives the JDK from OBRS-backend's own pom.xml, so
        // there is nothing left for this line to correct. Do not reintroduce it: setting
        // JAVA_HOME here again would put this lane back on a number nobody updates.
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
