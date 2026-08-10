import { Component, OnDestroy, OnInit, Signal } from '@angular/core';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';
import { FormBuilder, FormGroup } from '@angular/forms';
import dayjs from 'dayjs';
import { Router } from '@angular/router';
import { Appstate } from '../../../../shared/stores/appstate';
import { select, Store } from '@ngrx/store';
import { catchError, Observable, of, Subject, Subscription, take, takeUntil } from 'rxjs';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
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
import { LanguageService } from '../../../../shared/services/language.service';
import { canSwapStationPair, isEmptyStationValue } from '../../../../shared/lib/station-swap';
import { carryReturnDate, defaultReturnDate } from '../../../../shared/lib/return-date';

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
    standalone: false
})
export class HomeBookingComponent implements OnInit, OnDestroy {
  // OBRS-1025: still passed to `app-trip-type-toggle` as `[options]` — the
  // pill component reads `id`/`isDefault` the same way `app-dropdown-obrs`
  // did, so this array's shape doesn't change, only what renders it.
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
  /** OBRS-1023: the `dateFormat` both calendars bind to, owned by
   *  LanguageService so the derivation lives once and both customer-facing
   *  forms cannot drift apart. Replaces the `calendarLocale: string` that had
   *  been declared here and in schedule-booking-filter since the calendars
   *  shipped and was never assigned nor read — this card is the work it was
   *  standing in for.
   *
   *  Bound, not read once: `dd/mm/yy` was hardcoded in the template, which
   *  SHADOWED the `CALENDAR.dateFormat` we already translate three ways, so an
   *  English visitor read `03/08/2026` in Thai field order — ambiguous with
   *  8 March on the screen where they commit to a ticket. */
  readonly calendarDateFormat: Signal<string | undefined>;

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

  /** OBRS-928: guards the one-shot prefill of the top-ranked route — see
   *  `prefillTopRecentRoute()`. */
  private hasPrefilledRecentRoute = false;

  private destroy$ = new Subject<void>();

  roundTripOnChange$: Subscription;

  /** OBRS-1185 AC#4: re-derives `returnDate` whenever `departureDate` moves
   *  past it. See `createForm()`. */
  departureDateOnChange$: Subscription;

