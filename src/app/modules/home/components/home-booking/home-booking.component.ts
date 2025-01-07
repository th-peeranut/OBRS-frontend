import { Component } from '@angular/core';
import { Dropdown } from '../../../../interfaces/dropdown.interface';

@Component({
  selector: 'app-home-booking',
  templateUrl: './home-booking.component.html',
  styleUrl: './home-booking.component.scss',
})
export class HomeBookingComponent {
  roundTripDropdowns: Dropdown[] = [
    {
      id: 1,
      value: 'HOME.HOME_BOOKING.ROUNDTRIP_1',
      isDefault: true,
    },
    {
      id: 2,
      value: 'HOME.HOME_BOOKING.ROUNDTRIP_2',
    },
  ];

  minDate: Date;
  calendarLocale: string;

  constructor() {
    this.minDate = new Date();
  }
}
