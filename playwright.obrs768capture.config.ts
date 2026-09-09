import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-768 - the CAPTURE lane for this card's Jira evidence AND its measurements.
 *
 *   OBRS768_PHASE=BEFORE npx playwright test --config=playwright.obrs768capture.config.ts
 *   OBRS768_PHASE=AFTER  npx playwright test --config=playwright.obrs768capture.config.ts
 *
 * Same shape as playwright.obrs1424capture.config.ts. It is NOT part of the committed
 * regression suite: the regression worth pinning is already in the GATE lane, because both
 * pages are in `CUSTOMER_PAGES` and the contrast gate sweeps them every run. What this lane
 * adds is the two things that gate cannot give - pictures, and the SURFACE identity this
 * card is actually about, which a contrast floor cannot express (a white page with dark
 * text scores perfectly).
 *
 * The frontend is served with the DEFAULT configuration, so `apiUrl` points at
 * http://localhost:8080 where nothing is listening: every request is either fulfilled by
 * the spec's fixtures or fails as a network error, and nothing reaches SIT.
 */

const PORT = process.env['OBRS768_PORT'] ?? '4244';

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-768-capture.spec.ts'],
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
