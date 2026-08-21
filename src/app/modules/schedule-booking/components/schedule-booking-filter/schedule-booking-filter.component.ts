import {
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  Signal,
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
import { canSwapStationPair } from '../../../../shared/lib/station-swap';

import { select, Store } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeGetScheduleListApi } from '../../../../shared/stores/schedule-list/schedule-list.action';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import { invokeSetScheduleBookingApi } from '../../../../shared/stores/schedule-booking/schedule-booking.action';
import {
  BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK,
  BookingPolicyService,
} from '../../../../services/booking-policy/booking-policy.service';
import { LanguageService } from '../../../../shared/services/language.service';
import { carryReturnDate, defaultReturnDate } from '../../../../shared/lib/return-date';

@Component({
    selector: 'app-schedule-booking-filter',
    templateUrl: './schedule-booking-filter.component.html',
    styleUrl: './schedule-booking-filter.component.scss',
    standalone: false
})
export class ScheduleBookingFilterComponent implements OnInit, OnDestroy {
  @Output() filterData = new EventEmitter<ScheduleFilter>();

  // OBRS-1025: passed to `app-trip-type-toggle` as `[options]` — same array
  // shape `app-dropdown-obrs` read, only the renderer changed.
  // OBRS-1185: `isDefault` moved to id 2 (round-trip) — one of three places
  // that must move together, see `createForm()`.
  roundTripDropdowns: Dropdown[] = [
    {
      id: 1,
      nameThai: 'เที่ยวเดียว',
      nameEnglish: 'One-way',
    },
    {
      id: 2,
      nameThai: 'ไป-กลับ',
      nameEnglish: 'Round-trip',
      isDefault: true,
    },
  ];

  minDate: Date;
  // OBRS-698: the advance-sale cap, DISPLAYED from the value the server sent —
  // never a client-side re-implementation of the server's predicate (that is
  // how a FE and a BE go green over contradictory rules). OBRS-564 bound this
  // on the home page only, so a customer could pass the capped calendar there
  // and then edit the date past the cap on this screen, landing on an empty
  // result list with nothing saying why. Seeded synchronously with the shared
  // fallback so the calendar has a sane cap before the network resolves, then
  // corrected in ngOnInit. Bound to BOTH the departure AND return calendars —
  // binding only departure leaves the same hole one field to the right.
  maxDate: Date;
  /** OBRS-1023: the `dateFormat` both calendars bind to — see the twin field on
   *  HomeBookingComponent. Same derivation, same source, deliberately not a
   *  second copy of the rule: this screen and the home form are the two places
   *  a customer picks a travel date, and a format that agreed on one and not
   *  the other would be worse than the hardcode it replaces. */
  readonly calendarDateFormat: Signal<string | undefined>;

  bookingForm: FormGroup;

  rawProvinceStationList: Observable<StationApi[]>;
  allProvinceStationList: StationApi[] = [];

  startProvinceStationList: StationApi[] = [];
  endProvinceStationList: StationApi[] = [];

  scheduleFilter: Observable<ScheduleFilter>;

  private destroy$ = new Subject<void>();

  roundTripOnChange$: Subscription;

  /** OBRS-1185 AC#4: re-derives `returnDate` whenever `departureDate` moves
   *  past it. See `createForm()`. */
  departureDateOnChange$: Subscription;

