import { expect, Page, test } from '@playwright/test';
import { seedCustomerSession, seedStore, flushAngular } from '../support/customer-pages';
import { seedGateAdminSession } from '../support/gate-admin-session';

/**
 * OBRS-1434 AC-4.8 / AC-2 evidence — the BKS clause 78/79 legal notice on the two
 * `SALES_POLICY` settings pages, and the conditions line the e-ticket gained for
 * clause 83.
 *
 * <p>ONE tree, TWO runs. The BEFORE run happens on the pristine checkout BEFORE the
 * card's code exists, with `OBRS1434_PHASE=before` and its own output folder; the
 * AFTER run happens on the finished branch. That ordering is why this file carries no
 * second server the way playwright.obrs1432.config.ts does: reverting a tree to take a
 * BEFORE is the mistake that recipe exists to avoid, and "not written yet" is not a
 * revert.
 *
 * <p>Every frame asserts the thing it is evidence OF before it is taken — the notice
 * is absent in the BEFORE phase and present in the AFTER one — so a run that served
 * the wrong tree fails here instead of reaching the card as a picture of nothing.
 *
 * <p>Hermetic on the gate lane's terms: the admin arms reuse
 * `e2e/support/gate-admin-session.ts` and the e-ticket arm reuses
 * `e2e/support/customer-pages.ts`, so every `/api/**` call is fulfilled in-browser.
 */

const ASSETS = process.env['OBRS1434_OUT'] ?? 'e2e-evidence/obrs-1434';

/** `before` = the tree without this card's code; `after` = with it. */
const PHASE = process.env['OBRS1434_PHASE'] ?? 'after';
const EXPECTED_NOTICES = PHASE === 'before' ? 0 : 1;

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

/**
 * The platform defaults, which are the numbers the card's table is written against —
 * `SystemConfigConstant.java` 0.80 / 0.50 / 30 / 24. Every flag false, so the page
 * renders the "all platform default" state an owner meets before they touch anything.
 */
const CANCEL_POLICY = {
  cancelWindowHours: 2,
  cancelWindowHoursOverridden: false,
  rescheduleWindowHours: 2,
  rescheduleWindowHoursOverridden: false,
  rescheduleMaxDaysAhead: 60,
  rescheduleMaxDaysAheadOverridden: false,
  rescheduleMaxCount: 0,
  rescheduleMaxCountOverridden: false,
  earlyWindowHours: 24,
  earlyWindowHoursOverridden: false,
  cancelRefundRateEarly: 0.8,
  cancelRefundRateEarlyOverridden: false,
  cancelRefundRateLate: 0.5,
  cancelRefundRateLateOverridden: false,
  rescheduleFeeLateThb: 30,
  rescheduleFeeLateThbOverridden: false,
};

const TICKETS = {
  code: 200,
  message: 'OK',
  data: {
    bookingId: 501,
    bookingNumber: 'B-000501',
    bookingStatus: 'confirmed',
    totalTickets: 1,
    journeys: [
      {
        legType: { code: 'outbound', label: 'ขาไป' },
        fromStop: { code: 'nong_chak', label: 'หนองชาก' },
        toStop: { code: 'bkr_mochit2', label: 'หมอชิต 2' },
        departureDateTime: '2030-06-17 09:30:00',
        arrivalDateTime: '2030-06-17 12:10:00',
        vehicle: { vehicleType: { code: 'van', label: 'รถตู้' } },
        tickets: [
          {
            id: 9001,
            ticketNumber: 'T-300617-0501-1',
            passengerName: 'นาย สมชาย ใจดี',
            seatNumber: null,
            status: { code: 'confirmed', label: 'ยืนยันแล้ว' },
          },
        ],
      },
    ],
  },
};

const notice = (page: Page) => page.locator('[data-testid="legal-policy-notice"]');

