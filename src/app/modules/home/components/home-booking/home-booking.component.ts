import { Component, OnDestroy, OnInit } from '@angular/core';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';
import { FormBuilder, FormGroup } from '@angular/forms';
import dayjs from 'dayjs';
import { Router } from '@angular/router';
import { Appstate } from '../../../../shared/stores/appstate';
import { select, Store } from '@ngrx/store';
import { catchError, Observable, of, Subject, Subscription, take, takeUntil } from 'rxjs';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { ScheduleFilterPayload } from '../../../../shared/interfaces/schedule.interface';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import { AuthService } from '../../../../auth/auth.service';
import { BookingService } from '../../../../services/booking/booking.service';
import {
  deriveRecentRouteCandidates,
  extractRecentRoutePairsFromBookings,
  loadRecentRoutesFromLocalStorage,
  RecentRouteCandidate,
  RecentRoutePair,
  saveRecentRoute,
} from '../../../../shared/lib/recent-routes';
import {
  BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK,
  BookingPolicyService,
} from '../../../../services/booking-policy/booking-policy.service';

// OBRS-564: date-picker cap fallback, used only until the real public
// booking-policy config resolves (see ngOnInit below). A briefly-wrong value
// here is a date-picker AFFORDANCE, not a binding policy statement to a
// customer (contrast business-policy.component.ts, where the same numbers
// are a *statement* and MUST NOT render until the real value is known) — the
// server re-validates the actual cap on submit regardless.
//
// OBRS-698 moved the number itself next to the service call and raised it
// 30 → 60: this screen is no longer its only user, and 30 had silently
// become STRICTER than the policy it stands in for (backend default is 60
// since OBRS-647), so a failed fetch hid a month of sellable departures.

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

  /** OBRS-575: up to 3 already-id-resolved, deduped, active-station-filtered
   *  recent-route candidates for the quick-pick strip. Plain field, never a
   *  template getter — recomputed only from `recomputeRecentRouteCandidates()`. */
  recentRouteCandidates: RecentRouteCandidate[] = [];
  /** The current raw (origin,destination) id source — either the logged-in
   *  user's booking history (newest-first) or the anonymous localStorage cache.
   *  Kept so a later station-list emission can re-derive candidates without
   *  re-fetching.
   *
   *  `count` is optional because the two sources carry frequency differently:
   *  the API source expresses it as REPEATED pairs (no count field), the
   *  localStorage source as one entry with an explicit count. Both are valid
   *  input to `deriveRecentRouteCandidates`, which tallies either shape
   *  (OBRS-923). */
  private rawRecentRoutePairs: (RecentRoutePair & { count?: number })[] = [];

  private destroy$ = new Subject<void>();

  roundTripOnChange$: Subscription;

  isRoundTripReturn: boolean = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private store: Store,
    private appStore: Store<Appstate>,
    private authService: AuthService,
    private bookingService: BookingService,
    private bookingPolicyService: BookingPolicyService
  ) {
    this.minDate = new Date();
    this.maxDate = dayjs(this.minDate)
      .add(BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK, 'day')
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
      // AC#6's active-station filter depends on the current roster, and the
      // store emits [] first on a cold load — recompute here (not only after
      // the booking-history/localStorage source resolves) so a derivation
      // never resolves ids against an empty list and drops every route.
      this.recomputeRecentRouteCandidates();
    });

    // Switches the raw-pair SOURCE between the logged-in API and the
    // anonymous localStorage cache. Never issues the API call for an
    // anonymous visitor.
    this.authService.authStatus$.pipe(takeUntil(this.destroy$)).subscribe((isAuthenticated) => {
      if (isAuthenticated) {
        this.loadRecentRoutesFromApi();
      } else {
        this.rawRecentRoutePairs = loadRecentRoutesFromLocalStorage().map((entry) => ({
          originId: entry.originId,
          destinationId: entry.destinationId,
          // Dropping `count` here would silently flatten the anonymous source to
          // pure recency again — the entries are already deduped, so the count
          // is the ONLY frequency signal that survives the write path.
          count: entry.count,
        }));
        this.recomputeRecentRouteCandidates();
      }
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
        // Explicit no-op: keeping the fallback IS the handling. An observer
        // with no `error` callback lets the interceptor's rethrow surface as
        // an RxJS unhandled error on the home page, which is the opposite of
        // the silent degradation intended above.
        error: () => undefined,
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

    // OBRS-575: `selectScheduleList` below emits the CURRENT store value
    // synchronously on every subscribe — it fires on every submit regardless
    // of what the search actually returns, and onSearch() itself performs no
    // validation. Gate the write explicitly (same id resolution the
    // derivation uses) so an empty-form tap never stores '' / NaN pairs.
    this.saveRecentRouteIfValid(formValue.startStationId, formValue.stopStationId);

    this.store.dispatch(
      invokeSetScheduleFilterApi({
        schedule_filter: formValue,
      })
    );

    this.store.pipe(select(selectScheduleList), take(1)).subscribe(() => {
      this.router.navigate(['/schedule-booking']);
    });
  }

  /** OBRS-575: tapping a quick-pick route reuses the exact prefill call
   *  pattern `HomeComponent.onPickupDropoffConfirmed()` already drives
   *  (`home.component.ts:60-61`) — both `onStartStationChange`/
   *  `onEndStationChange` run their existing `syncStationOptions()` logic
   *  unchanged. */
  onRecentRouteSelected(candidate: RecentRouteCandidate): void {
    this.onStartStationChange(candidate.originStation);
    this.onEndStationChange(candidate.destinationStation);
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

  /** OBRS-575: fetches the logged-in user's booking history for the
   *  quick-pick strip's raw-pair source. `skipAuthLogout=true` (the 3rd
   *  param, threaded into `SKIP_AUTH_LOGOUT`) is REQUIRED here — without it
   *  `auth.interceptor.ts` force-logouts a user with an expired JWT on this
   *  background convenience fetch alone (AC#8). A failed request degrades to
   *  "no candidates", never `AlertService.error()` — this must never block or
   *  interrupt the primary "load Home, search a trip" flow. */
  private loadRecentRoutesFromApi(): void {
    this.bookingService
      .getMyBookings(undefined, false, true)
      .pipe(
        catchError(() => of(null)),
        takeUntil(this.destroy$)
      )
      .subscribe((response) => {
        this.rawRecentRoutePairs = extractRecentRoutePairsFromBookings(
          response?.data?.content ?? []
        );
        this.recomputeRecentRouteCandidates();
      });
  }

  /** OBRS-575: pure derivation (pairs + current active station roster →
   *  candidates) — see `shared/lib/recent-routes.ts`. Called whenever either
   *  input changes: the station-list subscription (next to
   *  `syncStationOptions()`) and after the raw-pair source resolves. */
  private recomputeRecentRouteCandidates(): void {
    this.recentRouteCandidates = deriveRecentRouteCandidates(
      this.rawRecentRoutePairs,
      this.allProvinceStationList
    );
  }

  /** OBRS-575 localStorage write gate: only when BOTH ids resolve to a
   *  station in the current active roster (reuses the same id-resolution the
   *  derivation itself uses) — otherwise an empty-form Search tap would fill
   *  the 10-entry cap with '' / NaN rows the AC#6 filter then silently drops.
   *  Unconditional otherwise (not gated on auth state) — a route stays
   *  available in the strip immediately after logout. */
  private saveRecentRouteIfValid(
    startStationId: string | number | null | undefined,
    stopStationId: string | number | null | undefined
  ): void {
    const originId = Number(startStationId);
    const destinationId = Number(stopStationId);

    if (!Number.isFinite(originId) || !Number.isFinite(destinationId)) {
      return;
    }

    const originExists = this.allProvinceStationList.some((station) => station.id === originId);
    const destinationExists = this.allProvinceStationList.some(
      (station) => station.id === destinationId
    );
    if (!originExists || !destinationExists) {
      return;
    }

    saveRecentRoute(originId, destinationId);
  }
}
