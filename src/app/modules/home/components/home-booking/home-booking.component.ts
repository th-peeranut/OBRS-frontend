import { Component, OnDestroy, OnInit } from '@angular/core';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';
import { FormBuilder, FormGroup } from '@angular/forms';
import dayjs from 'dayjs';
import { Router } from '@angular/router';

import { Station } from '../../../../shared/interfaces/station.interface';
import { Appstate } from '../../../../shared/stores/appstate';
import { select, Store } from '@ngrx/store';
import { map, Observable, Subject, take, takeUntil } from 'rxjs';
import { selectStation } from '../../../../shared/stores/station/station.selector';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { ScheduleFilterPayload } from '../../../../shared/interfaces/schedule.interface';
import { invokeGetScheduleListApi } from '../../../../shared/stores/schedule-list/schedule-list.action';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';

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

  rawStationList: Observable<Station[]>;
  startStationList: Station[] = [];
  endStationList: Station[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private store: Store,
    private appStore: Store<Appstate>
  ) {
    this.minDate = new Date();

    this.rawStationList = this.store.pipe(select(selectStation));

    this.createForm();
  }

  ngOnInit() {
    this.rawStationList
      .pipe(
        map((stations: Station[]) => stations),
        takeUntil(this.destroy$)
      )
      .subscribe((filteredStations) => {
        this.startStationList = filteredStations;
        this.endStationList = filteredStations;
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
      departureRouteId: formValue.startStation || null,
      numberOfPassengers: formValue.adultCount + formValue.kidsCount,

      // returnDate: formValue.departureDate
      //   ? dayjs(formValue.departureDate).format('YYYY-MM-DD')
      //   : '',
      returnDate: '',

      returnRouteId: formValue.endStation || null,
    };

    return payload;
  }

  onStartStationChange(station: Station) {
    this.bookingForm.patchValue({
      startStation: station.id,
    });

    this.rawStationList
      .pipe(
        map((stations: Station[]) =>
          stations.filter((item) => item.id !== station.id)
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((filteredStations) => {
        this.endStationList = filteredStations;
      });
  }

  onEndStationChange(station: Station) {
    this.bookingForm.patchValue({
      endStation: station.id,
    });

    this.rawStationList
      .pipe(
        map((stations: Station[]) =>
          stations.filter((item) => item.id !== station.id)
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((filteredStations) => {
        this.startStationList = filteredStations;
      });
  }
}
