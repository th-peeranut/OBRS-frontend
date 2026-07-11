/** A single passenger row rendered on the e-ticket card. */
export interface TicketPassenger {
  name: string;
  phone: string;
  seat: string;
}

/** Presentation-ready fields for the shared e-ticket card. */
export interface ETicketCardData {
  bookingNumber: string;
  ticketNumber: string;
  travelDate: string;
  travelTime: string;
  route: string;
  origin: string;
  destination: string;
  vehicleType: string;
  vehiclePlate: string;
  seats: string;
  passengers: TicketPassenger[];
  booker: TicketPassenger | null;
  paymentDate: string;
  totalAmount: string;
  /** Rounded pickup→dropoff estimate (km), OBRS-138-style — `null` hides the chip. */
  estimateDistanceKm: number | null;
  /** Same estimate for the return leg of a round-trip booking; `null` when there is no return leg. */
  returnEstimateDistanceKm: number | null;
}
