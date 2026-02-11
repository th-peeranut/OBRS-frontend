export interface BookingPassenger {
  passengerType: string;
  seatNumber: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
}

export interface BookingContact {
  fullName: string;
  phoneNumber: string;
  preferredLocale: string;
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
