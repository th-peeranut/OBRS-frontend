import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  Schedule,
  ScheduleList,
} from '../../../../shared/interfaces/schedule.interface';
import { Observable, Subscription } from 'rxjs';
import { Store, select } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';
import { TranslateService } from '@ngx-translate/core';
import { Route } from '../../../../shared/interfaces/route.interface';
import { invokeSetScheduleBookingApi } from '../../../../shared/stores/schedule-booking/schedule-booking.action';
import { Router } from '@angular/router';

@Component({
  selector: 'app-schedule-booking-list',
  templateUrl: './schedule-booking-list.component.html',
  styleUrl: './schedule-booking-list.component.scss',
})
export class ScheduleBookingListComponent implements OnInit, OnDestroy {
  scheduleList: Observable<ScheduleList>;

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
      console.log('Selected schedules:', schedules);
      if ((!schedules?.returnSchedules || !isFirst)) {
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

  formatTimeToHHMM(time: string): string {
    if (!time) return '';
    const parts = time.split(':');
    return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : time;
  }
}
