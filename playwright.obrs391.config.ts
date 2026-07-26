import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-391 evidence capture. Two `ng serve` instances started BY HAND:
 *
 *   :4391  the main OBRS-frontend clone at origin/dev 45c66cbd (BEFORE — our own
 *          card-number / expiry / CVV fields on our own origin)
 *   :4392  this branch                                        (AFTER  — Omise's
 *          hosted iframe)
 *
 *   npx ng serve --port 4391   # in C:\Users\thpee\Desktop\workshop\OBRS-frontend
 *   npx ng serve --port 4392   # here
 *   npx playwright test --config=playwright.obrs391.config.ts
 *
 * Both served with the DEFAULT (local) configuration, so `apiUrl` points at :8080
 * where nothing listens — the spec stubs every `/api/**` call and anything it
 * missed fails as a network error rather than quietly reaching SIT. Same rule as
 * playwright.gate.config.ts and playwright.obrs702.config.ts, and the reason no
 * backend is required.
 *
 * cdn.omise.co is deliberately NOT stubbed. The AFTER dialog shots exist to show
 * a REAL third-party iframe rendering real fields; a stubbed one would prove
 * exactly nothing about where the card number goes. `environment.base.ts` carries
 * a test-mode publishable key, so no live key is involved and no charge can occur.
 *
 * No `webServer`: one config cannot start two trees. No `globalSetup`: the
 * payment page needs only `active_booking_id` in localStorage plus stubs, which
 * the spec seeds itself.
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['obrs-391-capture.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // The viewport goes AFTER the device spread, not in the top-level `use`.
      // `devices['Desktop Chrome']` carries its own 1280x720 viewport and the
      // project's `use` is merged last, so a top-level setting is silently
      // overridden — the first run of this config asked for 1536x864 and produced
      // 1280x720 images. 1536x864 is the real 1920x1080-at-125% viewport this
      // project measures desktop fit against; the mobile tests set 390x664
      // themselves (iPhone 12 class), the width OBRS-634 measured the /payment
      // overflow at.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1536, height: 864 } },
    },
  ],
});
