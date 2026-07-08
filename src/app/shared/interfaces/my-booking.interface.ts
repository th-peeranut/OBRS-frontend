// Traveler-facing "my bookings" contract — backed by:
//   GET  /api/private/bookings/me            (BookingRespDto page)
//   GET  /api/private/bookings/{id}/cancel-policy  (CancellationPolicyRespDto)
//   POST /api/private/bookings/{id}/cancel         (CancelBookingRespDto)
// See ../../../../OBRS-backend/docs/api/booking.md.

export type SupportedLocale = 'en' | 'th' | 'zh';

export interface LookupTranslation {
  label?: string;
  description?: string;
}

/** A localized stop reference (`LookupResponse` on the backend). */
export interface BookingStopLookup {
  code?: string;
  display?: Record<string, LookupTranslation | null | undefined>;
}

/** A ticket as it appears nested under a `BookingScheduleRespDto` leg. */
export interface MyBookingScheduleTicketDto {
  id?: number;
  ticketNumber?: string;
  seatNumber?: string;
  status?: string;
}

export interface MyBookingScheduleDto {
  id?: number;
  departureDateTime?: string;
  arrivalDateTime?: string;
  legType?: string;
  fromStop?: BookingStopLookup;
  toStop?: BookingStopLookup;
  tickets?: MyBookingScheduleTicketDto[];
}

export interface MyBookingContactDto {
  fullName?: string;
  phoneNumber?: string;
}

/** Subset of `BookingRespDto` consumed by the my-bookings list. */
export interface MyBookingDto {
  id: number;
  bookingNumber?: string;
  totalAmount?: number | string;
  status?: string;
  bookingType?: string;
  bookingChannel?: string;
  createdAt?: string;
  /**
   * Number of times this booking has already been rescheduled (0 or 1 — a
   * booking can only be rescheduled once). Drives up-front eligibility gating
   * for the Reschedule action without waiting for a `RESCHEDULE_ERROR_MAX_COUNT`
   * response. See OBRS-backend/docs/api/booking.md `GET /bookings/me`.
   */
  rescheduleCount?: number;
  contact?: MyBookingContactDto;
  bookingSchedules?: MyBookingScheduleDto[];
}

/** `CancellationPolicyRespDto` — refund preview shown before cancelling. */
export interface CancellationPolicy {
  originalAmount: number | string;
  refundAmount: number | string;
  penaltyAmount: number | string;
  refundRatePercent: string;
  refundMethod: string;
  policyWindow: string;
  cancellationDeadline?: string;
  earliestDepartureDateTime?: string;
}

/** `CancelBookingRespDto` — result of a successful cancellation. */
export interface CancelBookingResult {
  bookingId: number;
  bookingNumber: string;
  status: string;
  refundAmount: number | string;
  refundMethod: string;
}

/** Flattened, presentation-ready row rendered by the my-bookings page. */
export interface MyBookingView {
  id: number;
  bookingNumber: string;
  statusCode: string;
  bookingType: string;
  route: string;
  departureLabel: string;
  passengerCount: number;
  totalAmount: number;
  totalAmountLabel: string;
  createdLabel: string;
  cancellable: boolean;
  /** Paid/confirmed booking — its e-ticket can be viewed. */
  paid: boolean;
  /** Reschedule action is enabled — the card MUST still render it (disabled) otherwise. */
  rescheduleEligible: boolean;
  /** i18n key for the disabled-reason tooltip; null when `rescheduleEligible`. */
  rescheduleReasonKey: string | null;
}

/** A booking can only be cancelled by the traveler while it is `confirmed`. */
export const CANCELLABLE_BOOKING_STATUS = 'confirmed';

/** Backend defaults mirrored client-side for up-front reschedule eligibility
 * gating (see OBRS-backend/docs/api/booking.md, `reschedule_window_hours`).
 * The server is always the source of truth — these only avoid presenting an
 * action the backend would reject outright (acceptance criterion #3). */
export const RESCHEDULE_WINDOW_HOURS = 4;

/** Refund methods that the gateway cannot auto-refund (handled manually). */
export const MANUAL_REFUND_METHOD = 'MANUAL_REFUND_REQUIRED';

export function normalizeStatusCode(status: string | null | undefined): string {
  return String(status ?? '').trim().toLowerCase();
}

export function toAmountNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

/** Resolve a stop's localized label, falling back across locales then to its code. */
export function getStopLabel(
  stop: BookingStopLookup | null | undefined,
  locale: SupportedLocale
): string {
  if (!stop) {
    return '';
  }

  const display = stop.display ?? {};
  const localized =
    display[locale]?.label ??
    display['en']?.label ??
    display['th']?.label ??
    Object.values(display).find((item) => item?.label)?.label;

  return (localized ?? stop.code ?? '').trim();
}
