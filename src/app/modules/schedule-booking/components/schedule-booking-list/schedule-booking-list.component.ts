import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  Schedule,
  ScheduleList,
} from '../../../../shared/interfaces/schedule.interface';
import { Observable, Subscription } from 'rxjs';
import { Store, select } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';
import { invokeSetScheduleBookingApi } from '../../../../shared/stores/schedule-booking/schedule-booking.action';
import { Router } from '@angular/router';
import dayjs from 'dayjs';

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
    private appStore: Store<Appstate>
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

  private getDurationMinutesTotal(startDateTime: string, endDateTime: string): number {
    if (!startDateTime || !endDateTime) return 0;
    const start = dayjs(startDateTime);
    const end = dayjs(endDateTime);
    if (!start.isValid() || !end.isValid()) return 0;
    const diff = end.diff(start, 'minute');
    return diff >= 0 ? diff : 0;
  }
}
