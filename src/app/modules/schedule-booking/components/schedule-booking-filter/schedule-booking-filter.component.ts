import { Component } from '@angular/core';
import { FormGroup, FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import dayjs from 'dayjs';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';

@Component({
  selector: 'app-schedule-booking-filter',
  templateUrl: './schedule-booking-filter.component.html',
  styleUrl: './schedule-booking-filter.component.scss',
})
export class ScheduleBookingFilterComponent {
  roundTripDropdowns: Dropdown[] = [
    {
      id: 1,
      nameThai: 'เที่ยวเดียว',
      nameEnglish: 'One-way',
      isDefault: true,
    },
    {
      id: 2,
      nameThai: 'เที่ยวไป-กลับ',
      nameEnglish: 'Round-trip',
    },
  ];

  minDate: Date;
  calendarLocale: string;

  bookingForm: FormGroup;

  constructor(private fb: FormBuilder, private router: Router) {
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
    const payload = this.getPayload();
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
