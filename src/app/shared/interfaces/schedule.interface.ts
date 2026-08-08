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
  /** OBRS-1099: the EFFECTIVE departure/arrival — the planned time plus any
   *  announced delay. Equal to the planned time when the round is on schedule,
   *  which is why a client that ignores the field below stays correct. */
  departureDateTime: string;
  arrivalDateTime: string;
  /** OBRS-1099/OBRS-1141: the ORIGINALLY PLANNED departure, sent by the backend
   *  ONLY when this round carries an announced delay and absent otherwise — so
   *  its presence is itself the delay flag, with no second field and no extra
   *  request. Same verified passthrough as `routeSlug` below: the schedule-list
   *  NgRx store keeps `data` as-is with no manual field mapper. Read it through
   *  `delayDisclosureOf` (shared/lib/schedule-delay-disclosure), not by hand. */
  scheduledDepartureDateTime?: string | null;
  pricePerSeat: string | number;
  availableSeats: number;
  availableSeatNumbers: string[];
  /** Slug of the route this schedule runs on. Verified passthrough — the
   *  schedule-list NgRx store keeps `data` as-is with no manual field mapper,
   *  so this appears automatically once the backend includes it. Used to
   *  resolve the authoritative pickup→dropoff distance/duration estimate via
   *  `RouteMapService.getPickupDropoffCached`. */
  routeSlug?: string;
  /** 'OPEN' | 'ASSIGNED' — whether this schedule sells seats without a fixed
   *  seat number (OBRS-318/321). Same verified passthrough as `routeSlug`:
   *  `ScheduleSearchRespDto` already carries it (OBRS-321), the schedule-list
   *  store keeps `data` as-is, and the schedule-booking store keeps whichever
   *  full `Schedule` row the user selected — no manual mapper needed on
   *  either hop, so it's present by the time the booking page reads it. */
  seatingMode?: string;
}

export interface ScheduleList {
  departureSchedules: Schedule[] | null;
  arrivalSchedules: Schedule[] | null;
}

/**
 * GET /api/schedules/{id}/seats — physical seat map for a Schedule's vehicle
 * type (`seatNumber`/`rowIndex`/`columnIndex` are documented today,
 * `docs/api/scheduling.md`). `isWheelchairAccessible`/`isExtraLegroom` are
 * additive booleans from a parallel backend task (OBRS-362) — optional so
 * this stays undefined-safe until that ships; see `docs/handoff.md` Contract
 * Requests. Public endpoint, no auth.
 */
export interface SeatMapRespDto {
  seatNumber: string;
  rowIndex?: number;
  columnIndex?: number;
  isWheelchairAccessible?: boolean;
  isExtraLegroom?: boolean;
}
