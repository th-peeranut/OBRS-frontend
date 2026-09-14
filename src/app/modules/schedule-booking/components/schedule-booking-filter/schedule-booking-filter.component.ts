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
import {
  catchError,
  combineLatest,
  forkJoin,
  map,
  Observable,
  of,
  startWith,
  Subject,
  Subscription,
  switchMap,
  take,
  takeUntil,
} from 'rxjs';
import {
  ScheduleFilter,
  ScheduleFilterPayload,
} from '../../../../shared/interfaces/schedule.interface';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../../../shared/services/alert.service';
import { canSwapStationPair } from '../../../../shared/lib/station-swap';

import { select, Store } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeGetScheduleListApi } from '../../../../shared/stores/schedule-list/schedule-list.action';
import {
  getStationLabelById,
  StationApi,
} from '../../../../shared/interfaces/station.interface';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import { invokeSetScheduleBookingApi } from '../../../../shared/stores/schedule-booking/schedule-booking.action';
import {
  BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK,
  BookingPolicyService,
} from '../../../../services/booking-policy/booking-policy.service';
import { LanguageService } from '../../../../shared/services/language.service';
import { carryReturnDate, defaultReturnDate } from '../../../../shared/lib/return-date';
import { RouteMapService } from '../../../../services/route-map/route-map.service';
import { StationService } from '../../../../services/station/station.service';
import { RouteSegments } from '../../../../shared/lib/bookable-stations';
import {
  ProvinceStopsApi,
  StationGroup,
} from '../../../../shared/lib/station-groups';
import { buildStationPairOptions } from '../../../../shared/lib/station-pair-options';
import { formatDayChip } from '../../../../shared/lib/day-label';

/** OBRS-863 — the one-line reading of the search that produced the list below,
 *  shown in place of the form while it is collapsed. */
