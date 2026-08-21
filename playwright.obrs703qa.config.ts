import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-703 QA lane - runs against the backend + frontend already started BY HAND for this
 * QA pass (backend :8081 with dev,local profiles against a dedicated `obrs703qa` database;
 * frontend :4200 via `npm run start:local`, environment.ts apiUrl overridden to :8081 for
 * this worktree only). No webServer block: this is a "use what's already running" config,
 * same convention as playwright.obrs1308.config.ts.
 */
export default defineConfig({
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
