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
 *    not a gate. No spec in this lane uses `storageState` at all: every spec that needs
 *    a session seeds a fake `auth_token` into localStorage from its own `addInitScript`,
 *    so there is no auth artefact for this config to depend on. (Scrutinize OBRS-602:
 *    this paragraph previously named a committed `e2e/fixtures/gate-auth.json`, which
 *    does not exist and never did. OBRS-618 kept it that way deliberately — a committed
 *    storageState file keys its localStorage to an absolute `origins` entry, so it would
 *    silently apply to nothing the day `E2E_GATE_PORT` changed. `addInitScript` has no
 *    such coupling; the shared helper is `e2e/support/gate-admin-session.ts`.)
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
    // OBRS-618. These three mocked all of their own traffic from the day they were
    // written; the only thing keeping them out was `storageState: admin-auth.json`,
    // minted by logging into live SIT. They seed a synthetic session in-browser now
    // (e2e/support/gate-admin-session.ts) and were admitted only after passing here —
    // against a backend that does not exist, which is what makes membership mean
    // something rather than being a bookkeeping edit.
    '**/focus-retention.spec.ts',
    '**/stop-filter-route-pair.spec.ts',
    '**/trip-details-edit.spec.ts',
    '**/staff-sell-walkin.spec.ts',
    // OBRS-584. Measures WCAG contrast on eight customer pages in both themes by
    // reading getComputedStyle in the browser -- the only place the CASCADE
    // exists, which is why no stylesheet parser could see the 2.79:1 that
    // OBRS-575 shipped past a green CI. Hermetic on the same terms as the rest
    // of the lane: it stubs every /api/** call and aborts Maps.
    '**/customer-contrast-gate.spec.ts',
    // OBRS-753. The malformed-box defect that made `b2c-critical-path` the one red on
    // the first CI run of this lane. It is a MISSING `:host { display }`, so there is
    // nothing in any diff for a reviewer to catch and no stylesheet parser can tell an
    // inline host that is fine from one that is malformed -- only the cascade knows,
    // and the cascade only exists in a browser. Reuses the fixtures above, so it costs
    // this lane page loads and no new machinery.
    '**/review-total-host-box.spec.ts',
  ],

  timeout: 60_000,
  // OBRS-618 dropped this from 3 to 2. That card added three admin specs which each boot
  // the staff shell repeatedly, and at 3 workers `b2c-critical-path` — untouched by that
  // card, and green at 18.9s on the lane as it stood before it
  // — began timing out at 60s waiting for a navigation, twice in a row. Run alone under
  // this same config it takes 7.8s. That was read as contention on this box — several Claude
  // sessions, an `ng serve` and N headless Chromes competing for the same cores.
  //
  // OBRS-750 CORRECTION: for `b2c-critical-path` specifically that diagnosis was wrong. The
  // spec clicked `.btn-confirm` with `force: true`, which does not aim the event at the
  // element and so delivered it to whichever element was topmost — the button's own parent.
  // It timed out on a clean GitHub runner with nothing else running. `workers: 2` is kept
  // because CPU contention on this box is separately real, but do not reach for it to
  // explain a `waitForURL` that never fires: check first whether the click landed at all.
  // A gate that reds because the machine was busy teaches people to re-run it until it
  // is green, and a gate nobody believes is not a gate. Wall-clock cost is ~30s.
  workers: 2,
  retries: 0,

  // Unconditionally, not `!!process.env.CI`. This lane IS the merge gate and it runs on
  // a developer's box, so the machine where a stray `test.only` would do its damage is
  // exactly the machine CI-gating exempts. Without this, one forgotten `.only` shrinks
  // the gate from the whole lane to 1 case and still exits 0 — a green run asserting almost
  // nothing, which is the failure mode this whole card exists to end. (Scrutinize OBRS-602.)
  //
  // OBRS-750: no case count is quoted anywhere in this file any more. Both of the ones that
  // were here had rotted, and one was read back as current and reported as fact in the
  // session that closed OBRS-735 — the card about exactly that failure. `npm run e2e:gate`
  // prints the real number on every run and docs/e2e-lanes.md carries it for humans.
  // Do not reintroduce one here.
  forbidOnly: true,
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
