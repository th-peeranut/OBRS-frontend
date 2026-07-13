/** A single passenger row rendered on the e-ticket card. */
export interface TicketPassenger {
  name: string;
  phone: string;
  seat: string;
  /** OBRS-296: `undefined`/`null` for the booker row (which has no fare
   *  category of its own) and for a pre-API render where the ticket API
   *  response hasn't landed yet. */
  fareCategory?: 'adult' | 'child' | null;
}

/** Presentation-ready fields for a single leg (outbound or return) of the e-ticket card. */
export interface TicketLeg {
  travelDate: string;
  travelTime: string;
  route: string;
  origin: string;
  destination: string;
  vehicleType: string;
  vehiclePlate: string;
  /** This leg's own seat list (per-leg, unlike the shared `passengers` names). */
  seats: string;
  /** Rounded pickup→dropoff estimate (km) for this leg, OBRS-138-style — `null` hides the chip. */
  distanceKm: number | null;
  /** OBRS-269: this leg's pickup-stop coordinates, carried through from
   *  `BookingTicketStop.latitude`/`longitude` (`journeyToLeg`). `null` when the
   *  stop has no coordinates (e.g. an older ticket) — the card hides its
   *  "Navigate to pickup" button rather than disabling it. */
  pickupLatitude: number | null;
  pickupLongitude: number | null;
}

/** Presentation-ready fields for the shared e-ticket card. */
export interface ETicketCardData {
  bookingNumber: string;
  ticketNumber: string;
  /** Length 1 for a one-way booking, length 2 ([outbound, return]) for a round trip. */
  legs: TicketLeg[];
  passengers: TicketPassenger[];
  booker: TicketPassenger | null;
  paymentDate: string;
  totalAmount: string;
}
