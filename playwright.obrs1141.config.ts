import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-1141 — BEFORE/AFTER evidence for the announced-delay disclosure.
 *
 * Hermetic in the same sense as the gate lane (it fulfils every `/api/**` call
 * from `e2e/support/customer-pages.ts` and aborts Maps), but it lives in the
 * CAPTURE lane because its purpose is the pictures in the card. It does assert:
 * the on-time row must carry no disclosure, the delayed rows must, and the
 * badge's MEASURED contrast must clear AA in both themes — so it can go red for
 * a real reason rather than only producing files.
 *
 * The default (local) build configuration on purpose: `window.ng` only exists on
 * a development build, and the store seeding this spec does — like every other
 * customer-page spec in this repo — goes through it.
 *
 * Private port (:4271) so it can run beside an unrelated `npm start` on :4200,
 * and beside the gate lane on :4230.
 *
 *   npx playwright test --config=playwright.obrs1141.config.ts
 */
export default defineConfig({
  // OBRS-1611: name the tree this run measures, and refuse a port another tree holds.
  globalSetup: './e2e/support/lane-tree-guard.ts',
  testDir: './e2e/tests',
  testMatch: ['obrs-1141-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:4271',
    // Tall on purpose: Playwright does NOT stitch an element screenshot taller
    // than the viewport — it returns the full box with the off-screen part left
    // unpainted white. The round-trip panel is five rows plus two headings.
    viewport: { width: 1280, height: 1400 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx ng serve --port 4271 --no-live-reload',
    url: 'http://localhost:4271',
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
