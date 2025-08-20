import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { Appstate } from '../../../../shared/stores/appstate';
import { ScheduleBooking } from '../../../../shared/interfaces/schedule-booking.interface';
import { selectScheduleBooking } from '../../../../shared/stores/schedule-booking/schedule-booking.selector';
import { map, Observable, take } from 'rxjs';
import {
  Schedule,
  ScheduleFilter,
} from '../../../../shared/interfaces/schedule.interface';
import { Route } from '../../../../shared/interfaces/route.interface';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { Province, ProvinceStation, ProvinceStationReview } from '../../../../shared/interfaces/province.interface';
import { selectProvinceWithStation } from '../../../../shared/stores/province/province.selector';
import { Station } from '../../../../shared/interfaces/station.interface';

@Component({
  selector: 'app-review-schedule-booking-summary',
  templateUrl: './review-schedule-booking-summary.component.html',
  styleUrl: './review-schedule-booking-summary.component.scss',
})
export class ReviewScheduleBookingSummaryComponent {
  scheduleBooking: Observable<ScheduleBooking>;
  scheduleFilter: Observable<ScheduleFilter>;
  rawProvinceStationList: Observable<ProvinceStation[]>;

  constructor(
    private store: Store,
    private router: Router,
    private appStore: Store<Appstate>,
    private translateService: TranslateService
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

  formatTimeToHHMM(time: string): string {
    if (!time) return '';
    const parts = time.split(':');
    return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : time;
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

  getHour(time: string): number | string {
    if (!time) return '';

    const [hour] = time.split(':');
    return parseInt(hour, 10);
  }

  getMinute(time: string): number | string {
    if (!time) return '';

    const [, minute] = time.split(':');
    return parseInt(minute, 10);
  }

  getRoutesName(route: Route | null): string {
    if (!route) return '';

    return this.translateService.currentLang === 'th'
      ? route.nameThai
      : route.nameEnglish;
  }

  findStationById(stationId: number | string): Observable<ProvinceStationReview | null> {
    return this.rawProvinceStationList.pipe(
      take(1),
      map((stations) => {
        for (const province of stations ?? []) {
          const station = province.stations?.find((s) => s.id === stationId);
          if (station) {
            return {
              id: province?.id,
              nameThai: province?.nameThai,
              nameEnglish: province?.nameEnglish,
              station: station,
            } as ProvinceStationReview;
          }
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

  onChangeData() {
    this.router.navigate(['/schedule-booking']);
  }
}
