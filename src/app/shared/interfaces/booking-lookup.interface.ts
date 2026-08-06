/**
 * OBRS-857 — the response of `POST /api/bookings/lookup`, the PUBLIC booking lookup.
 *
 * Mirrors `PublicBookingLookupRespDto` / `PublicBookingTicketRespDto` on the backend, which are
 * purpose-built projections rather than reuses of the private booking DTOs. Keep this file the
 * same shape: a field that appears here and not there is a field the frontend will render as
 * `undefined`, and a field that appears there and not here is one nobody reviewing this screen
 * will notice arrived.
 */

/** One end of a leg, as `{code, label}` — see `PublicBookingStopRespDto` on the backend. */
export interface BookingLookupStop {
  /** The `Stop.slug` snapshotted at booking time. Always present. */
  code: string;
  /**
   * The stop's name in the requested locale — **nullable**. A stop renamed since the booking, or
   * one with no translation row for this language, resolves to `null` and the screen falls back
   * to `code`. Do not "fix" that by defaulting to an empty string: a blank stop on a boarding
   * screen is worse than a slug.
   */
  label?: string | null;
}

export interface BookingLookupTicket {
  ticketNumber?: string | null;
  /**
   * Full, UNMASKED — these are the passengers the caller entered on their own booking, and the
   * driver checks the name against an ID card at the door. See `PublicBookingTicketRespDto`.
   */
  passengerName?: string | null;
  /** `null` on an OPEN-seating schedule (OBRS-321/483), not merely omitted. */
  seatNumber?: string | null;
  /** Ticket status slug (`confirmed`, `cancelled`, …). */
  status?: string | null;
  fromStop?: BookingLookupStop | null;
  toStop?: BookingLookupStop | null;
  departureDateTime?: string | null;
  arrivalDateTime?: string | null;
  vehicle?: BookingLookupVehicle | null;
  fareCategory?: string | null;
}

/** Mirrors `JourneyVehicleResponse` — the plate is why this endpoint returns a vehicle at all. */
export interface BookingLookupVehicle {
  vehicleType?: { code?: string; label?: string } | null;
  numberPlate?: string | null;
  vehicleNumber?: string | null;
}

export interface BookingLookupResult {
  bookingNumber: string;
  /** Booking status slug — a cancelled booking IS returned, so the screen must render that. */
  status?: string | null;
  /** Full contact name. Unmasked by the same argument as `passengerName` above. */
  contactName?: string | null;
  /** `••••1234` — a confirmation that the phone matched, never a readback. */
  contactPhoneMasked?: string | null;
  bookedAt?: string | null;
  netAmount?: number | string | null;
  tickets?: BookingLookupTicket[] | null;
}

export interface BookingLookupRequest {
  bookingNumber: string;
  phoneNumber: string;
}
