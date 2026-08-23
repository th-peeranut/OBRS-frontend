import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-641. The CAPTURE-lane config for `obrs-641-input-hints-capture.spec.ts`.
 *
 * Same hermetic terms as the gate lane (`playwright.gate.config.ts`): the `gate`
 * serve configuration, a dead `apiUrl`, and a Chromium that resolves nothing but
 * localhost -- the probe reuses the contrast gate's fixtures
 * (`seedCustomerSession`), which fulfil every /api/** call in-browser.
 *
 * Its OWN port, not the gate's and not OBRS-1521's. All three may be running on
 * this box at once, and a second `ng serve` on a shared port would silently
 * attach to the first one's build.
 *
 * The viewport is a phone, because the bug this evidences only exists on one:
 * 390x844 is the iPhone 12/13/14 portrait CSS viewport.
 *
 * ASCII-only source.
 */

const PORT = process.env['E2E_OBRS641_PORT'] ?? '4233';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['**/obrs-641-input-hints-capture.spec.ts'],
  timeout: 300_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
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
