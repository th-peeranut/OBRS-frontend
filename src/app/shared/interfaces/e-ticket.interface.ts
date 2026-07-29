/** A single passenger row rendered on the e-ticket card. */
export interface TicketPassenger {
  name: string;
  phone: string;
  seat: string;
  /** OBRS-866: the ticket this row actually boards with. The card fetches
   *  `GET /tickets/{id}/boarding-token` per row and renders THAT as the QR —
   *  a boarding QR is per-TICKET, never per-booking, and never the
   *  human-readable `ticketNumber` (which the boarding endpoint rejects with
   *  `INVALID_TICKET_TOKEN`). `null` for a row with no ticket of its own
   *  (the booker row), which renders no QR at all. */
  ticketId: number | null;
  /** This ticket's own human-readable number, shown under its QR so a
   *  multi-passenger booking's QRs can be told apart. */
  ticketNumber: string;
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
  /** OBRS-325: true when every ticket on this leg has a null `seatNumber` (an
   *  open-seating schedule, `schedules.seating_mode = OPEN`, OBRS-321). The
   *  card renders the open-seating label instead of `seats` — `seats` itself
   *  stays `'-'` in that case (see `buildSeatList`), same as the pre-existing
   *  "no data" placeholder, so this flag is what actually distinguishes the
   *  two. `false` for a leg with no tickets at all (the empty-journey
   *  placeholder leg), not just for an assigned seat. */
  isOpenSeating: boolean;
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
