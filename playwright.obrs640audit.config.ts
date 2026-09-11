import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-640 - the audit lane for the mobile tap-target + typography sweep.
 *
 *   npx playwright test --config=playwright.obrs640audit.config.ts
 *
 * Same shape as playwright.obrs1782capture.config.ts, and `--configuration gate` for the
 * same reason: it is the build the customer-contrast gate measures, so a box measured
 * here is the box a real deploy renders.
 *
 * Deliberately NOT wired into playwright.gate.config.ts's testMatch -- docs/prod/LANE-
 * BRIEFS.md#obrs-640 is explicit that this gate lands silently for now (Phase A is the
 * audit and the baseline, not the fix). CAPTURE lane in e2e/lanes.json for the same
 * reason every other single-spec config here is: it reports on a card, it is not part of
 * the committed regression suite.
 */
const PORT = process.env['OBRS640_PORT'] ?? '4295';

export default defineConfig({
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-640-mobile-tap-typography.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 300_000,
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
