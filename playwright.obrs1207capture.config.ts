import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1207 — the card-evidence run for `e2e/tests/obrs-1207-capture.spec.ts`.
 *
 * A config of its own rather than a flag on the gate lane, for the reason the
 * gate config states at length: its `testMatch` is an explicit allow-list, and
 * `scripts/check-e2e-lanes.mjs` asserts that list equals the GATE lane in
 * `e2e/lanes.json`. A capture script is not a gate — it asserts almost nothing —
 * so admitting it there to make one command work would weaken the only claim
 * that list makes.
 *
 * Everything else is copied from the gate config deliberately, because the
 * pictures have to be of the same thing the gate measured: the default (local)
 * serve so no request can escape to SIT, the pinned 1280×720 viewport, no
 * `globalSetup`. `workers: 1` because the two capture cases write into one
 * output directory and a screenshot is worth nothing if you cannot say which
 * run produced it.
 *
 *   OBRS1207_TAG=BEFORE npx playwright test --config=playwright.obrs1207capture.config.ts
 *
 * Output lands in `e2e-evidence/obrs-1207/` (gitignored) — never in the office
 * repo, which check-e2e-lanes rule 3 exists to prevent.
 */

const PORT = process.env['E2E_GATE_PORT'] ?? '4230';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['**/obrs-1207-capture.spec.ts'],
  timeout: 90_000,
  workers: 1,
  retries: 0,
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
    command: `npx ng serve --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: !process.env['CI'],
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
