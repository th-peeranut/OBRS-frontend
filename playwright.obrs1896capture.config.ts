import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1896 - evidence capture lane. Same shape as playwright.obrs1832capture.config.ts
 * (same `--configuration gate` build, same guard), its own port so it never attaches to
 * another tree's server.
 *
 *   npx playwright test --config=playwright.obrs1896capture.config.ts
 */
const PORT = process.env['OBRS1896_PORT'] ?? '4298';

export default defineConfig({
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1896-settlement-other-row.capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 300_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx ng serve --configuration gate --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
