/**
 * Playwright config for sidebar-hover-expand acceptance tests.
 * Targets port 4202 (4200/4201 occupied by other worktrees) with
 * --disable-web-security so the browser does not block SIT CORS.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './e2e/global-setup-4202.ts',
  testDir: './e2e/tests',
  testMatch: '**/sidebar-hover-expand.spec.ts',
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4202',
    trace: 'on-first-retry',
    launchOptions: {
      args: [
        '--disable-web-security',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1400, height: 900 },
      },
    },
  ],
});
