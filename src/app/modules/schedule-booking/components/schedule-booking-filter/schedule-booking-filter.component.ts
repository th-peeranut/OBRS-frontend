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
import { map, Observable, Subject, Subscription, takeUntil } from 'rxjs';
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
      nameThai: 'ไป-กลับ',
      nameEnglish: 'Round-trip',
    },
  ];

  minDate: Date;
  calendarLocale: string;

  bookingForm: FormGroup;

  rawProvinceStationList: Observable<ProvinceStation[]>;

  startProvinceStationList: ProvinceStation[] = [];
  endProvinceStationList: ProvinceStation[] = [];

  startReturnProvinceStationList: ProvinceStation[] = [];
  endReturnProvinceStationList: ProvinceStation[] = [];

  scheduleFilter: Observable<ScheduleFilter>;

  private destroy$ = new Subject<void>();

  roundTripOnChange$: Subscription;

  isRoundTripReturn: boolean = false;

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
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));

    this.createForm();
  }

  ngOnInit() {
    this.rawProvinceStationList
      .pipe(takeUntil(this.destroy$))
      .subscribe((provinceList) => {
        // ขาไป
        this.startProvinceStationList = provinceList;
        this.endProvinceStationList = provinceList;

        // ขากลับ
        this.startReturnProvinceStationList = provinceList;
        this.endReturnProvinceStationList = provinceList;
      });

    this.scheduleFilter
      .pipe(
        map((scheduleFilter: ScheduleFilter) => scheduleFilter),
        takeUntil(this.destroy$)
      )
      .subscribe((scheduleFilter) => {
        this.isRoundTripReturn = scheduleFilter?.roundTrip?.id === 2;

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

        let returnDate = scheduleFilter?.returnDate
          ? new Date(scheduleFilter?.returnDate)
          : this.minDate;

        if (returnDate < this.minDate) {
          returnDate = this.minDate;
        }

        this.bookingForm.patchValue({
          roundTrip: scheduleFilter?.roundTrip?.id ?? 1,
          passengerInfo: passengerInfo,

          // ขาไป
          startStationId: scheduleFilter?.startStationId ?? '',
          stopStationId: scheduleFilter?.stopStationId ?? '',
          departureDate: departureDate,

          // ขากลับ
          startReturnStationId: scheduleFilter?.startReturnStationId ?? '',
          stopReturnStationId: scheduleFilter?.stopReturnStationId ?? '',
          returnDate: returnDate,
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

      // ขาไป
      startStationId: [''],
      stopStationId: [''],
      departureDate: [this.minDate],

      // ขากลับ
      startReturnStationId: [''],
      stopReturnStationId: [''],
      returnDate: [this.minDate],
    });

    this.roundTripOnChange$ = this.bookingForm.controls[
      'roundTrip'
    ].valueChanges.subscribe((value) => {
      const roundTripId = typeof value === 'object' ? value?.id : value;
      this.isRoundTripReturn = roundTripId === 2;
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

      numberOfPassengers: formValue.adultCount + formValue.kidsCount,

      // ขาไป
      startStationId: formValue.startStationId || null,
      stopStationId: formValue.stopStationId || null,
      departureDate: formValue.departureDate
        ? dayjs(formValue.departureDate).format('YYYY-MM-DD')
        : '',

      // ขากลับ
      startReturnStationId: formValue.startReturnStationId || null,
      stopReturnStationId: formValue.stopReturnStationId || null,
      returnDate: formValue.departureDate
        ? dayjs(formValue.departureDate).format('YYYY-MM-DD')
        : '',

      // unused in frontend
      departureRouteId: null,
      returnRouteId: null,
    };

    return payload;
  }

  onStartStationChange(station: Station) {
    this.bookingForm.patchValue({
      startStationId: station.id,
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
      stopStationId: station.id,
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

  onStartReturnStationChange(station: Station) {
    this.bookingForm.patchValue({
      startReturnStationId: station.id,
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
        this.endReturnProvinceStationList = filtered;
      });
  }

  onEndReturnStationChange(station: Station) {
    this.bookingForm.patchValue({
      stopReturnStationId: station.id,
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
        this.startReturnProvinceStationList = filtered;
      });
  }

  getFormValue(controlName: string) {
    return this.bookingForm.get(controlName)?.value;
  }

  getIsRoundTripReturn() {
    return this.isRoundTripReturn;
  }
}
