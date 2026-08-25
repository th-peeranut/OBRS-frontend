import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-969 - the CAPTURE lane for this card's Jira evidence AND its measurements.
 *
 *   OBRS969_PHASE=BEFORE npx playwright test --config=playwright.obrs969capture.config.ts
 *   OBRS969_PHASE=AFTER  npx playwright test --config=playwright.obrs969capture.config.ts
 *
 * Same shape as playwright.obrs768capture.config.ts, with one deliberate difference: the
 * server runs `--configuration gate`. `analytics-consent-control` renders only where
 * `environment.analytics` carries a measurement ID (OBRS-1179) and `gate` is the only
 * committed environment that does. AC-2 is about that component, so on a default build
 * this lane would print ABSENT for it and prove nothing. `apiUrl` still points at
 * http://localhost:8080 where nothing is listening, and the spec's fixtures fulfil every
 * /api/** call, so nothing reaches SIT.
 *
 * Not part of the committed regression suite: what is worth pinning already runs in the
 * GATE lane, because all four pages are in `CUSTOMER_PAGES`. What this lane adds is the
 * pictures and the surface identity a contrast floor cannot express.
 */

const PORT = process.env['OBRS969_PORT'] ?? '4246';

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-969-capture.spec.ts'],
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
    command: `npx ng serve --configuration gate --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
