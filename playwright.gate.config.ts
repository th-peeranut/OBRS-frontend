import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-602 — the DETERMINISTIC lane. This is the only E2E config that is a merge gate.
 *
 *   npm run e2e:gate
 *
 * Every spec listed in `testMatch` below intercepts its own network traffic, so this
 * lane needs no backend, no seeded data, and no external service. It is the answer to
 * the question OBRS-602 was opened to answer: *which E2E tests can be trusted to mean
 * something when they go red?*
 *
 * WHY A SEPARATE CONFIG RATHER THAN FIXING THE DEFAULT ONE
 * `playwright.config.ts` sets `testDir: './e2e'` with no `testIgnore`, so it sweeps
 * every spec in the directory into one run against live SIT. That is how a suite
 * nobody ever defined grew to 223 cases: each card added a spec plus a bespoke config
 * to run it under, and the default config silently adopted the spec while supplying
 * none of what the bespoke config provided (its own database, its viewport, its port,
 * its hand-started backend). Several of those specs cannot pass under the default
 * config by construction — `my-bookings-reschedule` has a whole header explaining why
 * it had to leave SIT, and the default config runs it against SIT anyway. The 36
 * failures on that run were not flakes; most were specs executing outside the
 * environment they were written for. See docs/e2e-lanes.md for the full partition.
 *
 * THE THREE RULES THAT KEEP THIS LANE HONEST
 *
 * 1. NO `globalSetup`. The default config's global setup logs into live SIT to mint
 *    `e2e/fixtures/admin-auth.json` (gitignored, never committed). That makes SIT a
 *    hard dependency of *every* test in that run — including the ones that mock 100%
 *    of their own traffic. A gate that a cold-starting Koyeb instance can turn red is
 *    not a gate. Specs here that need a session use `e2e/fixtures/gate-auth.json`, a
 *    committed synthetic one.
 *
 * 2. The frontend is served with the DEFAULT (local) configuration, not `sit`, so
 *    `apiUrl` points at `http://localhost:8080` — where nothing is listening. This is
 *    deliberate and is the enforcement mechanism: a request this lane failed to
 *    intercept gets ECONNREFUSED instead of quietly succeeding against SIT. A spec
 *    that passes here is *provably* hermetic rather than asserted to be. It is also
 *    why adding a spec to `testMatch` is a real check and not a bookkeeping step.
 *
 * 3. Explicit `viewport`. `devices['Desktop Chrome']` happens to be 1280×720 today,
 *    but two specs in this repo were authored against a viewport their comment names
 *    and no config sets. Pinning it here means a Playwright upgrade cannot silently
 *    move what these tests measure.
 *
 * `workers: 3`, not the default `cpus/2`. The reported hang at 214/223 was never
 * reproduced, but this box has a measured failure mode where parallel headless Chrome
 * instances die under CPU contention from other sessions, and a dead worker presents
 * as a run that never finishes. Three workers keeps the lane fast without betting the
 * gate on an idle machine.
 *
 * `reporter: 'list'`, not `'html'`. The html reporter defaults to `open: 'on-failure'`,
 * which serves the report and blocks until interrupted. It is TTY-gated so it cannot
 * hang an agent run, but a human running the gate deserves an exit code, not a server.
 */

const PORT = process.env['E2E_GATE_PORT'] ?? '4230';

export default defineConfig({
  testDir: './e2e/tests',

  // Explicit allow-list, never a glob. Membership is the claim "this spec needs
  // nothing but a browser", and that claim should be made one file at a time by
  // someone who checked. A glob would re-create the sweep this config exists to undo.
  testMatch: [
    '**/route-smoke.spec.ts',
    '**/confirm-guidance-flow.spec.ts',
    '**/report-usability-issue.spec.ts',
    '**/route-map.spec.ts',
    '**/b2c-critical-path.spec.ts',
  ],

  timeout: 60_000,
  workers: 3,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // Default configuration on purpose -- see rule 2 above. `--no-live-reload` because
    // a rebuild mid-run would reload the page out from under an assertion.
    command: `npx ng serve --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: !process.env['CI'],
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
