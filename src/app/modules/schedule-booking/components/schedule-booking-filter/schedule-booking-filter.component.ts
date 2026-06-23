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
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../../../shared/services/alert.service';

import { select, Store } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeGetScheduleListApi } from '../../../../shared/stores/schedule-list/schedule-list.action';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import { invokeSetScheduleBookingApi } from '../../../../shared/stores/schedule-booking/schedule-booking.action';

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

  rawProvinceStationList: Observable<StationApi[]>;
  allProvinceStationList: StationApi[] = [];

  startProvinceStationList: StationApi[] = [];
  endProvinceStationList: StationApi[] = [];

  scheduleFilter: Observable<ScheduleFilter>;

  private destroy$ = new Subject<void>();

  roundTripOnChange$: Subscription;

  isRoundTripReturn: boolean = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private store: Store,
    private appStore: Store<Appstate>,
    private translate: TranslateService,
    private alertService: AlertService
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
      .subscribe((stationList) => {
        this.allProvinceStationList = stationList || [];
        this.syncStationOptions();
      });

    this.scheduleFilter
      .pipe(
        map((scheduleFilter: ScheduleFilter) => scheduleFilter),
        takeUntil(this.destroy$)
      )
      .subscribe((scheduleFilter) => {
        const roundTripId = scheduleFilter?.roundTrip?.id
          ? scheduleFilter?.roundTrip?.id
          : scheduleFilter?.roundTrip;

        this.isRoundTripReturn = roundTripId === 2;

        const passengerInfo = Array.isArray(scheduleFilter?.passengerInfo)
          ? scheduleFilter.passengerInfo
          : [
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
          roundTrip: roundTripId ?? 1,
          passengerInfo,

          startStationId: scheduleFilter?.startStationId ?? '',
          stopStationId: scheduleFilter?.stopStationId ?? '',
          departureDate,

          returnDate,
        }, { emitEvent: false });
        this.syncStationOptions();

        if (scheduleFilter) {
          const payload = this.getPayload();
          // Only auto-search when the saved filter is complete; otherwise the
          // backend would reject it and surface a generic "validation failed"
          // modal on page load (e.g. arriving from an incomplete home search).
          if (this.isSearchable(payload)) {
            this.store.dispatch(
              invokeGetScheduleListApi({
                schedule_filter: payload,
              })
            );
          }
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    this.roundTripOnChange$?.unsubscribe();
  }

  createForm() {
    this.bookingForm = this.fb.group({
      roundTrip: [1],
      passengerInfo: [null],

      startStationId: [''],
      stopStationId: [''],
      departureDate: [this.minDate],

      startReturnStationId: [''],
      stopReturnStationId: [''],
      returnDate: [this.minDate],
    });

    this.roundTripOnChange$ = this.bookingForm.controls[
      'roundTrip'
    ].valueChanges.subscribe((value) => {
      const roundTripId = typeof value === 'object' ? value?.id : value;
      this.isRoundTripReturn = roundTripId === 2;

      this.store.dispatch(
        invokeSetScheduleBookingApi({
          schedule_booking: {
            schedule: null,
          },
        })
      );
    });
  }

  onSearch() {
    const formValue = { ...this.bookingForm.getRawValue() };
    const payload = this.getPayload();

    // Guard the required fields client-side so the user gets a clear, localized
    // message instead of the backend's generic "validation failed" modal.
    if (!this.isSearchable(payload)) {
      this.alertService.warning(
        this.translate.instant('HOME.HOME_BOOKING.SEARCH_VALIDATION')
      );
      return;
    }

    this.store.dispatch(
      invokeSetScheduleFilterApi({
        schedule_filter: formValue,
      })
    );

    this.store.dispatch(
      invokeGetScheduleListApi({
        schedule_filter: payload,
      })
    );
  }

  // Mirrors the backend ScheduleSearchReqDto required fields: origin, destination
  // (@NotBlank) and at least one passenger (@Min(1)).
  private isSearchable(payload: ScheduleFilterPayload): boolean {
    return (
      !!payload.fromStop &&
      !!payload.toStop &&
      (payload.numberOfPassengers ?? 0) >= 1
    );
  }

  getPayload() {
    const formValue = { ...this.bookingForm.getRawValue() };

    const passengerInfo = Array.isArray(formValue.passengerInfo)
      ? formValue.passengerInfo
      : [];
    const getPassengerCount = (type: string) =>
      passengerInfo.find((item: any) => item.type === type)?.count || 0;

    formValue.adultCount = getPassengerCount('ADULT');
    formValue.kidsCount = getPassengerCount('KIDS');

    const roundTripId =
      typeof formValue.roundTrip === 'object' ? formValue.roundTrip?.id : formValue.roundTrip;

    const payload: ScheduleFilterPayload = {
      bookingType: roundTripId === 1 ? 'one_way' : 'return',
      numberOfPassengers: formValue.adultCount + formValue.kidsCount,
      fromStop: this.getStationCodeById(formValue.startStationId),
      toStop: this.getStationCodeById(formValue.stopStationId),
      departureDate: formValue.departureDate
        ? dayjs(formValue.departureDate).format('YYYY-MM-DD')
        : '',
      ...(roundTripId === 1
        ? {}
        : {
            returnDate: formValue.returnDate
              ? dayjs(formValue.returnDate).format('YYYY-MM-DD')
              : null,
          }),
    };

    return payload;
  }

  private getStationCodeById(stationId: string | number | null | undefined): string | null {
    if (stationId === null || stationId === undefined || stationId === '') {
      return null;
    }

    const id = Number(stationId);
    const match = this.allProvinceStationList.find((station) => station.id === id);
    return match?.slug || null;
  }

  onStartStationChange(station: StationApi) {
    this.bookingForm.patchValue({
      startStationId: station.id,
    });

    this.syncStationOptions(station.id, this.getFormValue('stopStationId'));
  }

  onEndStationChange(station: StationApi) {
    this.bookingForm.patchValue({
      stopStationId: station.id,
    });

    this.syncStationOptions(this.getFormValue('startStationId'), station.id);
  }

  getFormValue(controlName: string) {
    return this.bookingForm.get(controlName)?.value;
  }

  getIsRoundTripReturn() {
    return this.isRoundTripReturn;
  }

  private syncStationOptions(
    selectedStartId?: string | number | null,
    selectedStopId?: string | number | null
  ): void {
    const currentStartId =
      selectedStartId ?? this.bookingForm.get('startStationId')?.value;
    const currentStopId =
      selectedStopId ?? this.bookingForm.get('stopStationId')?.value;

    this.startProvinceStationList = this.allProvinceStationList.filter(
      (item) => item.id !== Number(currentStopId)
    );
    this.endProvinceStationList = this.allProvinceStationList.filter(
      (item) => item.id !== Number(currentStartId)
    );
  }
}
