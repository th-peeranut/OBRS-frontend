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

/**
 * OBRS-1343: the stop `arrivalSchedules` was actually searched FROM, which is not
 * necessarily the stop the outbound leg drops the customer at — on
 * `chonburi_bangkok` it is a different stop for 4 of the 6 Bangkok destinations.
 *
 * `distanceMeters` is a straight-line figure the backend computes from the two
 * pins per request. The owner made the NUMBER mandatory rather than the word
 * "nearby" (2026-08-14): one real pair is 8,626 m apart, which is not a walk.
 * Null only when the drop-off stop carries no pin at all — no stop on today's
 * routes is in that state.
 *
 * `sameAsDropOff` is the 2-of-6 case that was always correct; the client shows
 * nothing extra for it, and must not, or every round trip grows a notice saying
 * "board where you got off".
 */
export interface ReturnBoardingStop {
  slug: string;
  name: string;
  distanceMeters: number | null;
  sameAsDropOff: boolean;
}

export interface ScheduleList {
  departureSchedules: Schedule[] | null;
  arrivalSchedules: Schedule[] | null;
  /** Absent on a one-way search, and on a return search with nothing to sell
   *  back at all (that stays the OBRS-1336 empty-return path). Verified
   *  passthrough — the schedule-list store keeps `data` as-is with no manual
   *  field mapper, so it arrives here as the backend sent it. */
  returnBoardingStop?: ReturnBoardingStop | null;
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
