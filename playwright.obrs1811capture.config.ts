import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1811 — the CAPTURE lane for this card's Jira evidence.
 *
 *   npx playwright test --config=playwright.obrs1811capture.config.ts
 *
 * Same shape as playwright.obrs1808capture.config.ts. This spec takes pictures and asserts only
 * that what it is about to shoot is on screen; the regressions worth pinning live in
 * src/app/modules/staff/pages/parcel-delivery-list/parcel-delivery-list-page.component.spec.ts
 * and in the backend's ParcelConsignedDeliveryIT, both of which run in CI.
 *
 * The frontend is served with the DEFAULT configuration, so `apiUrl` points at
 * http://localhost:8080: every request is either fulfilled by the spec's fixtures or fails as a
 * network error, and nothing reaches SIT.
 */

const PORT = process.env['OBRS1811_PORT'] ?? '4249';

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1811-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
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
