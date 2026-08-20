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
  /**
   * ALWAYS `null` on this list endpoint — the list projection deliberately does
   * not load the ticket rows (`BookingScheduleDtoService#toListScheduleDto`).
   * Present on the type because the same shape is reused by detail responses.
   *
   * Never count these to render a passenger figure on a list row: on this
   * endpoint `tickets?.length ?? 0` is 0 for every booking ever made, which is
   * exactly the defect OBRS-635 fixed. Use `passengerCount` below.
   */
  tickets?: MyBookingScheduleTicketDto[];
  /**
   * How many passengers this leg is for (OBRS-635). Server-computed and always
   * present — a `0` here means a leg with genuinely no passenger tickets, not
   * "not loaded". Excludes carry-on-on-seat parcel tickets and the superseded
   * ticket generations a reschedule leaves attached to the leg; see
   * `BookingPassengerCountResolver` for the exact rule.
   *
   * The number shown on the card is the booking's passenger count, taken from
   * the FIRST leg — not the sum across legs. A round trip for 2 people is
   * "2 passengers", not 4 tickets.
   */
  passengerCount?: number;
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
   * Number of times this booking has already been rescheduled. Drives up-front
   * eligibility gating for the Reschedule action without waiting for a
   * `RESCHEDULE_ERROR_MAX_COUNT` response. See OBRS-backend/docs/api/booking.md
   * `GET /bookings/me`.
   *
   * OBRS-657 — no longer "0 or 1". Compare it against `rescheduleMaxCount`, never
   * against a literal: the cap is the operator's, and it defaults to unlimited.
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
  /**
   * OBRS-699 — the reschedule window, in hours before departure, resolved by the
   * backend under the operator who sells THIS booking's trip. Gates all THREE
   * actions (reschedule, change seat, change stop): the backend reads the one
   * `reschedule_window_hours` key for each of them.
   *
   * Absent/null means the backend could NOT resolve a governing operator, never
   * "use the default" — the action is hidden rather than offered on a policy
   * nobody stated. `BookingRespDto` is `@JsonInclude(NON_NULL)`, so the key is
   * missing rather than null on the wire.
   */
  rescheduleWindowHours?: number | null;
  /**
   * OBRS-699 — how far past the original departure date a reschedule may move
   * the trip, in days, resolved under the same operator as
   * `rescheduleWindowHours`. Same absent/null contract.
   */
  rescheduleMaxDaysAhead?: number | null;
  /**
   * OBRS-657 — how many times this booking may be rescheduled in total, where
   * **0 means UNLIMITED** (the shipped default, matching what the queue does at
   * the counter). The literal `rescheduleCount >= 1` this replaced was the
   * frontend re-declaring a server rule, so it kept hiding the Reschedule action
   * after one use no matter what the backend enforced.
   *
   * OBRS-1447 — the cap became owner-scoped (an owner sets it on the
   * cancel/reschedule policy page and the backend enforces it under the same
   * operator), so this now carries the SAME absent/null contract as the two
   * fields above: absent means no governing operator resolved, never "unlimited".
   * Hide the action instead of offering one the server may refuse.
   */
  rescheduleMaxCount?: number | null;
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
  /**
   * OBRS-1136 AC-3 — how long a refund that cannot be automated takes, in CALENDAR days from
   * the cancellation. Rendered into `MANUAL_REFUND_NOTE`, never typed into i18n: the same
   * `manual_refund_due_days` config drives the owner's overdue badge (AC-4), so a hardcoded
   * sentence here would promise a wait nobody is measuring.
   */
  manualRefundDueDays?: number;
  /**
   * OBRS-699 (D-4) — the two reschedule dials the cancel dialog's own
   * "reschedule instead?" offer needs, resolved under the same operator as the
   * refund quote above so the offer cannot state one operator's horizon over
   * another operator's trip. Absent/null means unresolvable, never a default.
   */
  rescheduleWindowHours?: number | null;
  rescheduleMaxDaysAhead?: number | null;
}

