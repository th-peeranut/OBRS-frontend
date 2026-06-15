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

export interface BookingState {
  bookingId: number | null;
  bookingNumber: string | null;
}

export interface BookingCreationResponse {
  bookingId?: number;
  id?: number;
  bookingNumber?: string;
  bookingNo?: string;
  number?: string;
  booking?: {
    id?: number;
    bookingNumber?: string;
  };
}
