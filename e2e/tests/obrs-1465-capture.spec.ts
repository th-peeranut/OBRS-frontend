import { expect, Page, test } from '@playwright/test';
import { seedAnalyticsConsent } from '../support/analytics-consent';

/**
 * OBRS-1465 AC-5 — the account-number field showing its dashes, caught MID-TYPING.
 *
 * The owner ruled on 2026-08-21 for option 1, group per bank, so the evidence
 * has to show two banks side by side or it proves nothing that a bank-agnostic
 * rule would not also prove: กสิกรไทย (BOT 004) takes the 10-digit convention
 * 148-0-62262-1, ออมสิน (BOT 030) takes its own 12-digit 0-5459005667-4.
 *
 * The fixtures and the two-click path into the modal are lifted from
 * `obrs-813-cancel-offers-reschedule.spec.ts`, which is in the gate lane and
 * therefore already proven to reach this modal with no backend behind it. The
 * one addition is `/api/private/banks`, which did not exist when 813 was
 * written and which 813's catch-all would answer with `data: null`.
 *
 * Typing goes through `pressSequentially`, not `fill`: `fill` sets the value in
 * one shot and would never exercise the per-keystroke regrouping this card is
 * about.
 */

const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });

const DEPARTURE = '2030-06-17T08:00:00+07:00';

const lookup = (id: number, code: string, label: string) => ({
  id,
  code,
  display: { en: { label }, th: { label } },
});

const BOOKING = {
  id: 601,
  bookingNumber: 'B-000601',
  totalAmount: 500,
  status: 'confirmed',
  bookingType: 'one_way',
  bookingChannel: 'online',
  createdAt: '2026-07-20T10:00:00+07:00',
  rescheduleCount: 1,
  rescheduleMaxCount: 1,
  seatChangeCount: 0,
  stopChangeCount: 0,
  contact: { fullName: 'Somchai Jaidee', phoneNumber: '0812345678' },
  bookingSchedules: [
    {
      id: 901,
      departureDateTime: DEPARTURE,
      arrivalDateTime: '2030-06-17T10:30:00+07:00',
      legType: 'outbound',
      fromStop: lookup(1, 'nong_chak', 'หนองจาก'),
      toStop: lookup(4, 'bkr_mochit2', 'สถานีขนส่งหมอชิต 2'),
      routeSlug: 'chonburi_bangkok',
      seatingMode: 'ASSIGNED',
      tickets: [{ id: 701, ticketNumber: 'T-00701', seatNumber: 'A1', status: 'confirmed' }],
    },
  ],
};

/** The lane that asks for a destination at all. */
const CANCEL_POLICY = ok({
  originalAmount: 500,
  refundAmount: 400,
  penaltyAmount: 100,
  refundRatePercent: '80%',
  refundMethod: 'MANUAL_REFUND_REQUIRED',
  policyWindow: 'EARLY',
});

/** Two of the eighteen: the one that takes the convention, and the one that does not. */
const BANKS = ok([
  { code: '004', nameTh: 'ธนาคารกสิกรไทย', nameEn: 'Kasikornbank', nameZh: '开泰银行' },
  { code: '030', nameTh: 'ธนาคารออมสิน', nameEn: 'Government Savings Bank', nameZh: '政府储蓄银行' },
]);

interface Harness {
  /** The `refundDestination` of every cancel this run posted. */
  posted: Record<string, string>[];
}

async function seed(page: Page): Promise<Harness> {
  const harness: Harness = { posted: [] };

  await seedAnalyticsConsent(page);
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'obrs-1465-capture-token');
    localStorage.setItem('auth_username', 'customer@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['user']));
  });

  await page.route('**/api/**', async (route) => {
    const pathname = route.request().url().replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (/\/bookings\/\d+\/cancel$/.test(pathname) && route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { refundDestination?: Record<string, string> };
      harness.posted.push(body.refundDestination ?? {});
      return json(
        ok({ bookingId: 601, bookingNumber: 'B-000601', status: 'cancelled', refundAmount: 400, refundMethod: 'MANUAL_REFUND_REQUIRED' })
      );
    }
    if (/\/banks$/.test(pathname)) {
      return json(BANKS);
    }
    if (/\/bookings\/\d+\/cancel-policy$/.test(pathname)) {
      return json(CANCEL_POLICY);
    }
    if (/\/bookings\/me$/.test(pathname)) {
      return json(
        ok({ content: [BOOKING], totalElements: 1, totalPages: 1, size: 100, number: 0, numberOfElements: 1 })
      );
    }
    if (/\/stops$/.test(pathname)) {
      return json(ok([lookup(1, 'nong_chak', 'หนองจาก'), lookup(4, 'bkr_mochit2', 'สถานีขนส่งหมอชิต 2')]));
    }
    return json(ok(null));
  });

  return harness;
}

