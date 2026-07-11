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

  // Outbound leg
  fromStop: string | null;
  toStop: string | null;
  departureDate: string;

  // Return leg, when present
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
  /** Slug of the route this schedule runs on. Verified passthrough — the
   *  schedule-list NgRx store keeps `data` as-is with no manual field mapper,
   *  so this appears automatically once the backend includes it. Used to
   *  resolve the authoritative pickup→dropoff distance/duration estimate via
   *  `RouteMapService.getPickupDropoffCached`. */
  routeSlug?: string;
}

export interface ScheduleList {
  departureSchedules: Schedule[] | null;
  arrivalSchedules: Schedule[] | null;
}
