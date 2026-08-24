// My Bookings → reschedule flow contract — backed by:
//   GET  /api/private/bookings/{id}/reschedule-options   (RescheduleOptionRespDto[])
//   GET  /api/private/bookings/{id}/reschedule-estimate  (RescheduleEstimateRespDto)
//   POST /api/private/bookings/{id}/reschedule            (RescheduleBookingRespDto)
// See ../../../../OBRS-backend/docs/api/booking.md.

/** The project's standard `{slug, name}` pair (`NewTranslationRespDto`) — `name` is already
 *  resolved against the request's language by the backend and is the ONLY half a screen renders;
 *  `slug` is the stable key for icons/predicates. */
export interface TranslatedRef {
  slug: string;
  name: string;
}

/** `RescheduleOptionRespDto` — one candidate departure for a reschedule date. */
export interface RescheduleOption {
  scheduleId: number;
  /** OBRS-1060: was `vehicleTypeName`, which carried `vt.slug` ("minibus") straight out of the
   *  shared search query and printed it in the middle of the dialog's Thai text. The endpoint has
   *  its own DTO now and sends the translated label as `vehicleType.name`. `vehicleTypeId` and
   *  `occupiedSeatNumbers` went with it — declared here, read nowhere. */
  vehicleType?: TranslatedRef;
  departureDateTime: string;
  arrivalDateTime: string;
  /** OBRS-1099/OBRS-1141: the originally planned departure, present ONLY when
   *  this candidate round has an announced delay. `getRescheduleOptions` runs
   *  the same `searchSchedulesWithAvailability` query as customer search, so a
   *  candidate round here can be delayed exactly like a search result — and it
   *  matters most here, because OBRS-666 lets a 45-minute delay unlock a free
   *  reschedule and a passenger must not land on another delayed round without
   *  being told. */
  scheduledDepartureDateTime?: string | null;
  pricePerSeat: number | string;
  availableSeats: number;
}

/** `RescheduleEstimateRespDto.paymentDirection`. */
export type PaymentDirection = 'TOP_UP' | 'REFUND' | 'NO_PAYMENT';

/** `RescheduleEstimateRespDto` — cost preview shown before confirming. */
export interface RescheduleEstimate {
  oldFare: number | string;
  newFare: number | string;
  fareDiff: number | string;
  rescheduleFee: number | string;
  netAmount: number | string;
  paymentDirection: PaymentDirection;
  /**
   * OBRS-1167 (AC-5): "would this reschedule pay the customer back, IN CASH?" — the single
   * question that decides whether the counter's cash hand-over affordance appears at all. True
   * only when `netAmount` is negative AND the booking's PAID tender is cash, computed server-side
   * by the very predicate the second-person gate uses, so the screen can never offer a lane the
   * confirm would then refuse.
   *
   * Optional so this build against an older backend degrades to `undefined` → falsy → exactly
   * today's behaviour (no affordance, no ledger row) rather than throwing.
   */
  cashRefundEligible?: boolean;
}

/** An existing ticket's seat, carried over as-is to the new schedule.
 * `seatNumber` is `null` on an `OPEN`-seating schedule (OBRS-483) — the
 * backend normalizes every ticket's seat to null there, and OBRS-475 made
 * `POST .../reschedule` accept exactly that in `seatAssignments`. */
export interface RescheduleSeatAssignment {
  ticketId: number;
  seatNumber: string | null;
}

/** `RescheduleBookingRespDto` — result of `POST .../reschedule`. */
export interface RescheduleResult {
  bookingId: number;
  bookingNumber: string;
  /** `CONFIRMED` (swap settled immediately) or `PENDING_PAYMENT` (top-up owed). */
  status: string;
  paymentIntentId?: number | null;
}

/** Stable UPPER_SNAKE error codes surfaced by the reschedule endpoints
 * (`DomainException.getErrorCode()` derives these from the backend's
 * `reschedule.error.*` message keys — e.g. `reschedule.error.no-seats` →
 * `RESCHEDULE_ERROR_NO_SEATS`). Branch on these, never on `error.message`. */
export const RESCHEDULE_ERROR_CODES = [
  'RESCHEDULE_ERROR_NOT_CONFIRMED',
  'RESCHEDULE_ERROR_MAX_COUNT',
  'RESCHEDULE_ERROR_MULTI_LEG_NOT_SUPPORTED',
  'RESCHEDULE_ERROR_SAME_SCHEDULE',
  'RESCHEDULE_ERROR_BOOKING_NOT_FOUND',
  'RESCHEDULE_ERROR_WINDOW_CLOSED',
  'RESCHEDULE_ERROR_DATE_TOO_FAR',
  'RESCHEDULE_ERROR_ROUTE_MISMATCH',
  'RESCHEDULE_ERROR_NO_SEATS',
  'RESCHEDULE_ERROR_NET_AMOUNT_CHANGED',
  'RESCHEDULE_ERROR_UNAUTHORIZED',
  // OBRS-358: the ONE shared jump-seat channel-guard code, also reachable
  // from create-booking/change-seat/change-stop — see
  // change-seat.interface.ts's identical entry for the full rationale.
  'SEAT_ERROR_WALK_IN_ONLY',
] as const;

/** Client-only code (never sent by the backend) for the confirm-time
 * re-fetch-and-compare guard (acceptance criterion #9). */
export const RESCHEDULE_PRICE_CHANGED = 'RESCHEDULE_PRICE_CHANGED';

export type RescheduleErrorCode =
  | (typeof RESCHEDULE_ERROR_CODES)[number]
  | typeof RESCHEDULE_PRICE_CHANGED
  | 'GENERIC';
