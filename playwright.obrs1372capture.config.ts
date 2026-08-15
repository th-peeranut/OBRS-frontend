import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1372 -- the CAPTURE lane for this card's Jira evidence.
 *
 *   OBRS_CAPTURE_STAGE=BEFORE npx playwright test --config=playwright.obrs1372capture.config.ts
 *   OBRS_CAPTURE_STAGE=AFTER  npx playwright test --config=playwright.obrs1372capture.config.ts
 *
 * Separate from the gate config for the reason obrs1222 gives: this spec takes
 * pictures and asserts nothing, because it has to run unchanged against BOTH the
 * pre-card and post-card runtimes. The BEFORE pass is taken with
 * `git stash push -- src/` applied and `ng serve --watch` rebuilding under it --
 * the e2e/ half is deliberately left in place, which is what lets the same spec
 * and the same fixtures shoot both trees.
 *
 * The viewport is the iPhone 14's 390x664 CSS px, the profile the prod
 * measurement on the card was taken at, because the defect is a function of it:
 * at 1280px the Thai copy fits one line and the bar is a fraction as tall.
 *
 * The frontend is served with the DEFAULT configuration, so `apiUrl` points at
 * http://localhost:8080 where nothing is listening -- every request is either
 * fulfilled by the spec's fixtures or fails, and nothing reaches SIT.
 */

const PORT = process.env['OBRS1372_PORT'] ?? '4238';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-1372-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 664 },
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
