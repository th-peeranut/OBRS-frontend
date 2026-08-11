import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1222 -- the CAPTURE lane for this card's Jira evidence.
 *
 *   OBRS_CAPTURE_STAGE=BEFORE npx playwright test --config=playwright.obrs1222.config.ts
 *   OBRS_CAPTURE_STAGE=AFTER  npx playwright test --config=playwright.obrs1222.config.ts
 *
 * Separate from the gate config on purpose. This spec takes pictures and
 * asserts nothing, because it has to run unchanged against BOTH the pre-card
 * and post-card runtimes -- the BEFORE pass is taken with `git stash push --
 * src/` applied and `ng serve --watch` rebuilding under it. A spec that can
 * only pass on one of the two trees cannot produce an honest BEFORE.
 *
 * `--no-live-reload` for the same reason obrs1141 uses it: the live-reload
 * socket reconnects mid-screenshot and repaints the page.
 *
 * The frontend is served with the DEFAULT configuration, so `apiUrl` points at
 * http://localhost:8080 where nothing is listening -- every request is either
 * fulfilled by the spec or fails, and nothing reaches SIT.
 */

const PORT = process.env['OBRS1222_PORT'] ?? '4234';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-1222-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 900 },
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