async function openAdminSettings(page: Page, path: string): Promise<void> {
  await seedGateAdminSession(page, {
    username: 'owner@system.local',
    roles: ['owner'],
    language: 'th',
  });
  // The OWNER surface, not the admin one: `BookingPolicyConfigStore` picks the
  // endpoint from `getRoles()` (OBRS-1454), and this session really holds `owner`.
  await page.route('**/private/owner/configs/booking-policy', (route) =>
    route.fulfill(
      ok({
        maxAdvanceDays: 60,
        maxAdvanceDaysOverridden: false,
        cutoffMinutes: 20,
        cutoffMinutesOverridden: false,
      })
    )
  );
  await page.route('**/private/owner/configs/cancel-reschedule-policy', (route) =>
    route.fulfill(ok(CANCEL_POLICY))
  );
  await page.goto(`/admin/settings/${path}`);
  // The form, not the shell: a shot taken while the page is still a skeleton would
  // show the notice over grey bars and prove nothing about where it sits.
  await expect(page.locator('form')).toBeVisible({ timeout: 20_000 });
}

test.describe('OBRS-1434 — the clause 78/79 notice on the SALES_POLICY group', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test(`booking-policy (${PHASE})`, async ({ page }) => {
    await openAdminSettings(page, 'booking-policy');
    await expect(notice(page)).toHaveCount(EXPECTED_NOTICES);
    if (EXPECTED_NOTICES) {
      // AC-4.4: the compact box is the one that has to take the owner to the values.
      await expect(
        notice(page).locator('a[href="/admin/settings/cancel-reschedule-policy"]')
      ).toHaveCount(1);
    }
    await page.screenshot({
      path: `${ASSETS}/OBRS-1434-${PHASE}-booking-policy.png`,
      fullPage: true,
    });
  });

  test(`cancel-reschedule-policy (${PHASE})`, async ({ page }) => {
    await openAdminSettings(page, 'cancel-reschedule-policy');
    await expect(notice(page)).toHaveCount(EXPECTED_NOTICES);
    if (EXPECTED_NOTICES) {
      // AC-4.1: above every field, so it is read before a finger reaches one. The
      // numbers are the live config's, so this also proves the box is not a picture
      // of the defaults painted next to values that had drifted from them.
      const text = (await notice(page).innerText()).replace(/\s+/g, ' ');
      expect(text).toContain('20');
      expect(text).toContain('50');
      expect(text).toContain('24');
      expect(text).toContain('30');
      const noticeBottom = await notice(page).evaluate((el) => el.getBoundingClientRect().bottom);
      const firstFieldTop = await page
        .locator('#cancelWindowHours')
        .evaluate((el) => el.getBoundingClientRect().top);
      expect(noticeBottom, 'the notice must sit ABOVE the first field').toBeLessThan(
        firstFieldTop
      );
      // AC-4.5: no dismiss control, ever.
      await expect(notice(page).locator('button')).toHaveCount(0);
    }
    await page.screenshot({
      path: `${ASSETS}/OBRS-1434-${PHASE}-cancel-reschedule-policy.png`,
      fullPage: true,
    });
  });
});

test.describe('OBRS-1434 AC-2 — clause 83 on the e-ticket', () => {
  test.use({ viewport: { width: 1280, height: 1400 } });

  test(`e-ticket conditions (${PHASE})`, async ({ page }) => {
    await seedCustomerSession(page, false);
    await page.addInitScript(() => localStorage.setItem('app_language', 'th'));
    // Registered after seedCustomerSession's catch-all, so it wins: the shared
    // fixture answers this path with a null body, which renders a ticket with every
    // field blank.
    await page.route('**/api/private/bookings/501/tickets', (route) =>
      route.fulfill({ json: TICKETS })
    );

    await page.goto('/e-ticket');
    await seedStore(page);
    await flushAngular(page);
    await expect(page.locator('app-e-ticket-card')).toBeVisible({ timeout: 20_000 });

    const conditions = page.locator('[data-testid="eticket-conditions"]');
    await expect(conditions).toHaveCount(EXPECTED_NOTICES);
    if (EXPECTED_NOTICES) {
      await expect(conditions.locator('a[href="/refund-policy"]')).toHaveCount(1);
    }
    await page.screenshot({ path: `${ASSETS}/OBRS-1434-${PHASE}-e-ticket.png`, fullPage: true });
  });
});
