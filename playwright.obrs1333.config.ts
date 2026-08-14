import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1333 QA-only local lane. Points at the local dev stack the QA session
 * already has running (backend :8080 against the obrs1333qa Postgres DB,
 * `ng serve` on :4200) -- no webServer block, no globalSetup, nothing SIT.
 * Not wired into any CI lane; this is a throwaway verification config, left
 * in the worktree uncommitted alongside the spec for the orchestrator to
 * inspect, same as the e2e/capture-obrs-1333-maintenance-plan.mjs script.
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/obrs-1333-maintenance-plan.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
