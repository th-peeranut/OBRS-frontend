export interface BookingPassenger {
  passengerType: string;
  seatNumber: string | null;
  title: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  identityCardNumber?: string | null;
  phoneNumber?: string | null;
  /**
   * OBRS-296: per-passenger fare category — SEPARATE from `passengerType`
   * (which carries gender: male/female/monk/nun). The server computes the
   * 50% child discount off this field; the client never precomputes it
   * (see `PassengerInfoComponent.calculateTotalAmount()`, which still sends
   * the gross full-fare total).
   */
  fareCategory: 'adult' | 'child';
  /**
   * OBRS-361: optional, best-effort per-passenger preferences. Sent
   * lowercase per the backend contract even though the FE enum values are
   * uppercase (mapped at the payload boundary in
   * `PassengerInfoComponent.buildPassengersPayload`). AC-361.5: MUST be
   * `null` on a leg whose schedule is OPEN seating — never attach a
   * preference to a leg with no fixed seat.
   */
  seatPreference?: 'window' | 'aisle' | null;
  seatRequirement?: 'wheelchair' | 'extra_legroom' | null;
}

export interface BookingContact {
  title: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  phoneNumber: string;
  email?: string | null;
  preferredLocale: string;
  identityCardNumber?: string | null;
}

export interface BookingSchedulePayload {
  scheduleId: number;
  fromStop: string;
  toStop: string;
  departureDateTime: string;
  arrivalDateTime: string;
  passengers: BookingPassenger[];
}

export interface BookingPayload {
  bookingType: string;
  totalAmount: number;
  bookingChannel: string;
  contact: BookingContact;
  departureSchedule: BookingSchedulePayload;
  arrivalSchedule?: BookingSchedulePayload | null;
  // OBRS-109 (#37): only a code the customer confirmed via the instant
  // preview (PromoCodeFieldComponent) is ever sent — never precomputed or
  // guessed client-side.
  promotionCode?: string | null;
  // OBRS-858 (ADR-0123 Decision 4): the privacy-notice version on screen when the booker
  // ticked consent at checkout. Recorded on the users row — the data subject — never on the
  // booking, so PDPA erasure stays the one mechanism OBRS-632 already built. The backend
  // IGNORES it for a signed-in caller (their consent already lives on their own row); it can
  // only ever land on a guest's shadow row.
  pdpaConsentVersion?: string | null;
}

export interface CreateBookingResponse {
  bookingId: number;
  bookingNumber: string;
  // OBRS-85: server-computed round-trip discount snapshot. Only present once
  // the booking is created — never precompute a discount client-side.
  totalAmount?: number;
  discountAmountSnapshot?: number;
  netAmount?: number;
}

export interface BookingState {
  bookingId: number | null;
  bookingNumber: string | null;
  totalAmount?: number;
  discountAmountSnapshot?: number;
  netAmount?: number;
}
