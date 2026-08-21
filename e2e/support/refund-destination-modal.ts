import { expect, Page } from '@playwright/test';
import { seedAnalyticsConsent } from './analytics-consent';

/**
 * The hermetic fixtures and the two-click path into the customer cancel modal,
 * shared by every card that needs AFTER evidence of the refund-destination
 * fields.
 *
 * OBRS-1465 wrote all of this inline; OBRS-1499 changed the modal (the
 * account-number field now waits for a bank), which meant editing that spec
 * anyway, so the parts both runs need moved here rather than being copied a
 * second time. Nothing was redesigned on the way — the fixtures, the routes and
 * the waits are the ones OBRS-1465 measured, including the 1200 ms settle whose
 * reason is written on `openCancelModal`.
 *
 * There is no backend behind any of it: every `/api/**` call is fulfilled here
 * and `apiUrl` points at a localhost port where nothing listens.
 */

export const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });

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

export interface Harness {
  /** The `refundDestination` of every cancel this run posted. */
  posted: Record<string, string>[];
}

export async function seed(page: Page, token: string): Promise<Harness> {
  const harness: Harness = { posted: [] };

  await seedAnalyticsConsent(page);
  await page.addInitScript((sessionToken) => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', sessionToken);
    localStorage.setItem('auth_username', 'customer@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['user']));
  }, token);

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

export async function openCancelModal(page: Page): Promise<void> {
  const card = page.locator('.booking-card', { hasText: 'B-000601' });
  await expect(card).toBeVisible();
  await card.locator('.actions-menu-btn').click();
  await page.locator('.action-menu-item__label', { hasText: 'ยกเลิกการจอง' }).click();
  await expect(page.locator('.crdm-modal')).toBeVisible();
  await page.locator('.rdf-toggle-btn', { hasText: 'โอนเข้าบัญชีธนาคาร' }).click();
  await expect(page.locator('#rdf-account-number')).toBeVisible();
  // AdminModalBackdropDirective moves focus to the dialog's first focusable
  // element shortly after it opens (admin-modal-backdrop.directive.ts:86-89).
  // That is pre-existing and has nothing to do with these cards, but it lands
  // mid-burst and swallows keystrokes, so let it happen before typing starts.
  await page.waitForTimeout(1200);
}

/** Puts the caret back at the end of the account field, the way clicking into
 * it does. Picking a bank moves focus to the combobox, and Playwright would
 * otherwise resume typing at offset 0 — an artefact of the harness, not of the
 * field: a person clicks where they want the caret. */
export async function resumeTyping(page: Page): Promise<void> {
  await page.locator('#rdf-account-number').click();
  await page.locator('#rdf-account-number').press('End');
}

export async function pickBank(page: Page, name: string): Promise<void> {
  await page.locator('#rdf-bank').click();
  await page.locator('.rdf-bank-option', { hasText: name }).click();
  await expect(page.locator('#rdf-bank')).toHaveValue(name);
}
