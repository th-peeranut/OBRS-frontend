import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1499 AC-6 — AFTER evidence for the bank-first gate on the
 * account-number field.
 *
 *   npx playwright test --config=playwright.obrs1499capture.config.ts
 *
 * Hermetic on the gate lane's terms (playwright.gate.config.ts, rule 1): the
 * spec fulfils every `/api/**` call itself and seeds its own session, so there
 * is no backend, no database and no SIT dependency. Its own port, because the
 * OBRS-1465 capture config owns 4265 and both may be running.
 */
const PORT = process.env['OBRS1499_PORT'] ?? '4266';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-1499-capture.spec.ts'],
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
