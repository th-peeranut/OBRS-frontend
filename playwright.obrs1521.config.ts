import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1521. The CAPTURE-lane config for `obrs-1521-disabled-census.spec.ts`.
 *
 * Same hermetic terms as the gate lane (`playwright.gate.config.ts`): the `gate`
 * serve configuration, a dead `apiUrl`, locally served fonts and a Chromium that
 * resolves nothing but localhost -- because the probe reuses the contrast gate's
 * fixtures (`seedCustomerSession`), which fulfil every /api/** call in-browser.
 *
 * Its OWN port, not the gate's. Both may be running on this box at once, and a
 * second `ng serve` on 4230 would silently attach to the first one's build.
 *
 * ASCII-only source.
 */

// OBRS-1531: the default was 4232, which `playwright.obrs775.config.ts` also defaults
// to. Separate env vars do not help when both lanes are run the documented way, with
// neither var set — the second one just attaches to the first one's server.
const PORT = process.env['E2E_OBRS1521_PORT'] ?? '4245';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['**/obrs-1521-disabled-census.spec.ts'],
  timeout: 300_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 1400 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `npx ng serve --configuration gate --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: !process.env['CI'],
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