/**
 * OBRS-286 — extends the cancel request (today posts an empty body,
 * `booking.service.ts`). `refundDestination` is required by the backend IFF
 * the cancel resolves to `MANUAL_REFUND_REQUIRED`; the FE mirrors that via
 * Flow A1's modal, but the server remains the authority (400
 * `cancel.error.refund-destination-required` / `-invalid`).
 *
 * OBRS-766 — additive extension for the counter (staff act-on-behalf) cancel
 * surface: a SECOND PERSON (the owner) must authorize the cancel IFF it
 * resolves to `refundMethod === 'CASH'` (OBRS-669's cash second-person
 * approval). The field is optional on the wire and MUST be omitted (not sent
 * as an empty string) for every other refund method, so the one existing
 * caller (`my-bookings.effect.ts`'s customer path, via `booking.service.ts`)
 * keeps posting the exact same body it always has — this widening is
 * invisible to it (design-system §10: extend, don't fork).
 *
 * OBRS-844 — `approverEmail`/`approverPassword` are GONE, replaced by
 * `approvalCode`. They carried the owner's reusable account password through
 * the salesperson's browser in order to authorize one refund; the six digits
 * that replace them open one booking, once, for two minutes. They were
 * removed rather than deprecated on purpose: a field that still exists is a
 * field a client can still send, and the whole value of the change is that
 * there is no longer anywhere for a password to be typed on this screen.
 */
export interface CancelBookingReqDto {
  refundDestination?: RefundDestinationReqDto;
  approvalCode?: string;
}

/**
 * OBRS-844 — `CashRefundApprovalRequestRespDto`: one pending cash-refund
 * authorization. Returned both to the salesperson who asked (so the counter
 * can say what it is waiting for) and to the owner deciding on it.
 *
 * Carries NO code. The six digits exist only in the response to the owner's
 * approve call (`CashRefundApprovalCode`), once — anything that could re-read
 * them would let the counter obtain a code without the owner ever acting.
 */
export interface CashRefundApprovalRequest {
  id: number;
  bookingId: number;
  bookingNumber: string;
  refundAmount: number | string;
  /** Who is asking — shown to the owner so they can refuse a request that should not be coming. */
  requestedBy: string;
  status: 'PENDING' | 'APPROVED' | 'CONSUMED' | 'EXPIRED' | 'ABANDONED';
  requestedAt: string;
  codeExpiresAt?: string | null;
}

/** OBRS-844 — the six digits, shown to the approving owner exactly once. */
export interface CashRefundApprovalCode {
  requestId: number;
  code: string;
  expiresAt: string;
  ttlMinutes: number;
}

/** `CancelBookingRespDto` — result of a successful cancellation. */
export interface CancelBookingResult {
  bookingId: number;
  bookingNumber: string;
  status: string;
  refundAmount: number | string;
  refundMethod: string;
  /** OBRS-1136 AC-3 — the same published wait as {@link CancellationPolicy}, for the success toast. */
  manualRefundDueDays?: number;
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

/** Refund methods that the gateway cannot auto-refund (handled manually). */
export const MANUAL_REFUND_METHOD = 'MANUAL_REFUND_REQUIRED';

/** The one tender a salesperson hands back out of the counter drawer themselves
 * (OBRS-669's second-person path). Mirrors `CancellationService.resolveRefundMethod`,
 * which upper-cases the payment method slug for every non-manual lane. */
export const CASH_REFUND_METHOD = 'CASH';

/**
 * OBRS-843: which of the three refund lanes a completed cancellation landed in.
 * Named after the SUCCESS_* i18n key suffix each screen owns, because what the
 * lane changes is WHO moves the money next and therefore what the confirmation
 * has to tell the person reading it:
 *
 * - `CASH`   — the salesperson must hand this many baht back from the drawer NOW
 * - `MANUAL` — nobody moves money at the counter; the owner transfers it later
 * - `AUTO`   — the gateway is already refunding to the original card/wallet
 *
 * Read from the CANCEL RESPONSE (`CancelBookingResult.refundMethod`), never from
 * the pre-cancel policy preview: the two can disagree (a payment can flip method
 * between preview and submit) and the response is what actually happened.
 */
export type RefundLane = 'CASH' | 'MANUAL' | 'AUTO';

export function refundLane(refundMethod: string | null | undefined): RefundLane {
  const method = String(refundMethod ?? '').trim().toUpperCase();
  if (method === CASH_REFUND_METHOD) {
    return 'CASH';
  }
  return method === MANUAL_REFUND_METHOD ? 'MANUAL' : 'AUTO';
}

/** THB, grouped, 2dp — the one refund-amount format every cancel surface shows. */
export function formatRefundAmount(value: number | string | null | undefined): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(toAmountNumber(value));
}

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
