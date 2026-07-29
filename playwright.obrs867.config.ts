import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-867 AC-1 — "no tag may fire before consent, proven by watching the real
 * network, not by reading the code".
 *
 * This lane exists because the unit tests cannot satisfy that sentence. They
 * prove `AnalyticsTagsService.load()` is never called; they cannot prove the
 * browser made no request, and the AC deliberately asks for the second thing.
 *
 * It serves `--configuration analytics-e2e`, the one build in this repo with a
 * non-blank measurement ID (two invalid ones — see
 * src/environments/environment.analytics-e2e.ts for why invalid is the point).
 * Serving the normal build would make every assertion here pass for the wrong
 * reason: with blank IDs no tag is ever requested, consent or not.
 *
 * That is why the suite asserts in BOTH directions. The "after accepting"
 * expectation is not a bonus — it is what stops the "before accepting"
 * expectation from being vacuous, and it fails loudly if this lane is ever
 * pointed at a build with no IDs configured.
 *
 * Private port (:4267), like every other lane here, so it can run beside an
 * unrelated `npm start` on :4200 (OBRS-184's reasoning).
 *
 *   npx playwright test --config=playwright.obrs867.config.ts
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: [
    'obrs-867-analytics-consent-gate.spec.ts',
    // AFTER evidence + the measured contrast/geometry checks, taken from the
    // very build whose network behaviour the gate suite just asserted.
    'obrs-867-capture.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:4267',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx ng serve --configuration analytics-e2e --port 4267',
    url: 'http://localhost:4267',
    reuseExistingServer: true,
    timeout: 240_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
