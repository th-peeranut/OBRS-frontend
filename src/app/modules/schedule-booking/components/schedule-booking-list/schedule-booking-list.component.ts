import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  Schedule,
  ScheduleFilter,
  ScheduleList,
} from '../../../../shared/interfaces/schedule.interface';
import { combineLatest, map, Observable, startWith, Subscription } from 'rxjs';
import { Store, select } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';
import { invokeSetScheduleBookingApi } from '../../../../shared/stores/schedule-booking/schedule-booking.action';
import { Router } from '@angular/router';
import dayjs from 'dayjs';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';

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

  constructor(
    private store: Store,
    private router: Router,
    private appStore: Store<Appstate>,
    private translateService: TranslateService
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
  }

  ngOnDestroy(): void {
    if (this.scheduleList$) {
      this.scheduleList$.unsubscribe();
    }
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

    this.scheduleList$ = this.scheduleList.subscribe((schedules) => {
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
    if (!dateTime) return '';
    const parsed = dayjs(dateTime);
    return parsed.isValid() ? parsed.format('HH:mm') : '';
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

  getPricePerSeat(value: string | number | null | undefined): number {
    const parsed = typeof value === 'string' ? parseFloat(value) : value ?? 0;
    return Number.isFinite(parsed) ? parsed : 0;
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

  private normalizeLocale(locale: string | null | undefined): 'en' | 'th' {
    return (locale || '').toLowerCase().startsWith('th') ? 'th' : 'en';
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
