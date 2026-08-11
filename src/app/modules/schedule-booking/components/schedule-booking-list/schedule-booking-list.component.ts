import { Component, OnDestroy, OnInit } from '@angular/core';
import dayjs from 'dayjs';
import {
  Schedule,
  ScheduleFilter,
  ScheduleList,
} from '../../../../shared/interfaces/schedule.interface';
import {
  combineLatest,
  map,
  Observable,
  startWith,
  Subject,
  Subscription,
  take,
  takeUntil,
} from 'rxjs';
import { Store, select } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';
import { invokeSetScheduleBookingApi } from '../../../../shared/stores/schedule-booking/schedule-booking.action';
import { Router } from '@angular/router';
import {
  capitalizeVehicleType,
  durationHours,
  durationMinutes,
  formatTimeHHMM,
  isLowSeatCount,
  parsePricePerSeat,
  tripEstimateFromStops,
} from '../../../../shared/lib/trip-format';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import {
  getStationFallbackLabel,
  getStationSlugById,
  StationApi,
} from '../../../../shared/interfaces/station.interface';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import { RouteMapService } from '../../../../services/route-map/route-map.service';
import { TripEstimate } from '../../../../shared/interfaces/route-map.interface';
import { LOW_SEAT_THRESHOLD } from '../../../../shared/constants/passenger-limits';
import { AnalyticsService } from '../../../../services/analytics/analytics.service';

/**
 * OBRS-1217: what the empty result list means when the customer searched TODAY.
 * `null` everywhere else — including "searched another day and found nothing",
 * which keeps its existing `NO_RESULTS` copy.
 */
export interface SoldOutTodayState {
  /** The next day, already localized for the button ("วันอังคาร 11 ส.ค."). */
  nextDayLabel: string;
  /** Round-trip legs get the message with NO button: moving the outbound to
   *  tomorrow can leave the return date BEFORE it, and this screen has no say
   *  over the return leg. Owner's call, 2026-08-10. */
  canJumpToNextDay: boolean;
}

@Component({
    selector: 'app-schedule-booking-list',
    templateUrl: './schedule-booking-list.component.html',
    styleUrl: './schedule-booking-list.component.scss',
    standalone: false
})
export class ScheduleBookingListComponent implements OnInit, OnDestroy {
  scheduleList: Observable<ScheduleList>;
  scheduleFilter: Observable<ScheduleFilter | null>;
  rawProvinceStationList: Observable<StationApi[]>;
  currentLocale$: Observable<'en' | 'th'>;
  departureRouteLabel$: Observable<string>;
  returnRouteLabel$: Observable<string>;
  /** OBRS-1217. Non-null only while the customer is looking at an empty result
   *  list for TODAY — the state that is reachable every single evening once the
   *  last bus has left, because the calendar defaults to today and the search
   *  filters departed rounds out in SQL (`ScheduleRepository:151`). */
  soldOutToday$: Observable<SoldOutTodayState | null>;
  /** The raw active language ('th' | 'en' | 'zh') — unlike `currentLocale$`,
   *  which deliberately narrows to the two locales station labels exist in. */
  private currentLang$: Observable<string>;

  selectedSchedule: Schedule[] = [];

  isSelectFirst: boolean = false;

  /** At or below this remaining-seat count, the exact number is surfaced as
   *  a scarcity cue (OBRS-229); above it, no seat text shows at all — see
   *  `isLowSeatCount`. Shared single source (OBRS-323) with the OPEN-seating
   *  count card so both surfaces use the same threshold. */
  readonly LOW_SEAT_THRESHOLD = LOW_SEAT_THRESHOLD;

  scheduleList$: Subscription;

  /** Authoritative pickup→dropoff distance/duration per schedule id, resolved
   *  from `RouteMapService.getPickupDropoffCached` once the schedule's
   *  `routeSlug`, and the filter's from/to stations, are known. Absent
   *  (no key) until resolved — the chip simply doesn't render yet
   *  (progressive enhancement, no loading spinner). */
  departureEstimates: Record<number, TripEstimate> = {};
  returnEstimates: Record<number, TripEstimate> = {};

  private destroy$ = new Subject<void>();

