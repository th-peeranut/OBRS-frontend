import { defineConfig, devices } from '@playwright/test';
import { ATTACH_TO_OPERATOR_STACK } from './e2e/support/lane-tree-guard';

/**
 * OBRS-637 -- the CAPTURE lane for this card's Jira evidence.
 *
 *   OBRS637_STAGE=BEFORE OBRS637_PORT=4637 npx playwright test --config=playwright.obrs637capture.config.ts
 *   OBRS637_STAGE=AFTER  OBRS637_PORT=4638 npx playwright test --config=playwright.obrs637capture.config.ts
 *
 * TWO SERVERS, STARTED BY HAND, and no `webServer` block -- the same shape
 * obrs-1432 / obrs-722 / obrs-769 use. :4637 serves a detached worktree at the
 * `origin/dev` this branch is merged up to, :4638 serves this branch, so the
 * BEFORE frame is the real previous runtime instead of a reconstruction.
 *
 * `laneTree: attach-to-operator-stack` (OBRS-1611) because the BEFORE arm's
 * server is ANOTHER tree's on purpose -- that is the whole point of it, so a
 * guard that threw on it would refuse the legitimate run. The marker keeps step 1
 * of the guard and drops step 2: the banner still prints the tree, sha and branch
 * that actually served each set of pictures, which is what goes onto the card.
 *
 * Served with the DEFAULT `ng serve` configuration, so `apiUrl` points at
 * http://localhost:8080 where nothing is listening: every call is either
 * fulfilled by e2e/support/customer-pages.ts or fails, and nothing reaches SIT.
 *
 * The viewport is the card's own 390x664 (iPhone 14 CSS px) and it belongs in the
 * project's `use`, not the top-level one -- a project's `use` wins, so
 * `devices['Desktop Chrome']` would put its 1280x720 back and the run would
 * photograph the desktop layout, which is the layout this card does not change.
 */

const PORT = process.env['OBRS637_PORT'] ?? '4638';

export default defineConfig({
  globalSetup: './e2e/support/lane-tree-guard.ts',
  metadata: { laneTree: ATTACH_TO_OPERATOR_STACK },
  testDir: './e2e/tests',
  testMatch: ['obrs-637-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 180_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Repeated from the top-level `use` on purpose: lane-tree-guard reads the
        // port off `config.projects[0].use.baseURL` when a lane declares no
        // webServer, and this lane declares none.
        baseURL: `http://localhost:${PORT}`,
        viewport: { width: 390, height: 664 },
      },
    },
  ],
});