  // OBRS-1185: literal default flipped to round-trip, matching `createForm()`'s
  // `roundTrip: [2]` seed — see the identical note in home-booking.component.ts.
  isRoundTripReturn: boolean = true;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private store: Store,
    private appStore: Store<Appstate>,
    private translate: TranslateService,
    private alertService: AlertService,
    private bookingPolicyService: BookingPolicyService,
    languageService: LanguageService
  ) {
    this.minDate = new Date();
    this.maxDate = dayjs(this.minDate)
      .add(BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK, 'day')
      .toDate();
    this.calendarDateFormat = languageService.calendarDateFormat;

    this.rawProvinceStationList = this.store.pipe(
      select(selectProvinceWithStation)
    );
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));

    this.createForm();
  }

  ngOnInit() {
    // OBRS-698: correct the fallback above once the real, owner-editable cap
    // resolves (owner edits it at /admin/settings/booking-policy, OBRS-564 —
    // moved under the tabbed settings page by OBRS-702).
    // A failed fetch just keeps the fallback — the server is the real gate on
    // submit either way, so there is nothing to retry here. The explicit
    // no-op error callback is required, not stylistic: an observer without
    // one lets the interceptor's rethrow surface as an RxJS unhandled error.
    this.bookingPolicyService
      .getBookingPolicy()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.data) {
            this.maxDate = dayjs(this.minDate)
              .add(response.data.maxAdvanceDays, 'day')
              .toDate();
          }
        },
        error: () => undefined,
      });

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

        // OBRS-1185: same `?? 2` fallback as the `roundTrip` patch below —
        // reading this as `roundTripId === 2` would silently default to
        // ONE-WAY (`undefined === 2` is false) the moment there is no saved
        // filter, e.g. a direct visit to this route with nothing restored
        // from cross-tab storage (`initialState` in schedule-filter.reducer.ts
        // is `null` in that case). The two reads must agree, or this flag and
        // the form control it mirrors disagree in the very first frame.
        this.isRoundTripReturn = (roundTripId ?? 2) === 2;

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

        // OBRS-1185: default derived FROM departureDate (never a bare
        // `minDate`/today — that was the bug: a saved filter with no
        // returnDate, or a stale one from before departureDate got clamped
        // above, could render "today for both" or even a return BEFORE the
        // departure it was just clamped against). Same rule as
        // `createForm()`'s literal seed, applied here for the store-driven
        // path — see `shared/lib/return-date.ts`.
        let returnDate = scheduleFilter?.returnDate
          ? new Date(scheduleFilter?.returnDate)
          : defaultReturnDate(departureDate, this.maxDate);

        if (returnDate < departureDate) {
          returnDate = defaultReturnDate(departureDate, this.maxDate);
        }

        this.bookingForm.patchValue({
          // OBRS-1185: fallback flipped to round-trip (id 2) — one of three
          // places that must move together, see `createForm()`'s own note.
          roundTrip: roundTripId ?? 2,
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
    this.departureDateOnChange$?.unsubscribe();
  }

  createForm() {
    this.bookingForm = this.fb.group({
      // OBRS-1185: default flipped to round-trip (id 2) — see the identical
      // note in home-booking.component.ts's createForm(); this screen's own
      // `scheduleFilter` store subscription above carries the matching `?? 2`
      // fallback for when there is nothing saved to restore.
      roundTrip: [2],
      passengerInfo: [null],

      startStationId: [''],
      stopStationId: [''],
      departureDate: [this.minDate],

      startReturnStationId: [''],
      stopReturnStationId: [''],
      // OBRS-1185: derived FROM departureDate, capped at maxDate — see the
      // identical note in home-booking.component.ts and shared/lib/return-date.ts.
      returnDate: [defaultReturnDate(this.minDate, this.maxDate)],
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

      // OBRS-1501: the toggle used to move the FORM only. `scheduleFilter`
      // kept whatever trip type the last ค้นหา wrote, and every downstream
      // reader goes to the STORE, not to this form — so a customer who
      // switched to one-way here was still asked for a return leg
      // (`arrivalSchedules` is still in the list response), still checked out
      // as `bookingType: 'return'` (passenger-info.component.ts) and was still
      // priced and labelled round-trip on the summary. Writing the filter is
      // the whole fix: the `scheduleFilter` subscription in ngOnInit re-runs
      // the search off the new value behind its own `isSearchable()` guard.
      // Deliberately NOT `onSearch()` — that warns SEARCH_VALIDATION at a
      // customer who never pressed a search button — and deliberately not a
      // second `invokeGetScheduleListApi` here, which would search twice.
      this.store.dispatch(
        invokeSetScheduleFilterApi({
          schedule_filter: this.bookingForm.getRawValue(),
        })
      );
    });

    // OBRS-1185 AC#4: moving departureDate past returnDate must carry
    // returnDate forward with it — same rule and same `emitEvent: false`
    // reasoning as home-booking.component.ts's twin subscription. The
    // scheduleFilter store subscription above already computes the correct
    // pair for its OWN (store-driven, `emitEvent:false`) writes, so this only
    // fires for a departureDate the user changes by hand on this screen.
    this.departureDateOnChange$ = this.bookingForm.controls[
      'departureDate'
    ].valueChanges.subscribe((date: Date) => {
      const currentReturn = this.getFormValue('returnDate');
      const carried = carryReturnDate(date, currentReturn, this.maxDate);
      if (carried !== currentReturn) {
        this.bookingForm.patchValue({ returnDate: carried }, { emitEvent: false });
      }
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

  /** OBRS-1035 AC#7 — see `canSwapStationPair()`. */
  get canSwapStations(): boolean {
    return canSwapStationPair(
      this.getFormValue('startStationId'),
      this.getFormValue('stopStationId')
    );
  }

  /**
   * OBRS-1035: swap origin ⇄ destination — same shape as
   * `home-booking.component.ts`, one `patchValue` then one option-sync against
   * the final pair.
   *
   * AC#6 matters most here: this bar sits above a rendered result list, and
   * firing `invokeGetScheduleListApi` on swap would replace what the customer is
   * reading. Nothing in this method dispatches; the existing Search button is
   * still the only trigger.
   */
  onSwapStations(): void {
    if (!this.canSwapStations) return;

    const previousStart = this.getFormValue('startStationId');
    const previousStop = this.getFormValue('stopStationId');

    this.bookingForm.patchValue({
      startStationId: previousStop,
      stopStationId: previousStart,
    });

    this.syncStationOptions(previousStop, previousStart);
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
