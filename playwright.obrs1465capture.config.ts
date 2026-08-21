import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1465 AC-5 — AFTER evidence for the account-number grouping.
 *
 *   npx playwright test --config=playwright.obrs1465capture.config.ts
 *
 * Hermetic on the gate lane's terms (playwright.gate.config.ts, rule 1): the
 * spec fulfils every `/api/**` call itself and seeds its own session, so there
 * is no backend, no database and no SIT dependency. That matters more than
 * usual here: the machine this runs on was already at 794 MB free, and the
 * live-stack harness this card would otherwise have copied (OBRS-1463's) wants
 * a Spring Boot backend and a seeded Postgres alongside the dev server.
 */
const PORT = process.env['OBRS1465_PORT'] ?? '4265';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-1465-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx ng serve --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
});
