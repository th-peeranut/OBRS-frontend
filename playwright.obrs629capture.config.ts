import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-629 — the CAPTURE lane for this card's Jira evidence.
 *
 *   npx playwright test --config=playwright.obrs629capture.config.ts
 *
 * Same shape as playwright.obrs1372capture.config.ts: this spec takes pictures and asserts only
 * that what it is about to shoot is on screen. It is NOT part of the committed regression suite —
 * the regressions this card is worth pinning are in
 * src/app/modules/parcel-policy/parcel-policy.component.spec.ts and in gate 6 of
 * scripts/check-i18n-parity.mjs, both of which run in CI.
 *
 * There is deliberately no BEFORE pass for /parcel-policy: the page did not exist, and a
 * screenshot of a 404 is not a comparison. The BEFORE state for that half is the card's own
 * finding — four footer links, none of them about parcels.
 *
 * The frontend is served with the DEFAULT configuration, so `apiUrl` points at
 * http://localhost:8080 where nothing is listening: every request is either fulfilled by the
 * spec's fixtures or fails as a network error, and nothing reaches SIT.
 */

const PORT = process.env['OBRS629_PORT'] ?? '4239';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-629-capture.spec.ts'],
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