  constructor(
    private store: Store,
    private router: Router,
    private appStore: Store<Appstate>,
    private translateService: TranslateService,
    private routeMapService: RouteMapService,
    private analytics: AnalyticsService
  ) {
    this.scheduleList = this.store.pipe(select(selectScheduleList));
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));
    this.rawProvinceStationList = this.store.pipe(select(selectProvinceWithStation));
    this.currentLocale$ = this.translateService.onLangChange.pipe(
      map((event: LangChangeEvent) => this.normalizeLocale(event.lang)),
      startWith(this.normalizeLocale(this.translateService.currentLang))
    );
    this.currentLang$ = this.translateService.onLangChange.pipe(
      map((event: LangChangeEvent) => event.lang),
      startWith(this.translateService.currentLang)
    );
    this.departureRouteLabel$ = combineLatest([
      this.scheduleFilter,
      this.rawProvinceStationList,
      this.currentLocale$,
    ]).pipe(
      map(([scheduleFilter, stationList, locale]) =>
        this.getRouteFromFilter(scheduleFilter, stationList, locale, false)
      )
    );
    this.returnRouteLabel$ = combineLatest([
      this.scheduleFilter,
      this.rawProvinceStationList,
      this.currentLocale$,
    ]).pipe(
      map(([scheduleFilter, stationList, locale]) =>
        this.getRouteFromFilter(scheduleFilter, stationList, locale, true)
      )
    );

    // OBRS-1217 AC#5: "today" is resolved HERE, on every emission — i.e. when a
    // result comes back — never captured once at construction. A tab left open
    // at 23:50 and searched at 00:05 must not be told its own search date is
    // today. `currentLang$` rather than `currentLocale$` on purpose: the latter
    // folds zh into 'en' (it exists for station labels, which have no zh copy),
    // and a zh customer must not get an English date on the button.
    this.soldOutToday$ = combineLatest([
      this.scheduleList,
      this.scheduleFilter,
      this.currentLang$,
    ]).pipe(
      map(([scheduleList, scheduleFilter, lang]) =>
        this.resolveSoldOutToday(scheduleList, scheduleFilter, lang)
      )
    );
  }

  ngOnInit(): void {
    this.isSelectFirst = false;
    this.selectedSchedule = [];

    combineLatest([this.scheduleList, this.scheduleFilter, this.rawProvinceStationList])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([scheduleList, scheduleFilter, stations]) => {
        this.resolveTripEstimates(scheduleList, scheduleFilter, stations);
      });
  }

  ngOnDestroy(): void {
    if (this.scheduleList$) {
      this.scheduleList$.unsubscribe();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectSchedule(schedule: Schedule, isFirst: boolean = false): void {
    // OBRS-867 funnel step 3. Fired here rather than on the store action,
    // because `invokeSetScheduleBookingApi` is also dispatched to CLEAR the
    // selection (see `clearSchedule` and the round-trip dropdown handler in
    // schedule-booking-filter) — an effect keyed on that action would count
    // every clear as a selection.
    this.analytics.track('schedule_selected', {
      schedule_id: schedule.id,
      leg: isFirst ? 'departure' : 'return',
      price_per_seat: parsePricePerSeat(schedule.pricePerSeat),
      seating_mode: schedule.seatingMode ?? '',
    });

    let newSelected: Schedule[] = [];

    const isExisting = this.selectedSchedule.some((s) => s.id === schedule.id);

    if (isFirst && !isExisting) {
      this.isSelectFirst = true;
      newSelected = [schedule];
    } else {
      newSelected = [...this.selectedSchedule, schedule];
    }

    this.selectedSchedule = newSelected;

    this.store.dispatch(
      invokeSetScheduleBookingApi({
        schedule_booking: {
          schedule: this.selectedSchedule,
        },
      })
    );

    if (this.scheduleList$) this.scheduleList$.unsubscribe();
    this.scheduleList$ = this.scheduleList.pipe(take(1)).subscribe((schedules) => {
      const hasArrivalSchedules = (schedules?.arrivalSchedules?.length ?? 0) > 0;
      if (!hasArrivalSchedules || !isFirst) {
        this.router.navigate(['/review-schedule-booking']);
      }
    });
  }

  clearSchedule() {
    this.selectedSchedule = [];
    this.isSelectFirst = false;

    this.store.dispatch(
      invokeSetScheduleBookingApi({
        schedule_booking: {
          schedule: null,
        },
      })
    );
  }

  formatDateTimeToHHMM(dateTime: string): string {
    return formatTimeHHMM(dateTime);
  }

  getDurationHours(startDateTime: string, endDateTime: string): number {
    return durationHours(startDateTime, endDateTime);
  }

  getDurationMinutes(startDateTime: string, endDateTime: string): number {
    return durationMinutes(startDateTime, endDateTime);
  }

  formatVehicleType(type: string | null | undefined): string {
    return capitalizeVehicleType(type);
  }

  getPricePerSeat(value: string | number | null | undefined): number {
    return parsePricePerSeat(value);
  }

  isLowSeats(availableSeats: number | null | undefined): boolean {
    return isLowSeatCount(availableSeats, this.LOW_SEAT_THRESHOLD);
  }

  /**
   * OBRS-1217. Returns non-null only for the one state this card is about:
   * the search RAN (a null `scheduleList` means it never did), came back with
   * no outbound rounds, and the date searched is today.
   *
   * Deliberately says nothing about whether the next day HAS rounds — nothing
   * on this screen has searched it yet, so the copy invites and never promises.
   */
  private resolveSoldOutToday(
    scheduleList: ScheduleList | null | undefined,
    scheduleFilter: ScheduleFilter | null | undefined,
    lang: string
  ): SoldOutTodayState | null {
    const departures = scheduleList?.departureSchedules;
    if (!Array.isArray(departures) || departures.length > 0) {
      return null;
    }

    const searchedDate = dayjs(scheduleFilter?.departureDate);
    if (!scheduleFilter?.departureDate || !searchedDate.isValid()) {
      return null;
    }
    if (!searchedDate.isSame(dayjs(), 'day')) {
      return null;
    }

    return {
      nextDayLabel: this.formatDayLabel(searchedDate.add(1, 'day').toDate(), lang),
      canJumpToNextDay: !this.isRoundTrip(scheduleFilter),
    };
  }

  /**
   * OBRS-1217 button action: move the search one day forward. Dispatching the
   * FILTER (not a search) is the whole trick — `ScheduleBookingFilterComponent`
   * already patches its own date control and re-dispatches
   * `invokeGetScheduleListApi` on every filter change (see its `ngOnInit`), so
   * one action both re-runs the search and stops the form above from showing
   * yesterday's date. Composing a search payload here would need the station
   * slugs and would leave that form stale.
   */
  showNextDay(): void {
    this.scheduleFilter.pipe(take(1)).subscribe((scheduleFilter) => {
      if (!scheduleFilter?.departureDate || this.isRoundTrip(scheduleFilter)) {
        return;
      }

      const nextDay = dayjs(scheduleFilter.departureDate).add(1, 'day');
      if (!nextDay.isValid()) {
        return;
      }

      this.store.dispatch(
        invokeSetScheduleFilterApi({
          schedule_filter: {
            ...scheduleFilter,
            departureDate: nextDay.format('YYYY-MM-DD'),
          },
        })
      );
    });
  }

  /** `roundTrip` reaches the store as either the Dropdown or its bare id,
   *  depending on whether the customer touched the control — same defensive
   *  read the filter component does. */
  private isRoundTrip(scheduleFilter: ScheduleFilter | null | undefined): boolean {
    const roundTrip = scheduleFilter?.roundTrip as { id?: number } | number | undefined;
    const roundTripId = typeof roundTrip === 'object' ? roundTrip?.id : roundTrip;
    return roundTripId === 2;
  }

  /** Weekday + day + short month in the ACTIVE language, via the platform's
   *  own calendar data — no locale bundle to register and no fourth date
   *  format to keep in sync. The year is left out on purpose: `th-TH` renders
   *  it as a Buddhist-era year, which is right but noisy inside a button. */
  private formatDayLabel(date: Date, lang: string): string {
    const bcp47 = this.toBcp47(lang);
    try {
      return new Intl.DateTimeFormat(bcp47, {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      }).format(date);
    } catch {
      // A locale the runtime rejects must not blank the button out.
      return dayjs(date).format('D MMM');
    }
  }

  private toBcp47(lang: string | null | undefined): string {
    const normalized = (lang || '').toLowerCase();
    if (normalized.startsWith('th')) return 'th-TH';
    if (normalized.startsWith('zh')) return 'zh-CN';
    return 'en-GB';
  }

  private getRouteFromFilter(
    scheduleFilter: ScheduleFilter | null | undefined,
    stationList: StationApi[] | null | undefined,
    locale: 'en' | 'th',
    isReturn: boolean = false
  ): string {
    if (!scheduleFilter) return '';

    const fromId = isReturn ? scheduleFilter.stopStationId : scheduleFilter.startStationId;
    const toId = isReturn ? scheduleFilter.startStationId : scheduleFilter.stopStationId;

    const fromName = this.getStationLabelById(fromId, stationList, locale);
    const toName = this.getStationLabelById(toId, stationList, locale);

    if (fromName && toName) {
      return `${fromName} - ${toName}`;
    }

    return fromName || toName || '';
  }

  private getStationLabelById(
    stationId: string | number | null | undefined,
    stationList: StationApi[] | null | undefined,
    locale: 'en' | 'th'
  ): string {
    if (stationId === null || stationId === undefined || stationId === '') {
      return '';
    }

    const parsed = Number(stationId);
    const match = (stationList ?? []).find((station) => station.id === parsed);
    if (!match) return '';

    return getStationFallbackLabel(match, locale);
  }

  /** Resolves `departureEstimates`/`returnEstimates` for every schedule row
   *  once the filter's from/to stations and each schedule's `routeSlug` are
   *  known. One `getPickupDropoffCached` call per distinct route slug —
   *  N schedule rows on the same route share a single HTTP request. */
  private resolveTripEstimates(
    scheduleList: ScheduleList | null | undefined,
    scheduleFilter: ScheduleFilter | null | undefined,
    stations: StationApi[] | null | undefined
  ): void {
    if (!scheduleFilter) {
      return;
    }

    const fromSlug = getStationSlugById(scheduleFilter.startStationId, stations);
    const toSlug = getStationSlugById(scheduleFilter.stopStationId, stations);
    if (!fromSlug || !toSlug) {
      return;
    }

    this.resolveLegEstimates(
      scheduleList?.departureSchedules ?? [],
      fromSlug,
      toSlug,
      false,
      this.departureEstimates
    );
    // Return leg's routeSlug is the reverse route: its `pickup[]` holds the
    // destination-city stops and its `dropoff[]` holds the origin-city
    // stops, so the from/to lookup swaps versus the outbound leg.
    this.resolveLegEstimates(
      scheduleList?.arrivalSchedules ?? [],
      fromSlug,
      toSlug,
      true,
      this.returnEstimates
    );
  }

  private resolveLegEstimates(
    schedules: Schedule[],
    fromSlug: string,
    toSlug: string,
    isReturnLeg: boolean,
    target: Record<number, TripEstimate>
  ): void {
    const scheduleIdsBySlug = new Map<string, number[]>();
    for (const schedule of schedules) {
      if (!schedule.routeSlug) {
        continue;
      }
      const ids = scheduleIdsBySlug.get(schedule.routeSlug) ?? [];
      ids.push(schedule.id);
      scheduleIdsBySlug.set(schedule.routeSlug, ids);
    }

    const pickupSlug = isReturnLeg ? toSlug : fromSlug;
    const dropoffSlug = isReturnLeg ? fromSlug : toSlug;

    scheduleIdsBySlug.forEach((scheduleIds, slug) => {
      this.routeMapService
        .getPickupDropoffCached(slug)
        .pipe(takeUntil(this.destroy$))
        .subscribe((data) => {
          if (!data) {
            return;
          }
          const pickupStop = data.pickup.find((stop) => stop.slug === pickupSlug) ?? null;
          const dropoffStop = data.dropoff.find((stop) => stop.slug === dropoffSlug) ?? null;
          const estimate = tripEstimateFromStops(pickupStop, dropoffStop);
          scheduleIds.forEach((id) => {
            target[id] = estimate;
          });
        });
    });
  }

  private normalizeLocale(locale: string | null | undefined): 'en' | 'th' {
    return (locale || '').toLowerCase().startsWith('th') ? 'th' : 'en';
  }

  trackById(_index: number, item: Schedule): number {
    return item.id;
  }
}
