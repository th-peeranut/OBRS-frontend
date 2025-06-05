import { Dropdown } from './dropdown.interface';
import { Route } from './route.interface';
import { VehicleType } from './vehicle-type.interface';
export interface ScheduleFilter {
  roundTrip: Dropdown;
  passengerInfo: { type: string; count: number }[];
  startStation: string | number;
  endStation: string | number;
  departureDate: string;
  adultCount?: number;
  kidsCount?: number;
}

export interface ScheduleFilterPayload {
  departureRouteId: number;
  departureDate: string;
  returnRouteId: number | null;
  returnDate: string;
  numberOfPassengers: number;
  bookingType: string;
}

export interface Schedule {
  id: number;
  departureDate: string;
  departureTime: string;
  availableSeat: number;
  travelTime: string;
  arrivalTime: string;
  price: number;
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
