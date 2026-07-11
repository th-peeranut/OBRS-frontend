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
  seatNumber?: string;
  status?: CodeLabel;
}

export interface BookingTicketJourney {
  legType?: CodeLabel;
  fromStop?: BookingTicketStop;
  toStop?: BookingTicketStop;
  departureDateTime?: string;
  arrivalDateTime?: string;
  vehicle?: BookingTicketVehicle;
  tickets?: BookingTicketItem[];
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
