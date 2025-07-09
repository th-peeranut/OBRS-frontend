import { Component, OnDestroy, OnInit } from '@angular/core';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';
import { FormBuilder, FormGroup } from '@angular/forms';
import dayjs from 'dayjs';
import { Router } from '@angular/router';

import { Station } from '../../../../shared/interfaces/station.interface';
import { Appstate } from '../../../../shared/stores/appstate';
import { select, Store } from '@ngrx/store';
import { map, Observable, Subject, take, takeUntil } from 'rxjs';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { ScheduleFilterPayload } from '../../../../shared/interfaces/schedule.interface';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';
import { ProvinceStation } from '../../../../shared/interfaces/province.interface';
import { selectProvinceWithStation } from '../../../../shared/stores/province/province.selector';

@Component({
  selector: 'app-home-booking',
  templateUrl: './home-booking.component.html',
  styleUrl: './home-booking.component.scss',
})
export class HomeBookingComponent implements OnInit, OnDestroy {
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

  rawProvinceStationList: Observable<ProvinceStation[]>;
  startProvinceStationList: ProvinceStation[] = [];
  endProvinceStationList: ProvinceStation[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private store: Store,
    private appStore: Store<Appstate>
  ) {
    this.minDate = new Date();

    this.rawProvinceStationList = this.store.pipe(
      select(selectProvinceWithStation)
    );

    this.createForm();
  }

  ngOnInit() {
    this.rawProvinceStationList
      .pipe(takeUntil(this.destroy$))
      .subscribe((provinceList) => {
        this.startProvinceStationList = provinceList;
        this.endProvinceStationList = provinceList;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  createForm() {
    this.bookingForm = this.fb.group({
      roundTrip: [1],
      passengerInfo: [null],
      startStation: [''],
      endStation: [''],
      departureDate: [this.minDate],
    });
  }

  onSearch() {
    const formValue = { ...this.bookingForm.getRawValue() };

    this.store.dispatch(
      invokeSetScheduleFilterApi({
        schedule_filter: formValue,
      })
    );

    this.store.pipe(select(selectScheduleList), take(1)).subscribe(() => {
      this.router.navigate(['/schedule-booking']);
    });
  }

  getPayload() {
    const formValue = { ...this.bookingForm.getRawValue() };

    // Set passenger counts
    const getPassengerCount = (type: string) =>
      formValue.passengerInfo?.find((item: any) => item.type === type)?.count ||
      0;

    formValue.adultCount = getPassengerCount('ADULT');
    formValue.kidsCount = getPassengerCount('KIDS');

    let payload: ScheduleFilterPayload = {
      bookingType: formValue.roundTrip === 1 ? 'One way' : 'Return',

      departureDate: formValue.departureDate
        ? dayjs(formValue.departureDate).format('YYYY-MM-DD')
        : '',

      returnDate: formValue.departureDate
        ? dayjs(formValue.departureDate).format('YYYY-MM-DD')
        : '',

      numberOfPassengers: formValue.adultCount + formValue.kidsCount,

      startStationId: formValue.startStation || null,
      stopStationId: formValue.endStation || null,

      departureRouteId: null,
      returnRouteId: null,
    };

    return payload;
  }

  onStartStationChange(station: Station) {
    this.bookingForm.patchValue({
      startStation: station.id,
    });

    this.rawProvinceStationList
      .pipe(
        map((provinces) =>
          provinces.map((province) => ({
            ...province,
            stations: province.stations.filter((s) => s.id !== station.id),
          }))
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((filtered) => {
        this.endProvinceStationList = filtered;
      });
  }

  onEndStationChange(station: Station) {
    this.bookingForm.patchValue({
      endStation: station.id,
    });

    this.rawProvinceStationList
      .pipe(
        map((provinces) =>
          provinces.map((province) => ({
            ...province,
            stations: province.stations.filter((s) => s.id !== station.id),
          }))
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((filtered) => {
        this.startProvinceStationList = filtered;
      });
  }
}
