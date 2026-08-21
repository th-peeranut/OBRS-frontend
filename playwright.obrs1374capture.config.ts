import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1374 — the CAPTURE lane for this card's AC-11 Jira evidence.
 *
 *   npx playwright test --config=playwright.obrs1374capture.config.ts
 *
 * Same shape as playwright.obrs1477capture.config.ts, and NOT part of the committed
 * regression suite — the regression worth pinning lives in the unit suites
 * (expense-form-modal.component.spec.ts + expenses-page.mappers.spec.ts, OBRS-1374
 * blocks, and ExpenseServiceTest.LineItemTests on the backend). What this lane adds is
 * the pictures: a four-line bill in the form, and that same bill as ONE row in the list.
 *
 * Served with the DEFAULT configuration, so `apiUrl` is http://localhost:8080 where
 * nothing is listening: every call is either stubbed here or fails as a network error.
 * Nothing reaches SIT.
 */

const PORT = process.env['OBRS1374_PORT'] ?? '4374';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-1374-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 180_000,
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
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Tall on purpose, and it has to be HERE: a project's `use` overrides the
        // top-level one, so `devices['Desktop Chrome']`'s 1280x720 wins over anything set
        // above. The expense modal scrolls INSIDE itself, so at 720px the repeater is cut
        // off and `fullPage` cannot reach it — what `fullPage` grows is the page behind
        // the modal, not the modal.
        viewport: { width: 1440, height: 1800 },
      },
    },
  ],
});
