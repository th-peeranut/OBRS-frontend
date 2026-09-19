import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1434 AC-4.8 / AC-2 — BEFORE/AFTER evidence for the clause 78/79 notice and
 * the e-ticket conditions line.
 *
 *   OBRS1434_PHASE=before OBRS1434_OUT=e2e-evidence/obrs-1434/before \
 *     npx playwright test --config=playwright.obrs1434capture.config.ts   # pristine tree
 *   npx playwright test --config=playwright.obrs1434capture.config.ts     # the finished branch
 *
 * One tree, two runs, taken in that order — the BEFORE is the tree before the code
 * was written rather than a tree reverted afterwards.
 *
 * Hermetic on the gate lane's terms (playwright.gate.config.ts, rule 1): the spec
 * seeds its own sessions and fulfils every `/api/**` call, so there is no backend,
 * no database and no SIT dependency.
 */
const PORT = process.env['OBRS1434_PORT'] ?? '4434';

export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1434-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx ng serve --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
