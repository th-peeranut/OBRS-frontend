// My Bookings → change-seat flow contract — backed by:
//   GET  /api/private/bookings/{id}/change-seat/availability  (ChangeSeatAvailabilityRespDto)
//   POST /api/private/bookings/{id}/change-seat                (ChangeSeatBookingRespDto)
// See ../../../../OBRS-backend/docs/api/booking.md.

/**
 * One seat slot on the schedule's map. `rowIndex`/`columnIndex` are carried
 * for parity with the backend projection but are NOT used here — the app's
 * seat components (`app-passenger-seat-bus`/`app-passenger-seat-van`) render
 * a FIXED layout keyed off `vehicleType` alone (see
 * `docs/adr/0009-change-seat-dialog.md`).
 */
export interface ChangeSeatMapSeat {
  seatNumber: string;
  rowIndex?: number;
  columnIndex?: number;
}

/** `ChangeSeatAvailabilityRespDto` — the candidate seat map for a booking's
 * (single, one-way) leg, ahead of picking new seats. */
export interface ChangeSeatAvailability {
  scheduleId: number;
  vehicleType: string;
  fromStopId: number;
  toStopId: number;
  seats: ChangeSeatMapSeat[];
  occupiedSeatNumbers: string[];
  currentSeatNumbers: string[];
}

/** `ChangeSeatBookingRespDto` — result of `POST .../change-seat`. Always
 * `CONFIRMED` — change-seat never triggers a payment step. */
export interface ChangeSeatResult {
  bookingId: number;
  bookingNumber: string;
  status: string;
  paymentIntentId: null;
}

/** Stable UPPER_SNAKE error codes surfaced by the change-seat endpoints
 * (`error.error.errorCode`). Branch on these, never on `error.message`
 * (design-system §9). */
export const CHANGE_SEAT_ERROR_CODES = [
  'CHANGE_SEAT_ERROR_NOT_CONFIRMED',
  'CHANGE_SEAT_ERROR_MAX_COUNT',
  'CHANGE_SEAT_ERROR_WINDOW_CLOSED',
  'CHANGE_SEAT_ERROR_SEAT_UNAVAILABLE',
  'CHANGE_SEAT_ERROR_NO_SEATS',
  'CHANGE_SEAT_ERROR_SEAT_NOT_IN_MAP',
  'CHANGE_SEAT_ERROR_TICKET_MISMATCH',
  'CHANGE_SEAT_ERROR_MULTI_LEG_NOT_SUPPORTED',
  'CHANGE_SEAT_ERROR_UNAUTHORIZED',
  'CHANGE_SEAT_ERROR_BOOKING_NOT_FOUND',
  // OBRS-358: the ONE shared jump-seat channel-guard code, also reachable
  // from create-booking/reschedule/change-stop — a non-staff request
  // targeting the walk-in-only seat (e.g. minibus seat 1). Mapped to the
  // shared `COMMON.ERROR.SEAT_WALK_IN_ONLY` key (never duplicated per flow)
  // in `shared/lib/change-seat-error.ts`.
  'SEAT_ERROR_WALK_IN_ONLY',
] as const;

export type ChangeSeatErrorCode = (typeof CHANGE_SEAT_ERROR_CODES)[number] | 'GENERIC';

/** An existing ticket, carried through the dialog while the traveler picks a
 * new seat for it. */
export interface ChangeSeatTicket {
  ticketId: number;
  seatNumber: string;
}
