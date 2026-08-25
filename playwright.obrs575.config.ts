import { defineConfig, devices } from '@playwright/test';

// OBRS-575 recent-route quick pick.
// Points at a manually started `ng serve --configuration sit --port 4575`
// (and :4576 serving origin/dev for the BEFORE capture). Deliberately no
// `webServer` block, so a run cannot race or kill a server it does not own.
export default defineConfig({
  // OBRS-1616: no `webServer`, so nothing said which tree served the shots. NO attach
  // marker on purpose: :4575 is the server THIS tree starts by hand, so another tree
  // answering it is a mistake worth refusing. The BEFORE half on :4576 is out of the
  // guard's reach -- it is a full URL inside the spec, not this config's baseURL.
  globalSetup: './e2e/support/lane-tree-guard.ts',
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
