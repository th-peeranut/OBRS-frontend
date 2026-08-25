/**
 * OBRS-769 capture lane. No `webServer`: the BEFORE phase serves a THROWAWAY
 * worktree at origin/dev and the AFTER phase serves this one, so the two builds
 * cannot come from one config (the OBRS-575 / OBRS-702 / OBRS-722 idiom).
 *
 *   git worktree add --detach ../OBRS-frontend-wt-769-before origin/dev
 *   (before) npx ng serve --port 4761   -> OBRS769_PHASE=before OBRS769_PORT=4761
 *   (after)  npx ng serve --port 4762   -> OBRS769_PHASE=after  OBRS769_PORT=4762
 *   npx playwright test --config=playwright.obrs769capture.config.ts
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = process.env['OBRS769_PORT'] ?? '4762';

export default defineConfig({
  // OBRS-1616: no `webServer`, so nothing said which tree served the shots. The BEFORE
  // phase points OBRS769_PORT at the throwaway worktree above, so a foreign tree on the
  // port is what this lane ASKS for -- it needs the banner naming it, never the refusal.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  metadata: { laneTree: 'attach-to-operator-stack' },
  testDir: './e2e/tests',
  testMatch: ['**/obrs-769-capture.spec.ts'],
  timeout: 120_000,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 1400 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
