import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1308 QA lane — runs against the backend + frontend already started BY HAND for
 * this QA pass (backend :8080 with dev,local profiles + a thaibulksms.base-url capture
 * override; frontend :4200 via `npm run start:local`). No webServer block: this is a
 * "use what's already running" config, not a "boot the stack" one — starting a second
 * frontend/backend on the same ports would just fail to bind or reuse the existing one
 * silently, and re-seeding here would undo the QA-run's own submitted overrides.
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['**/obrs-1308-notification-message-override-qa.spec.ts', '**/obrs-1308-capture.spec.ts'],
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
