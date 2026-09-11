import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1808 — the CAPTURE lane for this card's Jira evidence.
 *
 *   npx playwright test --config=playwright.obrs1808capture.config.ts
 *
 * Same shape as playwright.obrs629capture.config.ts. This spec takes pictures and asserts only
 * that what it is about to shoot is on screen; the regressions worth pinning live in
 * src/app/modules/staff/components/parcel-waybill-paper/parcel-waybill-paper.component.spec.ts
 * and in gate 6 of scripts/check-i18n-parity.mjs, both of which run in CI.
 *
 * The frontend is served with the DEFAULT configuration, so `apiUrl` points at
 * http://localhost:8080: every request is either fulfilled by the spec's fixtures or fails as a
 * network error, and nothing reaches SIT.
 */

const PORT = process.env['OBRS1808_PORT'] ?? '4247';

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1808-capture.spec.ts'],
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
