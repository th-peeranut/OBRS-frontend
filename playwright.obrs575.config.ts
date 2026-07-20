import { defineConfig, devices } from '@playwright/test';

// OBRS-575 recent-route quick pick.
// Points at a manually started `ng serve --configuration sit --port 4575`
// (and :4576 serving origin/dev for the BEFORE capture). Deliberately no
// `webServer` block, so a run cannot race or kill a server it does not own.
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/obrs-575-{qa,capture}.spec.ts',
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4575',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
