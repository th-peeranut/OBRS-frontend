/** A single passenger row rendered on the e-ticket card. */
export interface TicketPassenger {
  name: string;
  phone: string;
  seat: string;
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
