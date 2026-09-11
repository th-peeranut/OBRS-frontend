import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1550 - the CAPTURE lane for this card's Jira evidence.
 *
 *   npx playwright test --config=playwright.obrs1550capture.config.ts
 *
 * Same shape as playwright.obrs1572capture.config.ts, on the default configuration:
 * nothing here depends on an environment-specific flag, and every /api/** call is
 * fulfilled by the spec's fixtures, so nothing reaches SIT or a local backend.
 *
 * Not part of the committed regression suite - the behaviour itself is pinned by the
 * Karma specs on the edit page and the dialog. What this lane adds is the two AFTER
 * pictures AC-5 asks for, taken off a real rendered admin screen.
 */
const PORT = process.env['OBRS1550_PORT'] ?? '4250';

export default defineConfig({
  // Names the tree this run measures, and refuses a port another worktree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1550-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 180_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx ng serve --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
