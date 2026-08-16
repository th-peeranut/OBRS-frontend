import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1258 QA regression — sales-point picker. NOT part of any lane in
 * e2e/lanes.json; run by hand against the already-running LOCAL stack
 * (backend :8080 / obrs1258qa DB, frontend :4200 via `npm run start:local`).
 * reuseExistingServer is unconditionally true: this config must never try to
 * spin up a second frontend on :4200 or kill the one QA is using for manual
 * verification in the same session.
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['**/obrs-1258-qa-regression.spec.ts'],
  timeout: 60_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start:local',
    url: 'http://localhost:4200',
    timeout: 300_000,
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
