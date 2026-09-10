import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-907 QA regression — before/after parity capture for the loading-state
 * consolidation. NOT part of any lane in e2e/lanes.json; run by hand.
 *
 * Hermetic on the same terms as playwright.gate.config.ts: served with the
 * DEFAULT (local) build configuration, so apiUrl points at :8080 where
 * nothing listens, and the two synthetic-session helpers
 * (e2e/support/gate-admin-session.ts, e2e/support/customer-pages.ts) stub
 * every call the pages need. This is deliberate rather than a shortcut —
 * it makes the BEFORE (ee6f026d) and AFTER (this branch) runs byte-for-byte
 * comparable (same fixtures, same timing, no live-SIT variance), and it is
 * the same mechanism e2e/tests/obrs-907-loading-state-reduced-motion.spec.ts
 * already uses for the notification-bell half of this exact surface.
 *
 * Usage (same port both phases, sequential, one at a time):
 *   $env:OBRS907QA_PHASE='before'; npx playwright test --config=playwright.obrs907qa.config.ts
 *   $env:OBRS907QA_PHASE='after';  npx playwright test --config=playwright.obrs907qa.config.ts
 *
 * Port is fixed at 5217 (checked free, distinct from the GATE lane's 4917
 * used earlier in this same QA pass) to avoid colliding with other parallel
 * sessions' worktrees.
 */

const PORT = process.env['OBRS907QA_PORT'] ?? '5217';

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['**/obrs-907-qa-parity-capture.spec.ts'],
  timeout: 60_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'off',
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
