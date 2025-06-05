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
  schedulesMock = [
    {
      departureTime: '07:00', // string HH:mm format
      route: [
        {
          routeNameTh: 'หนองชาก-บ้านบึง-กรุงเทพฯ', // string
          routeNameEng: 'Nong Chak-Ban Bueng-Bangkok', // string
        },
      ],
      availableSeat: 5, // number

      traveTime: '01:00', // string HH:mm format
      arrivalTime: '08:05', // string HH:mm format
      price: 150, // number
    },
  ];

  scheduleList: Observable<ScheduleList>;

  constructor(
    private store: Store,
    private appStore: Store<Appstate>,
    private translateService: TranslateService
  ) {
    this.scheduleList = this.store.pipe(select(selectScheduleList));
  }

  selectSchedule(schedule: Schedule) {
    console.log('Schedule selected:', schedule);
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
}
