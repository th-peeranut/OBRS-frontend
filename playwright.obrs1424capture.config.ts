import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1424 - the CAPTURE lane for this card's Jira evidence AND its measurements.
 *
 *   OBRS1424_PHASE=BEFORE npx playwright test --config=playwright.obrs1424capture.config.ts
 *   OBRS1424_PHASE=AFTER  npx playwright test --config=playwright.obrs1424capture.config.ts
 *
 * Same shape as playwright.obrs1402capture.config.ts. It is NOT part of the committed
 * regression suite: the regression this card is worth pinning to is already in the GATE
 * lane, because /track-parcel joined `CUSTOMER_PAGES` under OBRS-970 and the contrast
 * gate now sweeps it every run. What this lane adds is the two things the gate cannot
 * give: pictures, and the found-state numbers the gate never reaches (it sweeps the page
 * AT REST, by that entry's own declaration).
 *
 * The frontend is served with the DEFAULT configuration, so `apiUrl` points at
 * http://localhost:8080 where nothing is listening: every request is either fulfilled by
 * the spec's fixtures or fails as a network error, and nothing reaches SIT.
 */

const PORT = process.env['OBRS1424_PORT'] ?? '4243';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-1424-capture.spec.ts'],
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
