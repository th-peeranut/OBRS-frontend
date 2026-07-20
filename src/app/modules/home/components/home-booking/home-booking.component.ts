import { Component, OnDestroy, OnInit } from '@angular/core';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';
import { FormBuilder, FormGroup } from '@angular/forms';
import dayjs from 'dayjs';
import { Router } from '@angular/router';
import { Appstate } from '../../../../shared/stores/appstate';
import { select, Store } from '@ngrx/store';
import { Observable, Subject, Subscription, take, takeUntil } from 'rxjs';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { ScheduleFilterPayload } from '../../../../shared/interfaces/schedule.interface';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import { BookingPolicyService } from '../../../../services/booking-policy/booking-policy.service';

// OBRS-564: date-picker cap fallback, used only until the real public
// booking-policy config resolves (see ngOnInit below). A briefly-wrong value
// here is a date-picker AFFORDANCE, not a binding policy statement to a
// customer (contrast business-policy.component.ts, where the same numbers
// are a *statement* and MUST NOT render until the real value is known) — the
// server re-validates the actual cap on submit regardless.
const HOME_BOOKING_MAX_ADVANCE_DAYS_FALLBACK = 30;

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
      nameThai: 'ไป-กลับ',
      nameEnglish: 'Round-trip',
    },
  ];

  minDate: Date;
  // maxDate is UX, not enforcement: we are DISPLAYING a value the server
  // sent, not re-implementing a server predicate client-side (the latter is
  // how a FE and BE end up green over contradictory rules and ship a dead
  // screen — see CORE.md). Seeded synchronously with the fallback above so
  // the calendar has a sane cap before the network resolves, then corrected
  // in ngOnInit once the real config lands. Bound at BOTH the departure
  // (home-booking.component.html) AND return calendars — binding only
  // departure would let the user pick a return date past the cap and then
  // eat a 400 from the server's own validation.
  maxDate: Date;
  calendarLocale: string;

  bookingForm: FormGroup;

  rawProvinceStationList: Observable<StationApi[]>;
  allProvinceStationList: StationApi[] = [];
  startProvinceStationList: StationApi[] = [];
  endProvinceStationList: StationApi[] = [];

  private destroy$ = new Subject<void>();

  roundTripOnChange$: Subscription;

  isRoundTripReturn: boolean = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private store: Store,
    private appStore: Store<Appstate>,
    private bookingPolicyService: BookingPolicyService
  ) {
    this.minDate = new Date();
    this.maxDate = dayjs(this.minDate)
      .add(HOME_BOOKING_MAX_ADVANCE_DAYS_FALLBACK, 'day')
      .toDate();

    this.rawProvinceStationList = this.store.pipe(
      select(selectProvinceWithStation)
    );

    this.createForm();
  }

  ngOnInit() {
    this.rawProvinceStationList.pipe(takeUntil(this.destroy$)).subscribe((stationList) => {
      this.allProvinceStationList = stationList || [];
      this.syncStationOptions();
    });

    // OBRS-564: correct the fallback above once the real, owner-editable cap
    // resolves. A failed fetch just keeps the fallback — the server is the
    // real gate on submit either way, so there's nothing to retry here.
    this.bookingPolicyService
      .getBookingPolicy()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.data) {
            this.maxDate = dayjs(this.minDate).add(response.data.maxAdvanceDays, 'day').toDate();
          }
        },
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
      // Default to 1 adult so a fresh search is immediately valid; the user can
      // still adjust via the passenger dropdown. Types/casing match
      // DropdownObrsPassengerComponent ('ADULT'/'KIDS') and getPayload().
      passengerInfo: [
        [
          { type: 'ADULT', count: 1 },
          { type: 'KIDS', count: 0 },
        ],
      ],

      startStationId: [''],
      stopStationId: [''],
      departureDate: [this.minDate],

      returnDate: [this.minDate],
    });

    this.roundTripOnChange$ = this.bookingForm.controls[
      'roundTrip'
    ].valueChanges.subscribe((value) => {
      this.isRoundTripReturn = value?.id === 2;
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
      bookingType: roundTripId === 1 ? 'One way' : 'Return',
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
