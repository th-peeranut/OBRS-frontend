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
}
