import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import { combineLatest, Observable, take, map, startWith } from 'rxjs';
import {
  ProvinceStationReview,
  Province,
  StationApi,
} from '../../../../shared/interfaces/station.interface';
import { ScheduleBooking } from '../../../../shared/interfaces/schedule-booking.interface';
import {
  ScheduleFilter,
  Schedule,
} from '../../../../shared/interfaces/schedule.interface';
import { Station } from '../../../../shared/interfaces/station.interface';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import { selectScheduleBooking } from '../../../../shared/stores/schedule-booking/schedule-booking.selector';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { selectPassengerInfo } from '../../../../shared/stores/passenger-info/passenger-info.selector';
import { PassengerInfo } from '../../../../shared/interfaces/passenger-info.interface';
import dayjs from 'dayjs';

@Component({
  selector: 'app-payment-info',
  templateUrl: './payment-info.component.html',
  styleUrl: './payment-info.component.scss',
})
export class PaymentInfoComponent {
  scheduleBooking: Observable<ScheduleBooking>;
  scheduleFilter: Observable<ScheduleFilter | null>;
  rawProvinceStationList: Observable<StationApi[]>;
  passengerInfo: Observable<PassengerInfo[] | null>;
  currentLocale$: Observable<'en' | 'th'>;
  departureRouteLabel$: Observable<string>;
  returnRouteLabel$: Observable<string>;

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
    this.passengerInfo = this.store.pipe(select(selectPassengerInfo));
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

  getScheduleBooking(schedule?: Schedule[] | null): Schedule[] {
    return schedule ?? [];
  }

  formatDateTimeToHHMM(dateTime: string): string {
    if (!dateTime) return '';
    const parsed = dayjs(dateTime);
    return parsed.isValid() ? parsed.format('HH:mm') : '';
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
    const totalMinutes = this.getDurationMinutesTotal(startDateTime, endDateTime);
    return Math.floor(totalMinutes / 60);
  }

  getDurationMinutes(startDateTime: string, endDateTime: string): number {
    const totalMinutes = this.getDurationMinutesTotal(startDateTime, endDateTime);
    return totalMinutes % 60;
  }

  formatVehicleType(type: string | null | undefined): string {
    if (!type) return '';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  findStationById(
    stationId: number | string
  ): Observable<ProvinceStationReview | null> {
    return this.rawProvinceStationList.pipe(
      take(1),
      map((stations) => {
        const stationApi = (stations ?? []).find((s) => s.id === stationId);
        if (stationApi) {
          return {
            id: stationApi.id,
            nameThai: this.getStopTypeLabel(stationApi.stopType, 'th'),
            nameEnglish: this.getStopTypeLabel(stationApi.stopType, 'en'),
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

  getPassengerFullName(passenger: PassengerInfo): string {
    const middle = passenger.middleName ? ` ${passenger.middleName}` : '';
    return `${passenger.firstName}${middle} ${passenger.lastName}`.trim();
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

    const byLocale = match.translations?.find((item) =>
      item.locale?.toLowerCase().startsWith(locale)
    );
    if (byLocale?.label) return byLocale.label;

    return match.translations?.[0]?.label || match.slug || '';
  }

  private toStation(stationApi: StationApi): Station {
    const nameEnglish = this.getTranslationLabel(stationApi, 'en') || stationApi.slug;
    const nameThai = this.getTranslationLabel(stationApi, 'th') || nameEnglish;
    return {
      id: stationApi.id,
      code: stationApi.slug,
      nameThai,
      nameEnglish,
      createdBy: stationApi.createdBy,
      createdDate: stationApi.createdDate,
      lastUpdatedBy: stationApi.lastUpdatedBy,
      lastUpdatedDate: stationApi.lastUpdatedDate,
      url: '',
    };
  }

  private getTranslationLabel(stationApi: StationApi, locale: string): string | undefined {
    const match = stationApi.translations?.find((item) => item.locale === locale);
    if (match?.label) return match.label;
    return stationApi.translations?.[0]?.label;
  }

  private getStopTypeLabel(type: string, locale: 'en' | 'th'): string {
    const normalized = (type || '').toLowerCase();
    if (normalized === 'station') return locale === 'th' ? 'Station' : 'Station';
    if (normalized === 'stop') return locale === 'th' ? 'Stop' : 'Stop';
    return type || '';
  }

  private normalizeLocale(locale: string | null | undefined): 'en' | 'th' {
    return (locale || '').toLowerCase().startsWith('th') ? 'th' : 'en';
  }

  onChangeData() {
    this.router.navigate(['/schedule-booking']);
  }

  private getDurationMinutesTotal(startDateTime: string, endDateTime: string): number {
    if (!startDateTime || !endDateTime) return 0;
    const start = dayjs(startDateTime);
    const end = dayjs(endDateTime);
    if (!start.isValid() || !end.isValid()) return 0;
    const diff = end.diff(start, 'minute');
    return diff >= 0 ? diff : 0;
  }
}


