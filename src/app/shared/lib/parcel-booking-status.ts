import { ParcelStatusToken } from './parcel-delivery-status';

/** `EBookingStatus` slugs as they arrive on `ParcelDeliveryListItemDto.bookingStatus`. */
export type ParcelBookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'refunded';

export interface ParcelPaymentFlag {
  token: ParcelStatusToken;
  i18nKey: string;
}

/**
 * OBRS-396: the money half of a delivery row. `deliveryStatus` says where the
 * box is; this says whether anyone paid for it. Reuses the existing
 * `.admin-status.is-*` tokens (design-system.md §2.4) — no new chip look.
 *
 * `confirmed` is deliberately absent: a paid row is the everyday case and gets
 * no badge, so the badge only ever means "something is wrong with this one".
 */
const PARCEL_PAYMENT_FLAG_MAP: Record<Exclude<ParcelBookingStatus, 'confirmed'>, ParcelPaymentFlag> = {
  pending: { token: 'is-warning', i18nKey: 'STAFF.PARCEL_DELIVERY.PAYMENT.PENDING' },
  expired: { token: 'is-danger', i18nKey: 'STAFF.PARCEL_DELIVERY.PAYMENT.EXPIRED' },
  cancelled: { token: 'is-danger', i18nKey: 'STAFF.PARCEL_DELIVERY.PAYMENT.CANCELLED' },
  refunded: { token: 'is-neutral', i18nKey: 'STAFF.PARCEL_DELIVERY.PAYMENT.REFUNDED' },
};

const UNRECOGNIZED_FLAG: ParcelPaymentFlag = {
  token: 'is-danger',
  i18nKey: 'STAFF.PARCEL_DELIVERY.PAYMENT.UNKNOWN',
};

/**
 * Absent (`null`/`undefined`/`''`) is NOT the same as unrecognized, and the
 * difference decides whether the page still works against a backend that
 * predates OBRS-359.
 *
 * - **Absent** -> the server never mentioned payment, so we say nothing and
 *   block nothing. An older backend (SIT is only refreshed on the next batch
 *   `dev`->`sit` promote) omits the field entirely; failing closed here would
 *   disable every button on the page and brick parcel handoff.
 * - **Present but unrecognized** -> the server knows a slug this FE doesn't.
 *   It isn't `confirmed`, so `ParcelDeliveryService.assertBookingConfirmed`
 *   will 409 it — mirror that and flag it rather than offer a button that
 *   cannot work.
 *
 * Failing open on absence is safe because the FE disable is only an
 * affordance: the real gate is the backend guard, and the 409 is mapped to a
 * toast for the race where a row expires while the page sits open.
 */
function normalize(bookingStatus: string | null | undefined): string {
  return String(bookingStatus ?? '').trim().toLowerCase();
}

/** The badge to render next to the delivery chip, or `null` when there is
 * nothing to say (paid, or payment not reported at all). */
export function parcelPaymentFlag(bookingStatus: string | null | undefined): ParcelPaymentFlag | null {
  const key = normalize(bookingStatus);
  if (key === '' || key === 'confirmed') {
    return null;
  }
  return PARCEL_PAYMENT_FLAG_MAP[key as Exclude<ParcelBookingStatus, 'confirmed'>] ?? UNRECOGNIZED_FLAG;
}

/** True when the backend will reject every delivery transition on this row
 * (409 `PARCEL_BOOKING_NOT_CONFIRMED`), so the buttons must not be offered. */
export function isParcelBookingBlocking(bookingStatus: string | null | undefined): boolean {
  return parcelPaymentFlag(bookingStatus) !== null;
}
