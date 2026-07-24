import { defineConfig } from '@playwright/test';

/**
 * OBRS-617 AC-4 — the SIT test-litter sweep proof.
 *
 * Pure API, no browser: the spec logs into SIT, seeds a TEST- route + ScheduleSet via
 * fetch, runs sweepSitTestLitter(), and asserts both are gone. It never calls page.goto,
 * so it needs neither
 *   - a baseURL / webServer — it must NOT ride playwright.config.ts, whose
 *     `ng serve --configuration sit` webServer cannot even build in a fresh worktree
 *     (the gitignored environment.local.ts is absent, OBRS-536); nor
 *   - the SIT global-setup admin session (it does its own login).
 *
 * SIT-LIVE lane (e2e/lanes.json): mutates the deployed backend by design, not a merge
 * gate, and self-cleaning — the sweep it verifies is also its teardown.
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/obrs-617-sit-sweep.spec.ts',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
});
