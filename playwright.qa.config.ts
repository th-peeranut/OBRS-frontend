/**
 * The SIT lane on an alternate port. Identical in intent to `playwright.config.ts` —
 * same specs, same live SIT backend, same "health check, not a merge gate" status —
 * but served on :4201 for when another session already holds the default port, and
 * with its own `global-setup-qa.ts`.
 *
 * OBRS-602: this config carried the *same* directory sweep the default one did
 * (`testDir: './e2e'`, no `testMatch`), so fixing only the default would have left an
 * identical trapdoor one flag away — run with `--config playwright.qa.config.ts` and
 * you were back to 223 cases and 36 failures, with a doc that said nothing about it.
 * Both now derive their spec list from `e2e/lanes.json`, and
 * `scripts/check-e2e-lanes.mjs` refuses any root config that sweeps a directory
 * without declaring what it runs.
 *
 * The header used to say ":4200 is taken by the main worktree". The default config
 * moved to :4202 at some point, so that is no longer the reason; the reason now is
 * simply that ports are contended when several sessions run at once.
 */
import { defineConfig, devices } from '@playwright/test';
import lanes from './e2e/lanes.json';

const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://localhost:4201';

const SIT_SPECS = lanes.specs
  .filter((s) => s.lane === 'SIT-LIVE' || s.lane === 'GATE-BLOCKED')
  .map((s) => `**/${s.spec}`);

export default defineConfig({
  globalSetup: './e2e/global-setup-qa.ts',
  testDir: './e2e/tests',
  testMatch: SIT_SPECS,
  timeout: 90_000,
  retries: 0,

  // 'list', not 'html': the html reporter's `open: 'on-failure'` default serves the
  // report and blocks until interrupted, which on a lane that is expected to be partly
  // red reads as a hung run. `npx playwright show-report` still works on demand.
  reporter: [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx ng serve --configuration sit --port 4201 --no-live-reload`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
