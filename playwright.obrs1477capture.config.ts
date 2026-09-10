import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1477 — the CAPTURE lane for this card's Jira evidence.
 *
 *   OBRS1477_PHASE=BEFORE npx playwright test --config=playwright.obrs1477capture.config.ts
 *   OBRS1477_PHASE=AFTER  npx playwright test --config=playwright.obrs1477capture.config.ts
 *
 * Same shape as playwright.obrs1424capture.config.ts, and NOT part of the committed
 * regression suite — the regression worth pinning lives in the unit suite
 * (walk-in-center-panel.component.spec.ts, OBRS-1477 block). What this lane adds is the
 * pictures, plus the PUT body a unit spec can only assert one layer above the wire.
 *
 * Served with the DEFAULT configuration, so `apiUrl` is http://localhost:8080 where
 * nothing is listening: nothing reaches SIT.
 */

const PORT = process.env['OBRS1477_PORT'] ?? '4277';

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1477-capture.spec.ts'],
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
