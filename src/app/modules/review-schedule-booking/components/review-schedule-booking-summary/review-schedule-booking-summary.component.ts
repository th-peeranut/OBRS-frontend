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
} from '../../../../shared/interfaces/schedule.interface';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import {
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
})
export class ReviewScheduleBookingSummaryComponent {
  scheduleBooking: Observable<ScheduleBooking>;
  scheduleFilter: Observable<ScheduleFilter>;
  rawProvinceStationList: Observable<StationApi[]>;

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

    return combineLatest([this.scheduleFilter, this.rawProvinceStationList]).pipe(
      take(1),
      switchMap(([scheduleFilter, stations]) => {
        const fromSlug = this.stationSlugById(scheduleFilter?.startStationId, stations);
        const toSlug = this.stationSlugById(scheduleFilter?.stopStationId, stations);
        if (!fromSlug || !toSlug) {
          return of<TripEstimate | null>(null);
        }

        const pickupSlug = isReturnLeg ? toSlug : fromSlug;
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

  /** Resolves a station's `slug` by id — same underlying `stops.slug` column
   *  that `RouteStop.slug` (from `getPickupDropoffCached`) keys off. */
  private stationSlugById(
    stationId: string | number | null | undefined,
    stationList: StationApi[] | null | undefined
  ): string {
    if (stationId === null || stationId === undefined || stationId === '') {
      return '';
    }
    const parsed = Number(stationId);
    const match = (stationList ?? []).find((station) => station.id === parsed);
    return match?.slug ?? '';
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


