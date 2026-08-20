import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { Appstate } from '../../../../shared/stores/appstate';
import { ScheduleBooking } from '../../../../shared/interfaces/schedule-booking.interface';
import { selectScheduleBooking } from '../../../../shared/stores/schedule-booking/schedule-booking.selector';
import { combineLatest, map, Observable, of, switchMap, take } from 'rxjs';
import {
  Schedule,
  ScheduleFilter,
  ScheduleList,
} from '../../../../shared/interfaces/schedule.interface';
import {
  boardingDistanceView,
  crossPairBoardingStop,
} from '../../../../shared/lib/return-boarding-stop';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';
import {
  getStationSlugById,
  getStationTranslationLabel,
  getStopTypeLabel,
  Province,
  ProvinceStationReview,
  Station,
  StationApi,
} from '../../../../shared/interfaces/station.interface';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import dayjs from 'dayjs';
import {
  capitalizeVehicleType,
  durationHours,
  durationMinutes,
  formatTimeHHMM,
  tripEstimateFromStops,
} from '../../../../shared/lib/trip-format';
import { TripEstimate } from '../../../../shared/interfaces/route-map.interface';
import { RouteMapService } from '../../../../services/route-map/route-map.service';

@Component({
    selector: 'app-review-schedule-booking-summary',
    templateUrl: './review-schedule-booking-summary.component.html',
    styleUrl: './review-schedule-booking-summary.component.scss',
    standalone: false
})
export class ReviewScheduleBookingSummaryComponent {
  scheduleBooking: Observable<ScheduleBooking>;
  scheduleFilter: Observable<ScheduleFilter>;
  rawProvinceStationList: Observable<StationApi[]>;

  /**
   * OBRS-1343. This is the LAST screen before payment, and until now it named
   * the return leg's departure stop off `scheduleFilter.stopStationId` — where
   * the outbound leg drops the customer. For 4 of the 6 Bangkok destinations of
   * `chonburi_bangkok` the bus home does not call there at all, so the screen
   * that confirms the trip was naming a stop the customer must not go to.
   */
  scheduleList: Observable<ScheduleList>;

  /** Bound as-is so this page and the trip list answer with the same two rules. */
  protected readonly crossPairBoardingStop = crossPairBoardingStop;
  protected readonly boardingDistanceView = boardingDistanceView;

  /**
   * OBRS-1336 AC 5. The trip-type label used to be chosen by counting the
   * selected schedules — `length == 1` meant "เที่ยวเดียว". That made the label
   * a function of what happened to be selectable rather than of what the
   * customer agreed to buy: a round-trip search whose return list came back
   * empty carried exactly one leg here and was relabelled one-way with nobody
   * asked. It is read off the same `roundTrip` that `passenger-info` turns into
   * the booking's `bookingType`, so the screen and the record cannot disagree.
   */
  tripTypeLabelKey$: Observable<string>;

