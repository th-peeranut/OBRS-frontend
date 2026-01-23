import { Component } from '@angular/core';

interface TicketPassenger {
  name: string;
  phone: string;
  seat: string;
}

@Component({
  selector: 'app-e-ticket',
  templateUrl: './e-ticket.component.html',
  styleUrl: './e-ticket.component.scss',
})
export class ETicketComponent {
  bookingReference = 'THYGRB159352';
  ticketNumber = '20241210-011';
  travelDate = '10 Dec 2024';
  travelTime = '07:00 - 08:05';
  route = 'Nong Chak - Ban Bueng - Bangkok';
  origin = 'Nong Chak';
  destination = 'BTS Mochit';
  vehicleType = 'Van';
  vehiclePlate = 'KT 1234';
  seats = 'A4, A3';
  passengerSummary = 'Adult 1, Child 1';
  paymentDate = '09/12/2024 21:00';
  totalAmount = '300.00';

  passengers: TicketPassenger[] = [
    {
      name: 'Somchai Wong',
      phone: '061-233-5433',
      seat: 'A4',
    },
    {
      name: 'Suda Wong',
      phone: '-',
      seat: 'A3',
    },
  ];
}
