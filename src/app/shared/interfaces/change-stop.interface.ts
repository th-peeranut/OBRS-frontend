// My Bookings → change-stop flow contract — backed by:
//   GET  /api/private/bookings/{id}/change-stop/estimate  (ChangeStopEstimateRespDto)
//   POST /api/private/bookings/{id}/change-stop/confirm   (ChangeStopBookingRespDto)
// See ../../../../OBRS-backend/docs/api/booking.md.

import { PaymentDirection } from './reschedule.interface';

/** `ChangeStopEstimateRespDto` — cost preview shown before confirming new
 * pickup/drop-off stops. Deliberately has no `rescheduleFee`-equivalent
 * field — change-stop charges no fee, only the fare difference (see
 * `reschedule-estimate-summary.component.ts`'s `hideFee` input, which this
 * estimate relies on to suppress the fee row when reused for this flow). */
export interface ChangeStopEstimate {
  oldFare: number | string;
  newFare: number | string;
  fareDiff: number | string;
  netAmount: number | string;
  paymentDirection: PaymentDirection;
}

/** An existing ticket's seat, carried over as-is — change-stop never
 * reassigns seats, only the pickup/drop-off stops. `seatNumber` is `null` on
 * an `OPEN`-seating schedule (OBRS-483 — the backend normalizes every
 * ticket's seat to null there). NOTE: unlike reschedule, the backend
 * currently HARD-REJECTS `POST .../change-stop/confirm` on an OPEN schedule
 * with `change-stop.error.open-seating-not-supported`
 * (`CHANGE_STOP_ERROR_OPEN_SEATING_NOT_SUPPORTED` below) — a deliberate v1
 * limitation (needs a 5th occupancy-query variant), not a domain law like
 * change-seat's. The FE gates `changeStopEligible=false` under OPEN
 * (`my-bookings.component.ts`) so the dialog never reaches this rejection in
 * practice; the type stays nullable for defensive correctness/parity with
 * reschedule. */
export interface ChangeStopSeatAssignment {
  ticketId: number;
  seatNumber: string | null;
}

/** `ChangeStopBookingRespDto` — result of `POST .../change-stop/confirm`. */
export interface ChangeStopResult {
  bookingId: number;
  bookingNumber: string;
  /** `CONFIRMED` (settled immediately — refund or no additional payment) or
   * `PENDING_PAYMENT` (top-up owed). */
  status: string;
  paymentIntentId?: number | null;
}

/** Stable UPPER_SNAKE error codes surfaced by the change-stop endpoints
 * (`error.error.errorCode`). Branch on these, never on `error.message`
 * (design-system §9). */
export const CHANGE_STOP_ERROR_CODES = [
  'CHANGE_STOP_ERROR_NOT_CONFIRMED',
  'CHANGE_STOP_ERROR_MAX_COUNT',
  'CHANGE_STOP_ERROR_WINDOW_CLOSED',
  'CHANGE_STOP_ERROR_INVALID_SEGMENT',
  'CHANGE_STOP_ERROR_ROUTE_MISMATCH',
  'CHANGE_STOP_ERROR_SAME_SEGMENT',
  'CHANGE_STOP_ERROR_NO_SEATS',
  'CHANGE_STOP_ERROR_NET_AMOUNT_CHANGED',
  'CHANGE_STOP_ERROR_UNAUTHORIZED',
  'CHANGE_STOP_ERROR_BOOKING_NOT_FOUND',
  'CHANGE_STOP_ERROR_MULTI_LEG_NOT_SUPPORTED',
  // OBRS-358: the ONE shared jump-seat channel-guard code, also reachable
  // from create-booking/reschedule/change-seat — see
  // change-seat.interface.ts's identical entry for the full rationale.
  'SEAT_ERROR_WALK_IN_ONLY',
  // OBRS-483: change-stop confirm hard-rejects an OPEN-seating schedule
  // (`change-stop.error.open-seating-not-supported`, verified against
  // `ChangeStopService.java` — a deliberate v1 limitation, not implemented
  // yet). The FE gates this off via `changeStopEligible=false` before the
  // dialog can open, so this code is defense-in-depth only (e.g. a stale
  // eligibility read racing a mode change).
  'CHANGE_STOP_ERROR_OPEN_SEATING_NOT_SUPPORTED',
] as const;

export type ChangeStopErrorCode = (typeof CHANGE_STOP_ERROR_CODES)[number] | 'GENERIC';

/** Mirrors the backend's change-stop window default (see
 * OBRS-backend/docs/api/booking.md) — bounds up-front client-side
 * eligibility gating. The server remains the source of truth
 * (`CHANGE_STOP_ERROR_WINDOW_CLOSED` if this drifts). Unlike reschedule,
 * there is no 30-day/TOO_FAR check — change-stop doesn't move the
 * departure date, only the pickup/drop-off stops. */
export const CHANGE_STOP_WINDOW_HOURS = 4;
