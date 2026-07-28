import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-561 — mobile dropdown overflow regression.
 *
 * Two targets, on purpose, because "fails before / passes after" is the point:
 *
 *   OBRS561_BASE_URL=https://sit-obrs-frontend.netlify.app \
 *     npx playwright test --config=playwright.obrs561.config.ts     # unfixed -> RED
 *
 *   npx playwright test --config=playwright.obrs561.config.ts       # this worktree -> GREEN
 *
 * With no OBRS561_BASE_URL it serves the working tree with the `sit` configuration,
 * so the frontend under test is local while the station data is real SIT data (SIT
 * CORS reflects any localhost origin). The port is deliberately not 4200 and not a
 * fixed 4201 — parallel sessions pick their own via OBRS561_PORT.
 */

const EXTERNAL = process.env['OBRS561_BASE_URL'];
const PORT = process.env['OBRS561_PORT'] ?? '4318';
const BASE_URL = EXTERNAL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/obrs-561-mobile-dropdown-overflow.spec.ts',
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // iPhone 13 for the viewport/UA/touch profile, but forced onto chromium: the
  // descriptor's own `defaultBrowserType` is webkit, which is not installed on the
  // dev machines or in CI here, and an uninstalled-browser error is indistinguishable
  // from a real failure in the report. The defect is a CSS layout bug, so the engine
  // is not what is under test — the 390px viewport is.
  projects: [
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],

  ...(EXTERNAL
    ? {}
    : {
        webServer: {
          // Via npm so `prestart:sit` runs the local-env shape gate first (OBRS-536).
          command: `npm run start:sit -- --port ${PORT} --no-live-reload`,
          url: BASE_URL,
          timeout: 300_000,
          reuseExistingServer: !process.env['CI'],
          stdout: 'pipe' as const,
          stderr: 'pipe' as const,
        },
      }),
});
