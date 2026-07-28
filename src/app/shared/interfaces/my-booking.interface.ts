// Traveler-facing "my bookings" contract — backed by:
//   GET  /api/private/bookings/me            (BookingRespDto page)
//   GET  /api/private/bookings/{id}/cancel-policy  (CancellationPolicyRespDto)
//   POST /api/private/bookings/{id}/cancel         (CancelBookingRespDto)
// See ../../../../OBRS-backend/docs/api/booking.md.

import { RefundDestinationReqDto } from './refund-destination.interface';

export type SupportedLocale = 'en' | 'th' | 'zh';

export interface LookupTranslation {
  label?: string;
  description?: string;
}

/** A localized stop reference (`LookupResponse` on the backend). */
export interface BookingStopLookup {
  /**
   * The stop's numeric id — always present on the wire (`StopDtoService.toLookupResponse()`,
   * verified against live SIT: `fromStop` returns `{"id": 1, "code": "nong_chak", "display": {...}}`).
   * Declared optional here only because nothing consumed it before OBRS-575; this is a
   * TS-interface widening, not a backend/runtime change.
   */
  id?: number;
  code?: string;
  display?: Record<string, LookupTranslation | null | undefined>;
}

/** A ticket as it appears nested under a `BookingScheduleRespDto` leg. */
export interface MyBookingScheduleTicketDto {
  id?: number;
  ticketNumber?: string;
  /** `null` (not just absent) on an `OPEN`-seating schedule (OBRS-321/483) —
   * mirrors `BookingTicketItem.seatNumber` in `booking-ticket.interface.ts`. */
  seatNumber?: string | null;
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
  /**
   * Slug of the route this leg runs on — resolves `RouteMapService.getPickupDropoff(slug)`
   * for the change-stop dialog's pickup/drop-off pickers (OBRS-110 wave 2).
   * See OBRS-backend/docs/api/booking.md `GET /bookings/me`.
   */
  routeSlug?: string;
  /**
   * `schedules.seating_mode` (OBRS-321), never null for a real schedule
   * (OBRS-483). Drives the reschedule/change-seat/change-stop eligibility
   * gates — build against this field directly, never re-derive OPEN-ness
   * from a ticket's `seatNumber` being null (that inference can't tell
   * "OPEN" from "tickets not loaded yet"; see `booking-ticket-view.ts`'s
   * `isJourneyOpenSeating`, an existing, separately-tracked limitation this
   * card does not touch).
   */
  seatingMode?: 'OPEN' | 'ASSIGNED';
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
  /**
   * Number of times this booking has already had a seat changed (0 or 1 — a
   * booking can only have its seat changed once). Drives up-front
   * eligibility gating for the Change seat action without waiting for a
   * `CHANGE_SEAT_ERROR_MAX_COUNT` response. See
   * OBRS-backend/docs/api/booking.md `GET /bookings/me`.
   */
  seatChangeCount?: number;
  /**
   * Stop-change counterpart of `seatChangeCount` (0 or 1 — a booking can
   * only have its pickup/drop-off stops changed once). Drives up-front
   * eligibility gating for the Change stop action (OBRS-110 wave 2). See
   * OBRS-backend/docs/api/booking.md `GET /bookings/me`.
   */
  stopChangeCount?: number;
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

/**
 * OBRS-286 — extends the cancel request (today posts an empty body,
 * `booking.service.ts`). `refundDestination` is required by the backend IFF
 * the cancel resolves to `MANUAL_REFUND_REQUIRED`; the FE mirrors that via
 * Flow A1's modal, but the server remains the authority (400
 * `cancel.error.refund-destination-required` / `-invalid`).
 *
 * OBRS-766 — additive extension for the counter (staff act-on-behalf) cancel
 * surface: `approverEmail`/`approverPassword` carry a SECOND PERSON's (the
 * owner's) credentials, required by the backend IFF the cancel resolves to
 * `refundMethod === 'CASH'` (OBRS-669's cash second-person approval). Both
 * fields are optional on the wire and MUST be omitted (not sent as empty
 * strings) for every other refund method, so the one existing caller
 * (`my-bookings.effect.ts`'s customer path, via `booking.service.ts`) keeps
 * posting the exact same body it always has — this widening is invisible to
 * it (design-system §10: extend, don't fork).
 */
export interface CancelBookingReqDto {
  refundDestination?: RefundDestinationReqDto;
  approverEmail?: string;
  approverPassword?: string;
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
  /** Change seat action is enabled — the card MUST still render it (disabled) otherwise. */
  changeSeatEligible: boolean;
  /** i18n key for the disabled-reason tooltip; null when `changeSeatEligible`. */
  changeSeatReasonKey: string | null;
  /** Change stop action is enabled — the card MUST still render it (disabled) otherwise. */
  changeStopEligible: boolean;
  /** i18n key for the disabled-reason tooltip; null when `changeStopEligible`. */
  changeStopReasonKey: string | null;
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
