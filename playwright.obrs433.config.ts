import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-433 QA-only throwaway config. Drives the already-running local
 * full-stack (ng serve --configuration sit on :4200, apiUrl temp-overridden
 * to http://localhost:8080, backend booted against obrs433qa). Not committed.
 */
export default defineConfig({
  // OBRS-1611: this lane attaches to the stack the operator started by hand (see the
  // header above). The guard still names the tree that served the pages, but for this
  // one a foreign tree on the port is the documented state, so it must not refuse.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  metadata: { laneTree: 'attach-to-operator-stack' },
  testDir: './e2e/tests',
  testMatch: '**/obrs-433-my-reports.spec.ts',
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on',
    viewport: { width: 1536, height: 864 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Via npm so `prestart:sit` runs the local-env shape gate first (OBRS-536).
    command: 'npm run start:sit -- --port 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
