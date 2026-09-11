import { Component } from '@angular/core';

import { Store } from '@ngrx/store';
import { invokeGetScheduleFilterApi } from '../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeGetAllProvinceWithStationApi } from '../../shared/stores/station/station.action';

@Component({
    selector: 'app-schedule-booking',
    templateUrl: './schedule-booking.component.html',
    styleUrl: './schedule-booking.component.scss',
    standalone: false
})
export class ScheduleBookingComponent {
  constructor(private store: Store) {}

  ngOnInit(): void {
    // OBRS-637. See the twin block in passenger-info.component.ts: the search
    // button is `position: fixed` below 768px and the report-usability FAB is
    // parked in the same corner above it, so the FAB is told to sit higher for
    // as long as this page is open.
    document.body.classList.add('has-sticky-cta');
    this.store.dispatch(invokeGetAllProvinceWithStationApi());
    this.store.dispatch(invokeGetScheduleFilterApi());
  }

  ngOnDestroy(): void {
    document.body.classList.remove('has-sticky-cta');
  }
}


