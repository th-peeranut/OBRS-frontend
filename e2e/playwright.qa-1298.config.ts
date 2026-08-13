import { defineConfig, devices } from '@playwright/test';

/**
 * QA-only config for OBRS-1298, scoped to obrs-1298-stops-modal.spec.ts. Deliberately NOT wired
 * into playwright.config.ts / lanes.json / playwright.gate.config.ts — this is a manual
 * verification run against a dev server started by hand. Not for the shared harness; not
 * committed.
 *
 * LANE (coordinator redirect, live SIT login outage OBRS-1307): this now targets the LOCAL
 * backend (`npm run start:local` from the frontend repo, apiUrl http://localhost:8080), not SIT.
 * The local `dev` Spring profile's CORS allow-list is pinned to exactly `http://localhost:4200`,
 * so the randomized-alt-port convention does NOT apply here — port MUST be 4200, and only one of
 * {AFTER worktree, BEFORE clone} can serve it at a time.
 *
 * Usage (from the frontend repo root, after `npm run start:local` is up on :4200):
 *   npx playwright test e2e/tests/obrs-1298-stops-modal.spec.ts \
 *     --config=e2e/playwright.qa-1298.config.ts
 */
const PORT = process.env['QA_1298_PORT'] ?? '4200';

export default defineConfig({
  testDir: '.',
  testMatch: ['tests/obrs-1298-stops-modal.spec.ts'],
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    video: 'on',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
