import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-732 — the real 3-D Secure lane.
 *
 *   npx playwright test --config=playwright.obrs732.config.ts
 *
 * Everything below is a deliberate copy of playwright.local.config.ts's shape (OBRS-184's
 * local full-stack lane) with two things changed: the fixture, and the spec. Read that
 * file's header for why the lane owns its own database and ports at all.
 *
 * WHY THIS LANE EXISTS
 * 3-D Secure is the only path in the product that LEAVES our origin — the browser goes to
 * the issuing bank's page and comes back through `return_uri` — so it is the one payment
 * behaviour no unit test and no mocked E2E can observe. After OBRS-391 it also became the
 * one path that crosses two boundaries: the card token now comes out of a cross-origin
 * iframe, and only then does the charge and the redirect happen.
 *
 * IT IS NOT HERMETIC, ON PURPOSE
 * It really talks to api.omise.co and really renders Omise's hosted pages. A mocked 3DS
 * page would prove nothing about the thing being tested. Test mode throughout — the
 * publishable key in `environment.base.ts` is a `pkey_test_` and the backend's secret comes
 * from the gitignored `application-local.yml` — so no money can move. ⛔ Never add this to
 * `e2e:gate`: a lane that depends on a third party's uptime does not belong on a merge gate.
 * (OBRS-735: the Actions minute-budget reason this used to give alongside that was false —
 * this repo is PUBLIC and therefore unmetered, and its CI runs no SIT deploy. Third-party
 * uptime is the whole reason, and it is reason enough.)
 *
 * WHAT MAKES THE PIECES LINE UP (measured, not assumed)
 *  - `environment.e2e.ts` inherits `environmentBase`, so `useMockPayments` is FALSE and a
 *    real `pkey_test_` is present. If it were true, `resolveCardToken()` would short-circuit
 *    to 'mock_card_token' and this lane would test nothing at all.
 *  - The backend boots with profiles `dev,local`; `application-local.yml` supplies the Omise
 *    test secret key.
 *  - `APP_FRONTEND_URL=http://localhost:4210` makes the backend compose
 *    `return-uri = http://localhost:4210/payment/result`. That has to match the port actually
 *    being served or the post-3DS redirect dies on ERR_CONNECTION_REFUSED — a failure
 *    recorded in AGENT_MEMORY.md after it cost a session. Change one port here and you must
 *    change both.
 *  - E2E_FIXTURE_SQL points the boot script at a PAYABLE booking. The default fixture has
 *    none; see obrs-732-3ds-fixture.sql's header for the five conditions the product
 *    requires of that row.
 *
 * ⚠️ 3-D Secure must be ENABLED on the Omise TEST account, and that is not something this
 * repo can arrange. Per docs.omise.co/api-testing it takes two things, neither of them a
 * card number: the account being 3DS-enabled (a request to support@omise.co — the dashboard
 * exposes no such toggle), and the charge carrying `return_uri`, which ours does. With both,
 * any successful test card takes the 3DS route. Without the first, the charge goes straight
 * to `successful`, the browser never leaves :4210, and the journey silently skips the only
 * thing this lane exists for. The spec asserts the redirect happened and fails loudly naming
 * that setting — do not "fix" such a failure by relaxing the assertion.
 */

const FRONTEND_PORT = process.env['E2E_FRONTEND_PORT'] ?? '4210';
const BACKEND_PORT = process.env['E2E_BACKEND_PORT'] ?? '8181';
const BASE_URL = `http://localhost:${FRONTEND_PORT}`;
const API_URL = `http://localhost:${BACKEND_PORT}`;

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/obrs-732-3ds.spec.ts',
  // Generous: one test drives our page, Omise's iframe, Omise's 3DS page and the return
  // trip, across two real network round trips to a third party.
  timeout: 180_000,

  fullyParallel: false,
  workers: 1,

  // A retry would replay a charge against a booking the first attempt already moved out of
  // `pending` — the second run would fail with BOOKING_STATUS_INVALID or PAYMENT_IN_PROGRESS
  // and bury the real failure under a confusing one. Same reasoning as the OBRS-184 lane.
  retries: 0,

  reporter: [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'pwsh -NoProfile -ExecutionPolicy Bypass -File e2e/scripts/start-e2e-backend.ps1',
      url: `${API_URL}/api/routes`,
      timeout: 900_000,
      // Reuse is opt-in and dangerous HERE specifically: an abandoned 3DS attempt leaves a
      // `pending` payment row, and PaymentService rejects the next charge on that booking
      // with PAYMENT_IN_PROGRESS. A rebuilt database is what clears it.
      reuseExistingServer: process.env['E2E_REUSE_SERVERS'] === '1',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { E2E_FIXTURE_SQL: 'obrs-732-3ds-fixture.sql' },
    },
    {
      command: `npx ng serve --configuration e2e --port ${FRONTEND_PORT} --no-live-reload`,
      url: BASE_URL,
      timeout: 300_000,
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
