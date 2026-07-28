import { defineConfig, devices } from '@playwright/test';
import lanes from './e2e/lanes.json';

/**
 * The SIT lane. Specs here deliberately exercise the deployed SIT backend, per
 * docs/adr/0001-admin-e2e-hits-real-sit-backend.md: their value is catching
 * frontend/backend contract drift, which a mock cannot do by definition.
 *
 * NOT A MERGE GATE, and OBRS-602 made that explicit rather than merely true. SIT is a
 * shared, mutable environment that several sessions write to at once, and `globalSetup`
 * below mints its admin session by logging into it — so a cold-starting Koyeb instance
 * turns this whole run red without a line of application code being wrong. The gate is
 * `playwright.gate.config.ts`; this lane is a health check you read, not a signal you
 * block on.
 *
 * WHAT CHANGED IN OBRS-602
 * This config used to declare `testDir: './e2e'` with no `testIgnore`, which meant it
 * silently adopted every spec in the directory — 223 cases across 24 files, a set nobody
 * had ever seen pass together. Nine of those specs were written for an environment this
 * config does not provide (a seeded database of their own, a 390px viewport, a backend
 * started by hand on another port), so they could not pass here no matter what the
 * application did. Their failures were then read as pre-existing noise, which they were,
 * which is exactly why the habit survived: with no green baseline anywhere, "probably
 * not mine" is always the cheapest available conclusion and is usually right.
 *
 * Membership now comes from `e2e/lanes.json`, which is the single registry for all five
 * lanes and is enforced by `scripts/check-e2e-lanes.mjs`.
 *
 * Note the deliberate asymmetry with the gate config: that one spells its `testMatch`
 * out by hand and the gate asserts the two agree, because adding a spec to the merge
 * gate is a claim about that spec that someone should have to make on purpose. This
 * list is derived instead — it is long, it changes often, and getting it wrong costs a
 * skipped health check rather than a false green.
 */

const SIT_SPECS = lanes.specs
  .filter((s) => s.lane === 'SIT-LIVE' || s.lane === 'GATE-BLOCKED')
  .map((s) => `**/${s.spec}`);

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e/tests',
  testMatch: SIT_SPECS,
  timeout: 90_000,
  retries: 0,

  // 'list', not 'html'. The html reporter defaults to `open: 'on-failure'`, which serves
  // the report and blocks until interrupted; on a suite that is expected to be partly
  // red that reads as a hung run. `npx playwright show-report` is still there on demand.
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:4202',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
          ],
        },
      },
    },
  ],
  webServer: {
    // Through `npm run start:sit`, not `ng serve` directly, so npm's `prestart:sit` hook runs
    // scripts/check-local-env.mjs first (OBRS-536). A `--configuration sit` build reads the
    // GITIGNORED src/environments/environment.local.ts, so a fresh worktree — or any checkout
    // that predates the last field added to that contract — cannot compile here. Playwright
    // prefixes the compiler's output with `[WebServer]` and then reports `Timed out waiting
    // 120000ms from config.webServer`, which reads as a slow machine rather than a type error;
    // OBRS-617 had to route its own config around this lane for exactly that reason. The hook
    // fails in under a second naming the field and the line to add.
    command: 'npm run start:sit -- --port 4202',
    url: 'http://localhost:4202',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
