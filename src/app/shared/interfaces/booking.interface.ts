export interface BookingPassenger {
  passengerType: string;
  seatNumber: string | null;
  cost: number;
  firstName: string;
  middleName: string | null;
  lastName: string;
}

export interface BookingSchedulePayload {
  scheduleId: number;
  pickupStationId: number;
  dropOffStationId: number;
  departureDateTime: string;
  arrivalDateTime: string;
  passengers: BookingPassenger[];
}

export interface BookingPayload {
  bookingType: string;
  totalCost: number;
  departureSchedule: BookingSchedulePayload;
  arrivalSchedule?: BookingSchedulePayload | null;
}
