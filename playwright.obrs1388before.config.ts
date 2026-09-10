import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1388 QA -- BEFORE evidence, captured against a clean origin/dev checkout
 * (../OBRS-frontend, HEAD c1626562, served on :4200) pointed at the SAME local
 * backend :8080 the AFTER evidence used. Proves the pre-change state: no "ยื่นเคลม"
 * action on the staff delivery list, and /admin/parcel-claims does not exist.
 */
export default defineConfig({
  // OBRS-1611: this lane attaches to the stack the operator started by hand (see the
  // header above). The guard still names the tree that served the pages, but for this
  // one a foreign tree on the port is the documented state, so it must not refuse.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  metadata: { laneTree: 'attach-to-operator-stack' },
  testDir: './e2e/tests',
  testMatch: ['**/obrs-1388-before-capture.spec.ts'],
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
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'echo already-running',
    url: 'http://localhost:4200',
    timeout: 5_000,
    reuseExistingServer: true,
  },
});
