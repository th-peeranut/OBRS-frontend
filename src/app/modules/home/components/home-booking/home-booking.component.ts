import { Component, OnInit } from '@angular/core';
import { Dropdown } from '../../../../interfaces/dropdown.interface';
import { FormBuilder, FormGroup } from '@angular/forms';
import dayjs from 'dayjs';
import { Router } from '@angular/router';
import { StationService } from '../../../../services/station/station.service';
import { Station } from '../../../../interfaces/station.interface';

@Component({
  selector: 'app-home-booking',
  templateUrl: './home-booking.component.html',
  styleUrl: './home-booking.component.scss',
})
export class HomeBookingComponent implements OnInit {
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

  rawStationList: Station[] = [];
  startStationList: Station[] = [];
  endStationList: Station[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private stationService: StationService
  ) {
    this.minDate = new Date();

    this.createForm();
  }

  async ngOnInit() {
    let resStation = await this.stationService.getAll();

    if (resStation?.code === 200) {
      this.rawStationList = resStation.data;

      this.startStationList = this.rawStationList;
      this.endStationList = this.rawStationList;
    } else {
      this.rawStationList = [];
    }
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
    this.router.navigate(['/schedule-booking']);
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

  onStartStationChange(station: Station) {
    this.bookingForm.patchValue({
      startStation: station.id,
    });

    this.endStationList = this.rawStationList.filter(
      (item) => item.id !== station.id
    );
  }

  onendStationChange(station: Station) {
    this.bookingForm.patchValue({
      endStation: station.id,
    });

    this.startStationList = this.rawStationList.filter(
      (item) => item.id !== station.id
    );
  }
}
