// My Bookings → reschedule flow contract — backed by:
//   GET  /api/private/bookings/{id}/reschedule-options   (ScheduleSearchProjection[])
//   GET  /api/private/bookings/{id}/reschedule-estimate  (RescheduleEstimateRespDto)
//   POST /api/private/bookings/{id}/reschedule            (RescheduleBookingRespDto)
// See ../../../../OBRS-backend/docs/api/booking.md.

/** `ScheduleSearchProjection` — one candidate departure for a reschedule date. */
export interface RescheduleOption {
  scheduleId: number;
  vehicleTypeId?: number;
  vehicleTypeName?: string;
  departureDateTime: string;
  arrivalDateTime: string;
  pricePerSeat: number | string;
  availableSeats: number;
  occupiedSeatNumbers?: string[];
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
}

/** An existing ticket's seat, carried over as-is to the new schedule. */
export interface RescheduleSeatAssignment {
  ticketId: number;
  seatNumber: string;
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
] as const;

/** Client-only code (never sent by the backend) for the confirm-time
 * re-fetch-and-compare guard (acceptance criterion #9). */
export const RESCHEDULE_PRICE_CHANGED = 'RESCHEDULE_PRICE_CHANGED';

export type RescheduleErrorCode =
  | (typeof RESCHEDULE_ERROR_CODES)[number]
  | typeof RESCHEDULE_PRICE_CHANGED
  | 'GENERIC';

/** Mirrors the backend's `reschedule_max_days_ahead` default (see
 * OBRS-backend/docs/api/booking.md) — bounds the date picker's max date
 * relative to the booking's original departure date. The server remains the
 * source of truth (`RESCHEDULE_ERROR_DATE_TOO_FAR` if this drifts). */
export const RESCHEDULE_MAX_DAYS_AHEAD = 30;
