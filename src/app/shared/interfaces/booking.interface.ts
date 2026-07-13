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
