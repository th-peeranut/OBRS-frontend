import { Component } from '@angular/core';
import {
  Schedule,
  ScheduleList,
} from '../../../../shared/interfaces/schedule.interface';
import { Observable } from 'rxjs';
import { Store, select } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';
import { TranslateService } from '@ngx-translate/core';
import { Route } from '../../../../shared/interfaces/route.interface';

@Component({
  selector: 'app-schedule-booking-list',
  templateUrl: './schedule-booking-list.component.html',
  styleUrl: './schedule-booking-list.component.scss',
})
export class ScheduleBookingListComponent {
  scheduleList: Observable<ScheduleList>;

  constructor(
    private store: Store,
    private appStore: Store<Appstate>,
    private translateService: TranslateService
  ) {
    this.scheduleList = this.store.pipe(select(selectScheduleList));
  }

  selectSchedule(schedule: Schedule) {
    // Implement logic to save selection
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
