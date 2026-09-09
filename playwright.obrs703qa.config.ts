import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-703 QA lane - runs against the backend + frontend already started BY HAND for this
 * QA pass (backend :8081 with dev,local profiles against a dedicated `obrs703qa` database;
 * frontend :4200 via `npm run start:local`, environment.ts apiUrl overridden to :8081 for
 * this worktree only). No webServer block: this is a "use what's already running" config,
 * same convention as playwright.obrs1308.config.ts.
 */
export default defineConfig({
  // OBRS-1616: no `webServer`, so nothing said which tree served these pages. This lane
  // drives the stack the operator started by hand (see the header above), so a foreign
  // tree on the port is the documented state -- the guard must name it, not refuse.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  metadata: { laneTree: 'attach-to-operator-stack' },
  testDir: './e2e/tests',
  testMatch: ['**/obrs-703-operations-config-qa.spec.ts'],
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
