import {
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { FormGroup, FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import dayjs from 'dayjs';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';
import { map, Observable, Subject, takeUntil } from 'rxjs';
import {
  ScheduleFilter,
  ScheduleFilterPayload,
} from '../../../../shared/interfaces/schedule.interface';

import { select, Store } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeGetScheduleListApi } from '../../../../shared/stores/schedule-list/schedule-list.action';
import { ProvinceStation } from '../../../../shared/interfaces/province.interface';
import { Station } from '../../../../shared/interfaces/station.interface';
import { selectProvinceWithStation } from '../../../../shared/stores/province/province.selector';

@Component({
  selector: 'app-schedule-booking-filter',
  templateUrl: './schedule-booking-filter.component.html',
  styleUrl: './schedule-booking-filter.component.scss',
})
export class ScheduleBookingFilterComponent implements OnInit, OnDestroy {
  @Output() filterData = new EventEmitter<ScheduleFilter>();

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
  scheduleFilter: Observable<ScheduleFilter>;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private store: Store,
    private appStore: Store<Appstate>
  ) {
    this.minDate = new Date();

    this.rawProvinceStationList = this.store.pipe(select(selectProvinceWithStation));
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));

    this.createForm();
  }

  ngOnInit() {
    this.rawProvinceStationList
      .pipe(takeUntil(this.destroy$))
      .subscribe((provinceList) => {
        this.startProvinceStationList = provinceList;
        this.endProvinceStationList = provinceList;
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

        this.bookingForm.patchValue({
          roundTrip: scheduleFilter?.roundTrip?.id ?? 1,
          passengerInfo: passengerInfo,
          startStation: scheduleFilter?.startStation ?? '',
          endStation: scheduleFilter?.endStation ?? '',
          departureDate: departureDate,
        });

        if (scheduleFilter) {
          this.store.dispatch(
            invokeGetScheduleListApi({
              schedule_filter: this.getPayload(),
            })
          );
        }
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

    this.store.dispatch(
      invokeGetScheduleListApi({
        schedule_filter: this.getPayload(),
      })
    );
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

      startStationId: formValue.startStation,
      stopStationId: formValue.endStation,

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

  getFormValue(controlName: string) {
    return this.bookingForm.get(controlName)?.value;
  }
}
