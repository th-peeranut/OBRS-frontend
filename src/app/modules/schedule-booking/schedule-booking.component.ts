import { Component } from '@angular/core';

import { Store } from '@ngrx/store';
import { invokeGetScheduleFilterApi } from '../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeGetAllProvinceWithStationApi } from '../../shared/stores/province/province.action';

@Component({
  selector: 'app-schedule-booking',
  templateUrl: './schedule-booking.component.html',
  styleUrl: './schedule-booking.component.scss',
})
export class ScheduleBookingComponent {
  constructor(private store: Store) {}

  ngOnInit(): void {
    this.store.dispatch(invokeGetAllProvinceWithStationApi());
    this.store.dispatch(invokeGetScheduleFilterApi());
  }
}