  constructor(
    private store: Store,
    private router: Router,
    private appStore: Store<Appstate>,
    private translateService: TranslateService,
    private routeMapService: RouteMapService
  ) {
    this.rawProvinceStationList = this.store.pipe(
      select(selectProvinceWithStation)
    );
    this.scheduleBooking = this.store.pipe(select(selectScheduleBooking));
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));
    this.scheduleList = this.store.pipe(select(selectScheduleList));
    this.tripTypeLabelKey$ = this.scheduleFilter.pipe(
      map((scheduleFilter) =>
        this.isRoundTrip(scheduleFilter)
          ? 'REVIEW_SCHEDULE_BOOKING.SUMMARY.ROUND_TRIP_TWOWAY'
          : 'REVIEW_SCHEDULE_BOOKING.SUMMARY.ROUND_TRIP_ONEWAY'
      )
    );
  }

  /** `roundTrip` reaches the store as either the Dropdown or its bare id,
   *  depending on whether the customer touched the control — same defensive
   *  read `schedule-booking-list` and `passenger-info` do. */
  private isRoundTrip(scheduleFilter: ScheduleFilter | null | undefined): boolean {
    const roundTrip = scheduleFilter?.roundTrip as { id?: number } | number | undefined;
    const roundTripId = typeof roundTrip === 'object' ? roundTrip?.id : roundTrip;
    return roundTripId === 2;
  }

  getScheduleBooking(schedule?: Schedule[] | null): Schedule[] {
    return schedule ?? [];
  }

  getFirstSchedule(schedule?: Schedule[] | null): Schedule | null {
    return schedule?.[0] ?? null;
  }

  getSecondSchedule(schedule?: Schedule[] | null): Schedule | null {
    return schedule?.[1] ?? null;
  }

  formatDateTimeToHHMM(dateTime: string): string {
    return formatTimeHHMM(dateTime);
  }

  formatDateFromDateTime(dateTime: string): string {
    if (!dateTime) return '';
    const parsed = dayjs(dateTime);
    if (parsed.isValid()) {
      return this.formatDate(parsed.format('YYYY-MM-DD'));
    }
    const datePart = dateTime.split(' ')[0] ?? dateTime;
    return this.formatDate(datePart);
  }

  formatDate(dateStr: string): string {
    const raw = this.translateService.currentLang || 'en';
    const lang: 'en' | 'th' = raw === 'th' ? 'th' : 'en';

    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    if (isNaN(date.getTime())) return dateStr;

    const months: Record<'en' | 'th', readonly string[]> = {
      en: [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ] as const,
      th: [
        'ม.ค.',
        'ก.พ.',
        'มี.ค.',
        'เม.ย.',
        'พ.ค.',
        'มิ.ย.',
        'ก.ค.',
        'ส.ค.',
        'ก.ย.',
        'ต.ค.',
        'พ.ย.',
        'ธ.ค.',
      ] as const,
    };

    const day = date.getDate();
    const month = months[lang][date.getMonth()];
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
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

  findStationById(stationId: number | string): Observable<ProvinceStationReview | null> {
    return this.rawProvinceStationList.pipe(
      take(1),
      map((stations) => {
        const stationApi = (stations ?? []).find((s) => s.id === stationId);
        if (stationApi) {
          return {
            id: stationApi.id,
            nameThai: getStopTypeLabel(stationApi.stopType, 'th'),
            nameEnglish: getStopTypeLabel(stationApi.stopType, 'en'),
            station: this.toStation(stationApi),
          } as ProvinceStationReview;
        }
        return null;
      })
    );
  }

  getProvinceName(province?: Province | null): string {
    if (!province) return '';

    return this.translateService.currentLang === 'th'
      ? province.nameThai
      : province.nameEnglish;
  }

  getStationName(station?: Station | null): string {
    if (!station) return '';

    return this.translateService.currentLang === 'th'
      ? station.nameThai
      : station.nameEnglish;
  }

  /**
   * Authoritative pickup→dropoff distance/duration for one leg's card, from
   * `RouteMapService.getPickupDropoffCached`. `isReturnLeg` swaps which slug
   * is searched in `pickup[]` vs `dropoff[]`: the return leg's `routeSlug` is
   * the reverse physical route, so its `pickup[]` holds the destination-city
   * stops and its `dropoff[]` holds the origin-city stops. This swap is
   * independent of the pre-existing (out-of-scope) unswapped station-label
   * lookup elsewhere in this template — the chip always uses the correct
   * from/to regardless of that latent bug.
   */
  findTripEstimate(
    schedule: Schedule | null | undefined,
    isReturnLeg: boolean
  ): Observable<TripEstimate | null> {
    if (!schedule?.routeSlug) {
      return of(null);
    }
    const routeSlug = schedule.routeSlug;

    return combineLatest([
      this.scheduleFilter,
      this.rawProvinceStationList,
      this.scheduleList,
    ]).pipe(
      take(1),
      switchMap(([scheduleFilter, stations, scheduleList]) => {
        const fromSlug = getStationSlugById(scheduleFilter?.startStationId, stations);
        const toSlug = getStationSlugById(scheduleFilter?.stopStationId, stations);
        if (!fromSlug || !toSlug) {
          return of<TripEstimate | null>(null);
        }

        // OBRS-1343: the return leg's pickup is the stop the search actually
        // ran from, which is not always the outbound drop-off. Looking `toSlug`
        // up in the reverse route's `pickup[]` found nothing for the four
        // cross pairs, so their chip silently disappeared.
        const returnPickupSlug =
          crossPairBoardingStop(scheduleList)?.slug || toSlug;
        const pickupSlug = isReturnLeg ? returnPickupSlug : fromSlug;
        const dropoffSlug = isReturnLeg ? fromSlug : toSlug;

        return this.routeMapService.getPickupDropoffCached(routeSlug).pipe(
          map((data) => {
            if (!data) return null;
            const pickupStop = data.pickup.find((s) => s.slug === pickupSlug) ?? null;
            const dropoffStop = data.dropoff.find((s) => s.slug === dropoffSlug) ?? null;
            return tripEstimateFromStops(pickupStop, dropoffStop);
          })
        );
      })
    );
  }

  private toStation(stationApi: StationApi): Station {
    const nameEnglish = getStationTranslationLabel(stationApi, 'en') || stationApi.slug;
    const nameThai = getStationTranslationLabel(stationApi, 'th') || nameEnglish;
    return {
      id: stationApi.id,
      code: stationApi.slug,
      nameThai,
      nameEnglish,
      createdBy: '',
      createdDate: stationApi.createdAt,
      lastUpdatedBy: '',
      lastUpdatedDate: stationApi.updatedAt,
      url: '',
    };
  }

  onChangeData() {
    this.router.navigate(['/schedule-booking']);
  }
}


