import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-773 before/after capture lane. Same shape as
 * playwright.obrs1372capture.config.ts: its own port so it cannot collide with
 * the gate lane (4230) or another session's `ng serve`, one worker because the
 * frames are taken in order and named by that order, and `reuseExistingServer`
 * so the BEFORE and AFTER runs share one server across the file swap that
 * separates them -- `ng serve` watches, so restoring dark-theme.scss rebuilds in
 * place and no second cold build is paid for.
 *
 * `--configuration gate` for the same reason playwright.gate.config.ts uses it:
 * it serves the app's two web fonts out of e2e/fixtures/fonts/ instead of
 * Google's CDN, so a frame taken here cannot come out in a fallback face because
 * gstatic was slow (OBRS-1370).
 *
 * ASCII-only source.
 */
const PORT = process.env['OBRS773_PORT'] ?? '4463';

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-773-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npx ng serve --configuration gate --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
});
