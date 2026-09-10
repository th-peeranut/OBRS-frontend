/**
 * OBRS-1774 state-contrast capture.
 *
 * A config of its own for the reason `playwright.obrs772.config.ts` explains at
 * length: `playwright.gate.config.ts` carries an explicit `testMatch` allowlist,
 * so a capture spec added to `e2e/tests` is invisible to it, and widening that
 * allowlist would put a spec that asserts nothing inside the merge gate.
 *
 * 4241, not the next number to hand: `scripts/check-e2e-lanes.mjs` fails the
 * build when two configs share a default port, because running both the
 * documented way with neither env var set makes the second attach to the first
 * one's server and report its tree as the result (OBRS-1531).
 *
 * ASCII-only source.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = process.env['E2E_OBRS1774_PORT'] ?? '4241';

export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testMatch: ['**/obrs-1774-state-capture.spec.ts'],

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