export interface ScheduleSearchSummary {
  route: string;
  dateLabel: string;
  passengers: number;
}

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

  // OBRS-1701: widened from `StationApi[]` to carry province groups, the same
  // pair of types the home form's twin fields have held since OBRS-1212.
  startProvinceStationList: StationApi[] | StationGroup[] = [];
  endProvinceStationList: StationApi[] | StationGroup[] = [];

  /** OBRS-1701: the pickup/dropoff halves of every active route — the input
   *  that turns this bar's two dropdowns from "every stop" into "the stops
   *  that can produce a trip". `null` is load-bearing: it means "route data
   *  unavailable", which `buildStationPairOptions()` reads as "offer
   *  everything", the behaviour this screen had before the card. */
  private routeSegments: RouteSegments[] | null = null;
  /** OBRS-1701: which province each stop belongs to, for the dropdown
   *  headings. `null` means "render flat" — the pre-card behaviour again. */
  private provinceStops: ProvinceStopsApi[] | null = null;

  scheduleFilter: Observable<ScheduleFilter>;

  /**
   * OBRS-863 AC#1 — whether the full form is on screen. Starts OPEN and closes
   * exactly once, the first time a real summary resolves: with nothing searched
   * there is no summary to stand in for the form, and a collapsed bar above an
   * empty page would leave a customer arriving here directly with no visible
   * way to search at all. Settled with `summarySettled` so a later
   * `scheduleFilter` emission — the day strip writes one on every tap — can
   * never reopen a bar the customer just closed, or close one they just opened.
   */
  isExpanded = true;
  /** OBRS-863 AC#4 — `null` until the store holds a search worth summarising. */
  summary: ScheduleSearchSummary | null = null;
  private summarySettled = false;

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
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));

    this.createForm();
  }

  ngOnInit() {
    // OBRS-698: correct the fallback above once the real, owner-editable cap
    // resolves (owner edits it at /admin/settings/booking-policy, OBRS-564 —
    // moved under the tabbed settings page by OBRS-702).
    // A failed fetch just keeps the fallback — the server is the real gate on
    // submit either way, so there is nothing to retry here. Both the fallback
    // and the failed-fetch handling (without which the interceptor's rethrow
    // surfaces as an RxJS unhandled error) now live once on
    // `BookingPolicyService.maxAdvanceDays$`, which OBRS-862 made the single
    // source: this calendar's cap, the day strip's window and the list's
    // nearest-day hint are three views of ONE number on one screen, and three
    // separate GETs let them disagree while they resolved.
    this.bookingPolicyService.maxAdvanceDays$
      .pipe(takeUntil(this.destroy$))
      .subscribe((maxAdvanceDays) => {
        this.maxDate = dayjs(this.minDate).add(maxAdvanceDays, 'day').toDate();
      });

    this.rawProvinceStationList
      .pipe(takeUntil(this.destroy$))
      .subscribe((stationList) => {
        this.allProvinceStationList = stationList || [];
        this.syncStationOptions();
      });

    // OBRS-1701: both refine the dropdowns and neither gates them — see each
    // method for why a failure is silent.
    this.loadRouteSegments();
    this.loadProvinceStops();

    // OBRS-863 AC#4: the summary reads the same two store slices the result
    // list reads (`selectScheduleFilter` + `selectProvinceWithStation`) through
    // the same `getStationFallbackLabel` and the same 'en'|'th' narrowing —
    // deliberately NOT `bookingForm`, which holds what the customer is part-way
    // through editing rather than what produced the trips below it. Language is
    // a third input because the labels are localized: a live switch has to
    // relabel the bar without a reload.
    combineLatest([
      this.scheduleFilter,
      this.rawProvinceStationList,
      this.translate.onLangChange.pipe(
        map((event: LangChangeEvent) => event.lang),
        startWith(this.translate.currentLang)
      ),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([scheduleFilter, stations, lang]) => {
        // Settling here (on "a summary can be rendered") rather than where a
        // search actually dispatches let this fire off an INCOMPLETE write —
        // e.g. the trip-type toggle writes the raw form on every change,
        // stations-only, 0 passengers — collapsing the form on a customer who
        // had only picked a route and never pressed Search. Settling is done in
        // the `isSearchable` branch below instead, which is the same condition
        // that actually fires `invokeGetScheduleListApi` — see the UX spec's
        // own trigger: "arrival, and after a successful search".
        this.summary = this.buildSummary(scheduleFilter, stations, lang);
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

            // OBRS-863 AC#1/AC#3: collapse in lockstep with a search that
            // actually ran — restored on arrival, or a later write (day strip,
            // trip-type toggle) that happens to already be a complete search —
            // never merely because `buildSummary` can render one.
            //
            // BOTH conditions, not either: `isSearchable()` does not look at the
            // date, so a restored filter carrying a null `departureDate` searches
            // while `buildSummary()` returns null, and collapsing on that alone
            // would hide the form behind a bar reading "no route selected yet"
            // over a full result list. `summary` is already fresh here — the
            // `combineLatest` above is subscribed FIRST, so it has recomputed off
            // this same store emission by the time this line runs.
            if (!this.summarySettled && this.summary) {
              this.summarySettled = true;
              this.isExpanded = false;
            }
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
      this.scrollToFirstMissingField(payload);
      return;
    }

    // OBRS-1503: writing the filter is the ONLY dispatch this button needs.
    // The `scheduleFilter` subscription in ngOnInit runs the search off the
    // value that lands in the store, behind its own `isSearchable()` guard, so
    // a second `invokeGetScheduleListApi` from here put two identical
    // POST /schedules/search on the wire for every press. Same shape as
    // home-booking.component.ts's onSearch(), which never had the duplicate.
    this.store.dispatch(
      invokeSetScheduleFilterApi({
        schedule_filter: formValue,
      })
    );

    // OBRS-863 AC#3. Below the `isSearchable()` guard above on purpose: a press
    // that only produced the SEARCH_VALIDATION warning must leave the form open
    // at the field `scrollToFirstMissingField()` just scrolled to.
    this.isExpanded = false;
  }

  /** OBRS-863 AC#2 — one control, both directions. The form itself is the same
   *  markup either way; only whether it is rendered changes. */
  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  // OBRS-637 (AC#4). Below 768px this button is fixed to the bottom of the
  // screen, so it can be pressed while the field it is complaining about is
  // entirely off-screen - the warning would name a field the customer cannot
  // see. Bring that field into view as well as saying so.
  //
  // The order mirrors `isSearchable()` below, which is the only thing that can
  // have rejected the press: stations first, passenger count second.
  private scrollToFirstMissingField(payload: ScheduleFilterPayload): void {
    const selector =
      !payload.fromStop || !payload.toStop
        ? '.station-group'
        : 'app-dropdown-obrs-passenger';

    // Queried off `document` rather than through an injected `ElementRef`: the
    // spec constructs this component with `new` and positional arguments in
    // three places, so a new constructor parameter is a compile error in a file
    // this card has no business editing. The host selector scopes it - the only
    // other copy of this bar is `app-home-booking`, a different component.
    document
      .querySelector('app-schedule-booking-filter ' + selector)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  /**
   * OBRS-863 AC#1/AC#4. Returns `null` — which renders the form open rather
   * than an empty bar — unless BOTH stations and a valid departure date resolve:
   * a half-summary ("กรุงเทพฯ → · 30 ก.ค.") is a claim about the list below that
   * the list is not making.
   */
  private buildSummary(
    scheduleFilter: ScheduleFilter | null | undefined,
    stations: StationApi[] | null | undefined,
    lang: string
  ): ScheduleSearchSummary | null {
    if (!scheduleFilter) return null;

    // Same narrowing as ScheduleBookingListComponent.normalizeLocale() —
    // station labels exist in two locales, so zh reads the English one there
    // and must read the English one here.
    const locale = (lang || '').toLowerCase().startsWith('th') ? 'th' : 'en';

    const from = getStationLabelById(
      scheduleFilter.startStationId,
      stations,
      locale
    );
    const to = getStationLabelById(
      scheduleFilter.stopStationId,
      stations,
      locale
    );
    const departure = this.summaryDateLabel(scheduleFilter.departureDate, lang);

    if (!from || !to || !departure) return null;

    // Same defensive read as the `scheduleFilter` subscription above: the store
    // holds either the Dropdown or its bare id, and `?? 2` is round-trip.
    const roundTrip = scheduleFilter.roundTrip as { id?: number } | number | undefined;
    const roundTripId = typeof roundTrip === 'object' ? roundTrip?.id : roundTrip;
    const returnLabel =
      (roundTripId ?? 2) === 2
        ? this.summaryDateLabel(scheduleFilter.returnDate, lang)
        : '';

    const passengerInfo = Array.isArray(scheduleFilter.passengerInfo)
      ? scheduleFilter.passengerInfo
      : [];

    return {
      route: `${from} → ${to}`,
      dateLabel: returnLabel ? `${departure} – ${returnLabel}` : departure,
      passengers: passengerInfo.reduce(
        (total, item) => total + (item?.count || 0),
        0
      ),
    };
  }

  /** `formatDayChip` rather than a new formatter: it is what the day strip one
   *  element below already renders, so the two cannot name the same day
   *  differently. */
  private summaryDateLabel(
    value: string | Date | null | undefined,
    lang: string
  ): string {
    if (!value) return '';

    const date = dayjs(value);
    if (!date.isValid()) return '';

    const chip = formatDayChip(date.toDate(), lang);
    return `${chip.weekday} ${chip.date}`;
  }

  /**
   * Rebuilds both dropdown option lists for the currently selected pair.
   *
   * <p>OBRS-1701: this used to remove the mirror stop and nothing else, so the
   * bar offered every stop on the roster as an origin AND as a destination —
   * from `nong_chak` that was 27 destinations where `/home` offered 6 (measured
   * on prod 2026-09-01). The rule now comes from `buildStationPairOptions()`,
   * the same call the home form makes, so the two search bars cannot answer the
   * same question differently again.
   */
  private syncStationOptions(
    selectedStartId?: string | number | null,
    selectedStopId?: string | number | null
  ): void {
    const currentStartId =
      selectedStartId ?? this.bookingForm.get('startStationId')?.value;
    const currentStopId =
      selectedStopId ?? this.bookingForm.get('stopStationId')?.value;

    const options = buildStationPairOptions({
      stations: this.allProvinceStationList,
      routeSegments: this.routeSegments,
      provinceStops: this.provinceStops,
      startStationId: currentStartId,
      stopStationId: currentStopId,
    });

    if (options.clearStopStation) {
      this.bookingForm.patchValue({ stopStationId: '' });
    }

    this.startProvinceStationList = options.origins;
    this.endProvinceStationList = options.destinations;
  }

  /**
   * OBRS-1701: loads the pickup/dropoff lists of every active route, the same
   * way `HomeBookingComponent` does — `RouteMapService` dedupes both calls per
   * URL, so arriving here from the home search reuses the responses `/home`
   * already fetched rather than issuing them again.
   *
   * <p>Failure is not reported anywhere: `catchError` leaves `routeSegments`
   * null, which `buildStationPairOptions()` reads as "offer every stop" — the
   * behaviour this screen had before the card. Narrowing is a REFINEMENT of a
   * bar that works without it, so it must never block or alert.
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
   * OBRS-1701: loads which province every stop belongs to, so the two dropdowns
   * carry province headings here as they do on `/home`. Deduped for the whole
   * session inside `StationService`.
   *
   * <p>Failure leaves `provinceStops` null, which is read as "render flat" —
   * again a refinement, never a precondition.
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
        // An empty array stays null for the same reason `routeSegments` does.
        this.provinceStops = provinces?.length ? provinces : null;
        this.syncStationOptions();
      });
  }
}
