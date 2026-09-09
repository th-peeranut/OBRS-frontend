/**
 * OBRS-772 boundary mock-up capture lane.
 *
 * A capture, not a gate: `obrs-772-boundary-mockup.spec.ts` asserts nothing, it
 * photographs the three candidate boundary policies on four real screens so the
 * owner can decide with pictures instead of swatches.
 *
 * It is a SEPARATE config rather than a line in `playwright.gate.config.ts`'s
 * `testMatch` on purpose. That allow-list is the merge gate's population, and a
 * capture that writes 32 PNGs has no business lengthening the lane every push
 * pays for.
 *
 * Own port env var and own default port: `scripts/check-e2e-lanes.mjs` fails a
 * build where two configs share either, and the gate lane's header explains why
 * -- a shared default quietly moves a lane nobody was thinking about.
 *
 * Everything else is copied from the gate lane deliberately, so the pictures are
 * of the same build the gate measures: the `gate` serve configuration (local web
 * fonts), the lane-tree guard that refuses to photograph another worktree's
 * server, and the offline resolver rule.
 *
 * ASCII-only source.
 */
import { defineConfig, devices } from '@playwright/test';

// 4237, not 4232: `playwright.obrs775.config.ts` already defaults there, and a
// separate env var does not separate the lanes -- run both the documented way with
// neither variable set and the second attaches to the first one's server and
// reports its tree as the result (OBRS-1531). `scripts/check-e2e-lanes.mjs`
// fails the build on that collision, which is how this was caught.
const PORT = process.env['E2E_OBRS772_PORT'] ?? '4237';

export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testMatch: ['**/obrs-772-boundary-mockup.spec.ts', '**/obrs-772-after.spec.ts'],

  forbidOnly: true,
  workers: 1,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `npx ng serve --configuration gate --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: !process.env['CI'],
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
