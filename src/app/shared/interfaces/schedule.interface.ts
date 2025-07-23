import { Dropdown } from './dropdown.interface';
import { Route } from './route.interface';
import { VehicleType } from './vehicle-type.interface';
export interface ScheduleFilter {
  roundTrip: Dropdown;
  passengerInfo: { type: string; count: number }[];

  startStationId: string | number;
  stopStationId: string | number;
  departureDate: string;

  startReturnStationId: string | number;
  stopReturnStationId: string | number;
  returnDate: string;

  adultCount?: number;
  kidsCount?: number;
}

export interface ScheduleFilterPayload {
  bookingType: string; // 'One way' | 'Return'
  numberOfPassengers: number;

  // ขาไป
  startStationId: number;
  stopStationId: number;
  departureDate: string;

  // ขากลับ
  returnDate: string;
  startReturnStationId: number;
  stopReturnStationId: number;

  // unused in frontend
  departureRouteId: number | null;
  returnRouteId: number | null;
}

export interface Schedule {
  id: number;
  departureDate: string;
  departureTime: string;
  availableSeat: number;
  travelTime: string;
  arrivalTime: string;
  fare: number;
  status: string;
  createdBy: string;
  createdDate: string;
  lastUpdatedBy: string;
  lastUpdatedDate: string;

  route: Route | null;

  // change when have data <T> | null
  vehicle: null;

  vehicleType: VehicleType | null;

  // change when have data <T> | null
  driver: any | null;
}

export interface ScheduleList {
  departureSchedules: Schedule[] | null;
  returnSchedules: Schedule[] | null;
}
