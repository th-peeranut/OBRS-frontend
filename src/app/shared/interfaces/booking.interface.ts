export interface BookingPassenger {
  passengerType: string;
  seatNumber: string | null;
  title: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  identityCardNumber?: string | null;
  phoneNumber?: string | null;
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
