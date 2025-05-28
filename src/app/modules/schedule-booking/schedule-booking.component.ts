import { Component } from '@angular/core';

import { Store } from '@ngrx/store';
import { invokeGetAllRouteMapApi } from '../../shared/stores/route-map/route-map.action';
import { invokeGetAllRouteApi } from '../../shared/stores/route/route.action';
import { invokeGetScheduleFilterApi } from '../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeGetAllStationApi } from '../../shared/stores/station/station.action';

@Component({
  selector: 'app-schedule-booking',
  templateUrl: './schedule-booking.component.html',
  styleUrl: './schedule-booking.component.scss',
})
export class ScheduleBookingComponent {
  constructor(private store: Store) {}

  ngOnInit(): void {
    this.store.dispatch(invokeGetAllStationApi());
    this.store.dispatch(invokeGetAllRouteApi());
    this.store.dispatch(invokeGetAllRouteMapApi());
    this.store.dispatch(invokeGetScheduleFilterApi());
  }
}
