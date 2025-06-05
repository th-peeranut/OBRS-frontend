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
import { Station } from '../../../../shared/interfaces/station.interface';

import { select, Store } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { selectStation } from '../../../../shared/stores/station/station.selector';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeGetScheduleListApi } from '../../../../shared/stores/schedule-list/schedule-list.action';

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

  getFormValue(controlName: string) {
    return this.bookingForm.get(controlName)?.value;
  }
}
