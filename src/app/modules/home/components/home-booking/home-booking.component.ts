import { Component } from '@angular/core';
import { Dropdown } from '../../../../interfaces/dropdown.interface';
import { FormBuilder, FormGroup } from '@angular/forms';

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

  bookingForm: FormGroup;

  constructor(private fb: FormBuilder) {
    this.minDate = new Date();

    this.createForm();
  }

  createForm() {
    this.bookingForm = this.fb.group({
      roundTrip: [2],
      passengerInfo: [null],
      startStation: [''],
      endStation: [''],
      departureDate: [this.minDate],
    });
  }

  onSearch() {
    console.log(this.bookingForm.value);
  }
}
