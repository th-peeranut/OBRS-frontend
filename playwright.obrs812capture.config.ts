import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-812 - the CAPTURE lane for this card's Jira evidence.
 *
 *   npx playwright test --config=playwright.obrs812capture.config.ts
 *
 * Same shape as playwright.obrs1572capture.config.ts with one difference: it
 * serves `--configuration gate`, the build the staff contrast gate itself runs
 * against, so a frame here and a number there describe the same page.
 *
 * Not part of the committed regression suite - the verdict belongs to
 * staff-contrast-gate.spec.ts; what this lane adds is the pictures.
 */
const PORT = process.env['OBRS812_PORT'] ?? '4288';

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-812-capture.spec.ts'],
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
