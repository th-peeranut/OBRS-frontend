import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-766 QA verification lane — counter act-on-behalf cancel.
 *
 * Runs against an already-running LOCAL full stack (frontend :4200, backend
 * :8080 against the isolated `obrs766qa` Postgres DB) — see
 * docs/sessions/SESSION-OBRS-766-counter-cancel-qa.md for the setup recipe.
 * Deliberately no `webServer` block: both halves are started and torn down
 * by hand around this run, not by Playwright, because the backend has no
 * npm-script equivalent Playwright could launch itself.
 *
 * QA-only, not part of any CI lane (`e2e/lanes.json`) — left in the worktree
 * uncommitted per the QA harness rule against deleting verification specs.
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/obrs766-*.spec.ts',
  // Frees seat inventory consumed by previous passes — without it the suite
  // is single-use and its third run fails at seeding, not at any assertion.
  // OBRS-1616: that file also CALLS the lane-tree guard, because a config may
  // name only one globalSetup and this lane already spends it.
  globalSetup: './e2e/support/obrs766-global-setup.ts',
  // OBRS-1616: no `webServer`, so nothing said which tree served these pages. This lane
  // drives the stack the operator started by hand (see the header above), so a foreign
  // tree on the port is the documented state -- the guard must name it, not refuse.
  metadata: { laneTree: 'attach-to-operator-stack' },
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 900 },
    // OBRS-766: on, not retain-on-failure — the card needs a video of the PASSING
    // primary flow as evidence, and retain-on-failure discards exactly that one.
    video: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
