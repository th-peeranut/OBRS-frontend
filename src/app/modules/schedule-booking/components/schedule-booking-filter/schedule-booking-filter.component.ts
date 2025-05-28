import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormGroup, FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import dayjs from 'dayjs';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';
import { map, Observable, Subject, takeUntil } from 'rxjs';
import { ScheduleFilter } from '../../../../shared/interfaces/schedule.interface';
import { Station } from '../../../../shared/interfaces/station.interface';

import { select, Store } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { selectStation } from '../../../../shared/stores/station/station.selector';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';

@Component({
  selector: 'app-schedule-booking-filter',
  templateUrl: './schedule-booking-filter.component.html',
  styleUrl: './schedule-booking-filter.component.scss',
})
export class ScheduleBookingFilterComponent implements OnInit, OnDestroy {
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
  scheduleFilter: Observable<ScheduleFilter>;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private store: Store,
    private appStore: Store<Appstate>
  ) {
    this.minDate = new Date();
    console.log('minDate', this.minDate);

    this.rawStationList = this.store.pipe(select(selectStation));
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));

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

    this.scheduleFilter
      .pipe(
        map((scheduleFilter: ScheduleFilter) => scheduleFilter),
        takeUntil(this.destroy$)
      )
      .subscribe((scheduleFilter) => {
        let passengerInfo = scheduleFilter?.passengerInfo || [
          { type: 'ADULT', count: 0 },
          { type: 'KIDS', count: 0 },
        ];

        let departureDate = scheduleFilter?.departureDate
          ? new Date(scheduleFilter?.departureDate)
          : this.minDate;

        if (departureDate < this.minDate) {
          departureDate = this.minDate;
        }

        console.log('departureDate', departureDate);

        this.bookingForm.patchValue({
          roundTrip: scheduleFilter?.roundTrip?.id ?? 2,
          passengerInfo: passengerInfo,
          startStation: scheduleFilter?.startStation ?? '',
          endStation: scheduleFilter?.endStation ?? '',
          departureDate: departureDate,
        });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
    const formValue = { ...this.bookingForm.getRawValue() };

    this.store.dispatch(
      invokeSetScheduleFilterApi({
        schedule_filter: formValue,
      })
    );

    // call api
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

  getFormValue(controlName: string) {
    return this.bookingForm.get(controlName)?.value;
  }
}
