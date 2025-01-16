import { Component } from '@angular/core';
import { Dropdown } from '../../../../interfaces/dropdown.interface';
import { FormBuilder, FormGroup } from '@angular/forms';
import dayjs from 'dayjs';

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
    console.log(this.getPayload());
  }

  getPayload() {
    const formValue = { ...this.bookingForm.getRawValue() };

    // Format departure date
    formValue.departureDate = dayjs(formValue.departureDate).format(
      'YYYY-MM-DD'
    );

    // Set passenger counts
    const getPassengerCount = (type: string) =>
      formValue.passengerInfo?.find((item: any) => item.type === type)?.count ||
      0;

    formValue.adultCount = getPassengerCount('ADULT');
    formValue.kidsCount = getPassengerCount('KIDS');

    const { passengerInfo, ...payload } = formValue;

    return payload;
  }
}
