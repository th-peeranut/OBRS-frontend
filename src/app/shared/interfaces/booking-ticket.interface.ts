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
  journeys?: BookingTicketJourney[];
}
