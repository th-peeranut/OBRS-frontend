import { Component, OnDestroy, OnInit } from '@angular/core';
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
  parsePricePerSeat,
  tripEstimateFromStops,
} from '../../../../shared/lib/trip-format';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import {
  getStationFallbackLabel,
  getStationSlugById,
  StationApi,
} from '../../../../shared/interfaces/station.interface';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import { RouteMapService } from '../../../../services/route-map/route-map.service';
import { TripEstimate } from '../../../../shared/interfaces/route-map.interface';

@Component({
  selector: 'app-schedule-booking-list',
  templateUrl: './schedule-booking-list.component.html',
  styleUrl: './schedule-booking-list.component.scss',
})
export class ScheduleBookingListComponent implements OnInit, OnDestroy {
  scheduleList: Observable<ScheduleList>;
  scheduleFilter: Observable<ScheduleFilter | null>;
  rawProvinceStationList: Observable<StationApi[]>;
  currentLocale$: Observable<'en' | 'th'>;
  departureRouteLabel$: Observable<string>;
  returnRouteLabel$: Observable<string>;

  selectedSchedule: Schedule[] = [];

  isSelectFirst: boolean = false;

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
    private routeMapService: RouteMapService
  ) {
    this.scheduleList = this.store.pipe(select(selectScheduleList));
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));
    this.rawProvinceStationList = this.store.pipe(select(selectProvinceWithStation));
    this.currentLocale$ = this.translateService.onLangChange.pipe(
      map((event: LangChangeEvent) => this.normalizeLocale(event.lang)),
      startWith(this.normalizeLocale(this.translateService.currentLang))
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
