import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-960 QA throwaway config — targets the QA session's own already-running local stack
 * (localhost:4200 frontend / localhost:8080 backend / obrs960qa Postgres DB), started by hand
 * per obrs-qa.md ("bringing the lane up"). No webServer block: this must reuse the server that
 * is already up, never start a second one on the same port.
 *
 * Left uncommitted, alongside e2e/obrs960-driver-cash-qa.spec.ts, per obrs-qa.md's "do not
 * delete your Playwright specs after running them" — the orchestrator decides what is kept.
 */
export default defineConfig({
  // OBRS-1616: no `webServer`, so nothing said which tree served these pages. This lane
  // drives the stack the QA session started by hand (see the header above), so a foreign
  // tree on the port is the documented state -- the guard must name it, not refuse.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  metadata: { laneTree: 'attach-to-operator-stack' },
  testDir: './e2e',
  testMatch: ['**/obrs960-driver-cash-qa.spec.ts'],
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'off',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
