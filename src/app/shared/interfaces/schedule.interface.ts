import { Dropdown } from './dropdown.interface';
export interface ScheduleFilter {
  roundTrip: Dropdown;
  passengerInfo: { type: string; count: number }[];

  startStationId: string | number;
  stopStationId: string | number;
  departureDate: string;

  returnDate?: string | null;

  adultCount?: number;
  kidsCount?: number;
}

export interface ScheduleFilterPayload {
  bookingType: string; // 'one_way' | 'return'
  numberOfPassengers: number;

  // ขาไป
  fromStop: string | null;
  toStop: string | null;
  departureDate: string;

  // ขากลับ (ถ้ามี)
  returnDate?: string | null;
}

export interface Schedule {
  id: number;
  vehicleType: string | null;
  departureDateTime: string;
  arrivalDateTime: string;
  pricePerSeat: string | number;
  availableSeats: number;
  availableSeatNumbers: string[];
}

export interface ScheduleList {
  departureSchedules: Schedule[] | null;
  arrivalSchedules: Schedule[] | null;
}