  // OBRS-1185: literal default flipped to round-trip, matching `createForm()`'s
  // `roundTrip: [2]` seed — a plain `new HomeBookingComponent(...)` (no
  // `app-trip-type-toggle` rendered, e.g. most specs in this file) never runs
  // the child that would otherwise correct this, so the two literals have to
  // agree on their own for the return-date field to be in the DOM from the
  // very first frame (AC#1).
  isRoundTripReturn: boolean = true;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private store: Store,
    private appStore: Store<Appstate>,
    private authService: AuthService,
    private bookingService: BookingService,
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
    this.departureDateOnChange$?.unsubscribe();
  }

  createForm() {
    this.bookingForm = this.fb.group({
      // OBRS-1185: default flipped to round-trip (id 2) — owner decision
      // 2026-08-10, comparing prod against Skyscanner/Traveloka/Airpaz (all
      // three default round-trip). Three places move together or the first
      // frame disagrees with itself: this seed, `roundTripDropdowns`'
      // `isDefault` flag (below), and `isRoundTripReturn`'s own literal
      // default (this class's field initializer) — `app-trip-type-toggle`
      // deliberately does NOT re-derive a default of its own (see that
      // component's header comment), so this is the ONE place the value
      // actually comes from.
      roundTrip: [2],
      // Default to 1 adult so a fresh search is immediately valid; the user can
      // still adjust via the passenger dropdown. Types/casing match
      // DropdownObrsPassengerComponent ('ADULT'/'KIDS') and
      // ScheduleBookingFilterComponent.getPayload() (the surviving payload
      // builder — OBRS-1190 deleted this component's own copy as dead code).
      passengerInfo: [
        [
          { type: 'ADULT', count: 1 },
          { type: 'KIDS', count: 0 },
        ],
      ],

      startStationId: [''],
      stopStationId: [''],
      departureDate: [this.minDate],

      // OBRS-1185: derived FROM departureDate (never `new Date()`/`minDate`
      // directly) and capped at `maxDate` — a same-day round trip is not what
      // "round trip" defaults to on any reference site the owner cited. See
      // `shared/lib/return-date.ts`.
      returnDate: [defaultReturnDate(this.minDate, this.maxDate)],
    });

    this.roundTripOnChange$ = this.bookingForm.controls[
      'roundTrip'
    ].valueChanges.subscribe((value) => {
      // OBRS-1025: `app-trip-type-toggle` writes back a full Dropdown object,
      // so `value?.id` is what carries the id here — but read it the SAME way
      // the schedule-booking-filter twin does (`typeof value === 'object'`),
      // so the two copies of this form cannot drift on this exact line the way
      // OBRS-1021/1028/1023/1036 already did. A bare number can only reach
      // here via a future programmatic patch; handling it costs nothing and
      // keeps the twins byte-identical.
      const roundTripId = typeof value === 'object' ? value?.id : value;
      this.isRoundTripReturn = roundTripId === 2;
    });

    // OBRS-1185 AC#4: moving departureDate past returnDate must carry
    // returnDate forward with it — never leave a pair in the form the backend
    // would reject. `emitEvent: false` — this is a derived correction, not a
    // user edit, and nothing downstream needs to react to it a second time.
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

  /** OBRS-1035 AC#7 — see `canSwapStations()`. Read straight off the controls
   *  (no allocation) because this is a template binding evaluated every CD
   *  tick. */
  get canSwapStations(): boolean {
    return canSwapStationPair(
      this.getFormValue('startStationId'),
      this.getFormValue('stopStationId')
    );
  }

  /**
   * OBRS-1035: swap origin ⇄ destination.
   *
   * Deliberately NOT routed through `onStartStationChange`/`onEndStationChange`:
   * those take a `StationApi` object and would have to look each station back up
   * by id, and calling them in sequence would run `syncStationOptions()` twice
   * against a half-swapped pair. Writing both ids in one `patchValue` and
   * syncing once against the final pair is both fewer steps and the only order
   * with no intermediate state.
   *
   * AC#6: no search is fired here. On the results page a customer is reading a
   * list; swapping the fields must not throw that list away before they ask.
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
      // OBRS-577: `size: 100` pinned explicitly — the new service default
      // dropped to 20 for /my-bookings's own load, but this call's array
      // feeds extractRecentRoutePairsFromBookings, a frequency-ranked sample
      // for the Home quick-pick (OBRS-923); a smaller sample can silently
      // change which route ranks first, so this stays byte-identical to the
      // pre-577 request (page 0, size 100, no status).
      .getMyBookings({ showLoadingDialog: false, skipAuthLogout: true, size: 100 })
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
    this.prefillTopRecentRoute();
  }

  /**
   * OBRS-928: applies the top-ranked route to the search form on load, instead
   * of waiting for the user to discover that the quick-pick pills are tappable.
   * A user who does not poke at web apps never found the strip and went back to
   * hunting for their stops by hand — a feature nobody discovers is worth what
   * a feature nobody shipped is worth.
   *
   * Safe to do only because OBRS-923 ranks by frequency: prefilling the route a
   * customer books over and over is a very different risk from prefilling
   * whatever they happened to book once. The value is also visible and
   * editable in the fields — unlike a placeholder, which only looks like one.
   *
   * Two independent guards, because both the station-list and the auth-status
   * subscriptions call `recomputeRecentRouteCandidates()` and either can fire
   * more than once:
   *   - `hasPrefilledRecentRoute` — at most one prefill per page load;
   *   - the "both fields still empty" check — never overwrite a choice the user
   *     has already made, including one made before the candidates resolved.
   */
  private prefillTopRecentRoute(): void {
    if (this.hasPrefilledRecentRoute) return;

    const top = this.recentRouteCandidates[0];
    if (!top) return;

    const hasUserChoice =
      !isEmptyStationValue(this.getFormValue('startStationId')) ||
      !isEmptyStationValue(this.getFormValue('stopStationId'));
    if (hasUserChoice) return;

    this.hasPrefilledRecentRoute = true;
    this.onRecentRouteSelected(top);
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
