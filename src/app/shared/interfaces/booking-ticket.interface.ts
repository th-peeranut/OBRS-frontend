export interface CodeLabel {
  code: string;
  label: string;
}

export interface BookingTicketProvince {
  code: string;
  label: string;
}

export interface BookingTicketStop {
  code: string;
  label: string;
  province?: BookingTicketProvince;
  /** Distance (km) of this stop from the route origin. Carried through from
   *  `RouteStop.distanceKmFromOrigin` so the e-ticket card can derive a
   *  pickup→dropoff estimate via `tripEstimateFromStops`. */
  distanceKmFromOrigin?: number | null;
  /** Minutes from the route origin's departure baseline to this stop.
   *  Carried through from `RouteStop.offsetMinutesFromOrigin`. */
  offsetMinutesFromOrigin?: number | null;
  /** OBRS-269: coordinates carried through from `RouteStop.latitude`/`longitude`
   *  so the e-ticket can offer a "Navigate to pickup" deep-link. Optional/nullable
   *  so older fixtures/consumers and a stop missing this field stay valid — the
   *  Navigate button hides itself when either is null (see `TicketLeg`). */
  latitude?: number | null;
  longitude?: number | null;
}

export interface BookingTicketVehicle {
  vehicleType?: CodeLabel;
  numberPlate?: string;
  vehicleNumber?: string;
}

export interface BookingTicketItem {
  id: number;
  ticketNumber: string;
  passengerType?: CodeLabel;
  passengerName?: string;
  /** `null` (not just absent) on an `OPEN`-seating schedule — the backend
   * normalizes every ticket's seat to null there (OBRS-321/483), it is
   * never merely omitted from the response. */
  seatNumber?: string | null;
  status?: CodeLabel;
  /** OBRS-296: per-passenger fare category the booking was created with —
   *  server-authoritative (drives the 50% child-discount and the boarding
   *  manifest's mismatch-flag surface). `undefined` on an older
   *  ticket/fixture predating this field. */
  fareCategory?: 'adult' | 'child';
}

export interface BookingTicketJourney {
  legType?: CodeLabel;
  fromStop?: BookingTicketStop;
  toStop?: BookingTicketStop;
  departureDateTime?: string;
  arrivalDateTime?: string;
  vehicle?: BookingTicketVehicle;
  tickets?: BookingTicketItem[];
  /**
   * `schedules.seating_mode` (OBRS-321), never null for a real schedule
   * (OBRS-483) — mirrors `MyBookingScheduleDto.seatingMode`. Not yet
   * consumed here: `booking-ticket-view.ts`'s `isJourneyOpenSeating` still
   * infers OPEN-ness from `seatNumber`, a separately-tracked limitation
   * (OBRS-325); this field is added so a future fix can read it directly
   * instead of re-deriving.
   */
  seatingMode?: 'OPEN' | 'ASSIGNED';
}

export interface BookingTicketsData {
  bookingId: number;
  bookingNumber: string;
  bookingStatus?: string;
  totalTickets?: number;
  contactPhoneNumber?: string;
  totalAmount?: number | string;
  journeys?: BookingTicketJourney[];
}