async function openCancelModal(page: Page): Promise<void> {
  const card = page.locator('.booking-card', { hasText: 'B-000601' });
  await expect(card).toBeVisible();
  await card.locator('.actions-menu-btn').click();
  await page.locator('.action-menu-item__label', { hasText: 'ยกเลิกการจอง' }).click();
  await expect(page.locator('.crdm-modal')).toBeVisible();
  await page.locator('.rdf-toggle-btn', { hasText: 'โอนเข้าบัญชีธนาคาร' }).click();
  await expect(page.locator('#rdf-account-number')).toBeVisible();
  // AdminModalBackdropDirective moves focus to the dialog's first focusable
  // element shortly after it opens (admin-modal-backdrop.directive.ts:86-89).
  // That is pre-existing and has nothing to do with this card, but it lands
  // mid-burst and swallows keystrokes, so let it happen before typing starts.
  await page.waitForTimeout(1200);
}

/** Puts the caret back at the end of the account field, the way clicking into
 * it does. Picking a bank moves focus to the combobox, and Playwright would
 * otherwise resume typing at offset 0 — an artefact of the harness, not of the
 * field: a person clicks where they want the caret. */
async function resumeTyping(page: Page): Promise<void> {
  await page.locator('#rdf-account-number').click();
  await page.locator('#rdf-account-number').press('End');
}

async function pickBank(page: Page, name: string): Promise<void> {
  await page.locator('#rdf-bank').click();
  await page.locator('.rdf-bank-option', { hasText: name }).click();
  await expect(page.locator('#rdf-bank')).toHaveValue(name);
}

/** The literal prefix is not a style choice: scripts/check-e2e-lanes.mjs reads
 * the path out of the source, so a variable here reads as an escape hatch. */
const shoot = async (page: Page, file: string) => {
  await page.locator('.crdm-modal').screenshot({ path: `e2e-evidence/OBRS-1465/${file}` });
};

test('OBRS-1465 AFTER: the dashes appear as the digits are typed, per bank', async ({ page }) => {
  const harness = await seed(page);
  await page.goto('/my-bookings');
  await openCancelModal(page);

  const field = page.locator('#rdf-account-number');
  await resumeTyping(page);

  // 1. Mid-typing before any bank is chosen: the field already counts for you.
  await field.pressSequentially('14806', { delay: 60 });
  await expect(field).toHaveValue('148-0-6');
  await shoot(page, 'OBRS-1465-AFTER-1-mid-typing-no-bank-yet.png');

  // 2. กสิกรไทย, the 10-digit convention, still mid-typing at 9 of 10 digits.
  await pickBank(page, 'ธนาคารกสิกรไทย');
  await resumeTyping(page);
  await field.pressSequentially('2262', { delay: 40 });
  await expect(field).toHaveValue('148-0-62262');
  await shoot(page, 'OBRS-1465-AFTER-2-kbank-mid-typing.png');

  // 3. The last digit lands and the number is complete.
  await resumeTyping(page);
  await field.pressSequentially('1', { delay: 40 });
  await expect(field).toHaveValue('148-0-62262-1');
  await shoot(page, 'OBRS-1465-AFTER-3-kbank-complete.png');

  // 4. ออมสิน groups differently, and switching bank regroups what is already
  //    typed — the whole reason option 1 was chosen over a flat every-N rule.
  await field.clear();
  await pickBank(page, 'ธนาคารออมสิน');
  await resumeTyping(page);
  await field.pressSequentially('054590056674', { delay: 30 });
  await expect(field).toHaveValue('0-5459005667-4');
  await shoot(page, 'OBRS-1465-AFTER-4-gsb-twelve-digits.png');

  // 5. AC-3: a number pasted with its dashes already in it is accepted, and the
  //    displayed dashes are OURS, not the ones that were pasted.
  await field.clear();
  await pickBank(page, 'ธนาคารกสิกรไทย');
  await field.fill('148-0-62262-1');
  await expect(field).toHaveValue('148-0-62262-1');
  await shoot(page, 'OBRS-1465-AFTER-5-pasted-with-dashes.png');

  // AC-2, and the half no screenshot can show: what leaves the browser is bare
  // digits. Asserted off the WIRE, not off the form, because the request body is
  // the thing that reaches manual_refund_requests.destination_account_number.
  await page.locator('#rdf-account-name').fill('สมชาย ใจดี');
  await page.locator('.crdm-actions .btn-primary').click();
  await expect.poll(() => harness.posted.length).toBe(1);
  expect(harness.posted[0]['accountNumber']).toBe('1480622621');
  expect(harness.posted[0]['bank']).toBe('004');
});
