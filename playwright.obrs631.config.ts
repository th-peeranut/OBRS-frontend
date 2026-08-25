import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-631 — evidence for the 2.0 privacy notice.
 *
 * Serves the ordinary development build (no measurement IDs, no SIT backend):
 * the page under test renders entirely from `public/i18n/*.json` and the version
 * module, so nothing here needs a database, a session or a third party. That is
 * also why it is not folded into playwright.obrs867.config.ts — that lane exists
 * to carry deliberately-invalid analytics IDs, which have nothing to do with
 * whether a legal notice reads correctly.
 *
 * Private port (:4268), like every other lane here, so it can run beside an
 * unrelated `npm start` on :4200 (OBRS-184's reasoning).
 *
 *   npx playwright test --config=playwright.obrs631.config.ts
 */
export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-631-privacy-notice.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:4268',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx ng serve --port 4268',
    url: 'http://localhost:4268',
    reuseExistingServer: true,
    timeout: 240_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
