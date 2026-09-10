import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1569. Evidence config for obrs-1569-capture.spec.ts.
 *
 * Serves the `gate` configuration rather than the default one, because the spec measures
 * COLOUR: the gate build is the one whose web fonts come from e2e/fixtures/fonts, and a
 * screenshot taken while a Google font was still arriving is a picture of a different page.
 */
const PORT = process.env['OBRS1569_PORT'] ?? '4269';

export default defineConfig({
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1569-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 180_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'],
    },
  },
  webServer: {
    command: `npx ng serve --configuration gate --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
