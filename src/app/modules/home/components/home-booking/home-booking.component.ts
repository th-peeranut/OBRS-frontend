import { Component, EventEmitter, OnDestroy, OnInit, Output, Signal } from '@angular/core';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';
import { FormBuilder, FormGroup } from '@angular/forms';
import dayjs from 'dayjs';
import { Router } from '@angular/router';
import { Appstate } from '../../../../shared/stores/appstate';
import { select, Store } from '@ngrx/store';
import {
  catchError,
  forkJoin,
  map,
  Observable,
  of,
  Subject,
  Subscription,
  switchMap,
  take,
  takeUntil,
} from 'rxjs';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { getStationSlugById, StationApi } from '../../../../shared/interfaces/station.interface';
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
import { RouteMapService } from '../../../../services/route-map/route-map.service';
import {
  collectBookableDestinationSlugs,
  collectBookableOriginSlugs,
  filterStationsBySlugs,
  RouteSegments,
} from '../../../../shared/lib/bookable-stations';
import {
  buildStopOrderMap,
  groupStationsByProvince,
  ProvinceStopsApi,
  RouteSide,
  sortStationsByStopOrder,
  StationGroup,
} from '../../../../shared/lib/station-groups';
import { StationService } from '../../../../services/station/station.service';
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
  /** What the two `app-dropdown-group-obrs` instances are bound to.
   *
   *  OBRS-1212 widened the type: these hold PROVINCE GROUPS once
   *  `/api/provinces/stops` has answered, and the flat `StationApi[]` before
   *  that and forever after a failure. The dropdown switches branch on the
   *  shape alone (`isGroupedOptions()` = `Array.isArray(options[0]?.stations)`),
   *  so one binding covers both without the template knowing which it holds. */
  startProvinceStationList: StationApi[] | StationGroup[] = [];
  endProvinceStationList: StationApi[] | StationGroup[] = [];

  /** OBRS-1212: province membership + the province's translated name, from
   *  `GET /api/provinces/stops`.
   *
   *  `null` is load-bearing in exactly the way `routeSegments` is: it means
   *  "province data unavailable", and every consumer reads it as "render the
   *  dropdown flat" — the screen customers have today. A failed lookup must
   *  cost the grouping, never the booking form (AC#6's rule, inherited). */
  private provinceStops: ProvinceStopsApi[] | null = null;

  /** OBRS-1213: the pickup/dropoff halves of every active route, used to keep
   *  the two dropdowns to stops that can actually produce a trip.
   *
   *  `null` is load-bearing and means "route data unavailable" — before it
   *  resolves, and permanently if the request fails or no active route comes
   *  back. Every consumer below reads that as "offer everything", which is
   *  exactly today's behaviour (AC#6): a customer who cannot reach
   *  `/api/routes` still gets a usable form, never an empty dropdown. */
  private routeSegments: RouteSegments[] | null = null;

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

  /** OBRS-1211: tells `HomeComponent` the user asked to see the pickup/drop-off
   *  map, so it can reveal `app-route-map-home`'s gated panel and scroll to it.
   *  Mirrors the existing `onPickupDropoffConfirmed()` hand-off between these
   *  two siblings, just in the opposite direction. */
  @Output() mapHintRequested = new EventEmitter<void>();

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private store: Store,
    private appStore: Store<Appstate>,
    private authService: AuthService,
    private bookingService: BookingService,
    private bookingPolicyService: BookingPolicyService,
    private routeMapService: RouteMapService,
    private stationService: StationService,
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

    this.loadRouteSegments();
    this.loadProvinceStops();

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

    // OBRS-575: this method runs on every submit regardless of what the search
    // actually returns, and onSearch() itself performs no validation. Gate the
    // write explicitly (same id resolution the derivation uses) so an
    // empty-form tap never stores '' / NaN pairs.
    this.saveRecentRouteIfValid(formValue.startStationId, formValue.stopStationId);

    this.store.dispatch(
      invokeSetScheduleFilterApi({
        schedule_filter: formValue,
      })
    );

    // OBRS-1257: navigate outright, and say so. This used to read
    // `this.store.pipe(select(selectScheduleList), take(1)).subscribe(...)`,
    // which looked like "wait for the search results" and was not: `home.module`
    // never registers the `scheduleList` slice (only `schedule-booking.module`
    // does), so the selector returned `undefined`, the store emitted it
    // synchronously on subscribe, `take(1)` completed, and the navigation fired
    // at once. The old line's only effect was to hide that.
    //
    // ⛔ Do NOT "fix" this by registering `scheduleList` here and restoring the
    // subscribe. That would turn an immediate navigation into one that waits for
    // the slice's first value, and nothing on THIS page ever produces one: the
    // only `invokeGetScheduleListApi` dispatch lives in
    // `schedule-booking-filter.component.ts`, which is declared by the
    // destination module and so cannot have run while we are still standing on
    // Home. The search button would simply stop working. The results list
    // belongs to the destination page and stays there.
    this.router.navigate(['/schedule-booking']);
  }

  /** OBRS-1211: the "not sure where to board?" link — defers to `HomeComponent`
   *  to reveal the gated map panel and scroll to it. */
  onMapHintClick(): void {
    this.mapHintRequested.emit();
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

  /**
   * OBRS-1213: loads the pickup/dropoff lists of every active route so the two
   * dropdowns can be held to stops that can actually produce a trip.
   *
   * <p>No new endpoint and no new page-load request per route beyond the ones
   * `/home` already issues: both `getActiveRoutes()` and `getPickupDropoffCached()`
   * are deduped per URL in `RouteMapService` (see `shared()` there), so the map
   * component sharing this page reuses the very same responses.
   *
   * <p>Failure is not reported anywhere: `catchError` leaves `routeSegments`
   * null, which every consumer reads as "offer every stop" — the pre-fix
   * behaviour. This is a REFINEMENT of the form, not a precondition for using
   * it, so it must never block or alert (AC#6).
   */
  private loadRouteSegments(): void {
    this.routeMapService
      .getActiveRoutes()
      .pipe(
        switchMap((routes) =>
          routes.length === 0
            ? of<(RouteSegments | null)[]>([])
            : forkJoin(
                routes.map((route) =>
                  this.routeMapService.getPickupDropoffCached(route.slug).pipe(take(1))
                )
              )
        ),
        catchError(() => of<(RouteSegments | null)[]>([])),
        takeUntil(this.destroy$)
      )
      .subscribe((segments) => {
        const usable = segments.filter((s): s is RouteSegments => !!s);
        // An empty result stays null rather than becoming an empty array: an
        // empty array is a claim that NO stop is bookable, and would blank both
        // dropdowns on the strength of a request that simply did not answer.
        this.routeSegments = usable.length > 0 ? usable : null;
        this.syncStationOptions();
      });
  }

  /**
   * OBRS-1212: loads which province every stop belongs to, so the two dropdowns
   * can carry province headings.
   *
   * <p>This is the ONE request the card adds to `/home`, and it is deduped for
   * the whole session inside `StationService` — the origin and the destination
   * dropdown are built from a single response, not one each.
   *
   * <p>Failure leaves `provinceStops` null, which `syncStationOptions()` reads
   * as "render flat". Nothing is alerted and nothing is retried: grouping is a
   * refinement of a form that works without it, so a customer whose province
   * lookup fails must still see every stop OBRS-1213 left them.
   */
  private loadProvinceStops(): void {
    this.stationService
      .getProvincesWithStops()
      .pipe(
        map((response) => response?.data ?? null),
        catchError(() => of<ProvinceStopsApi[] | null>(null)),
        takeUntil(this.destroy$)
      )
      .subscribe((provinces) => {
        // An empty array stays null for the same reason `routeSegments` does:
        // "the backend knows of no provinces" would silently strip every
        // heading, and is indistinguishable here from a request that answered
        // with nothing useful.
        this.provinceStops = provinces?.length ? provinces : null;
        this.syncStationOptions();
      });
  }

  /**
   * Rebuilds both dropdown option lists for the currently selected pair.
   *
   * <p>Three filters compose here, in this order:
   *   1. OBRS-1213 — origins are the stops that are a `pickup` somewhere, and
   *      destinations the stops reachable AFTER the chosen origin. Skipped
   *      wholesale while `routeSegments` is null (see the field's comment).
   *   2. the pre-existing "you cannot pick the same stop on both sides".
   *   3. a destination the new origin has just invalidated is CLEARED, not
   *      merely hidden — leaving it selected would submit exactly the
   *      impossible pair this method exists to prevent, and the list on screen
   *      would no longer contain it, so nothing would show the customer why.
   *      Same reasoning, same trigger as `RouteMapHomeComponent.refreshDropoffOptions()`.
   */
  private syncStationOptions(
    selectedStartId?: string | number | null,
    selectedStopId?: string | number | null
  ): void {
    const currentStartId =
      selectedStartId ?? this.bookingForm.get('startStationId')?.value;
    let currentStopId =
      selectedStopId ?? this.bookingForm.get('stopStationId')?.value;

    const originSlugs = this.routeSegments
      ? collectBookableOriginSlugs(this.routeSegments)
      : null;

    // A start that is not a bookable origin at all — a stale prefill from
    // booking history, a stop retired since — narrows nothing instead of
    // narrowing to nothing. The alternative is a destination dropdown that is
    // simply empty, with nothing on screen saying why.
    const startSlug = getStationSlugById(currentStartId, this.allProvinceStationList);
    const narrowFrom = originSlugs?.has(startSlug) ? startSlug : '';

    const destinationSlugs = this.routeSegments
      ? collectBookableDestinationSlugs(this.routeSegments, narrowFrom)
      : null;

    if (destinationSlugs && !isEmptyStationValue(currentStopId)) {
      const stopSlug = getStationSlugById(currentStopId, this.allProvinceStationList);
      if (!destinationSlugs.has(stopSlug)) {
        this.bookingForm.patchValue({ stopStationId: '' });
        // Cleared BEFORE the lists are built, not after: the origin list
        // excludes whatever the destination currently is, so recomputing off
        // the stale id would keep the just-released stop hidden from the
        // origin dropdown until some later sync happened to run.
        currentStopId = '';
      }
    }

    const origins = filterStationsBySlugs(this.allProvinceStationList, originSlugs).filter(
      (item) => item.id !== Number(currentStopId)
    );
    const destinations = filterStationsBySlugs(
      this.allProvinceStationList,
      destinationSlugs
    ).filter((item) => item.id !== Number(currentStartId));

    this.startProvinceStationList = this.toDropdownOptions(origins, 'pickup');
    this.endProvinceStationList = this.toDropdownOptions(destinations, 'dropoff');
  }

  /**
   * OBRS-1212: turns a filtered station list into what the dropdown renders —
   * ordered by position along the route, then bucketed by province.
   *
   * <p>Order comes from the ROUTE (`pickup`/`dropoff` `order`), never from
   * `/api/stops`' id order and never from the order `/api/provinces/stops`
   * happens to return: `Province.stops` is a bare `@OneToMany` with no
   * `@OrderBy`, so its order is whatever Postgres returns and moves whenever a
   * row is updated. Measured 2026-08-10 it already puts "ตลาดเนื่องจำนงค์"
   * last in Chonburi, where the live dropdown shows it second (AC#8, AC#10).
   *
   * <p>Sort BEFORE grouping, not after: the buckets keep insertion order, so
   * one sort of the flat list orders every group at once — and it means the
   * ungrouped fallback below is ordered identically to the grouped one, rather
   * than being a second, differently-sorted screen.
   *
   * <p>Falls back to the flat list whenever province data is unavailable
   * (`groupStationsByProvince` returns null). Ordering survives that fallback:
   * losing the province lookup costs the headings, not the sequence.
   */
  private toDropdownOptions(
    stations: StationApi[],
    side: RouteSide
  ): StationApi[] | StationGroup[] {
    const ordered = sortStationsByStopOrder(
      stations,
      buildStopOrderMap(this.routeSegments, side)
    );
    return groupStationsByProvince(ordered, this.provinceStops) ?? ordered;
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
