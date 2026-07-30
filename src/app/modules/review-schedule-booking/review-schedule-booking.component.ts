import { Component } from '@angular/core';

// store
import { Store } from '@ngrx/store';
import {
  invokeGetScheduleBookingApi,
  invokeSetScheduleBookingApi,
  revalidateRestoredScheduleBooking,
} from '../../shared/stores/schedule-booking/schedule-booking.action';
import {
  invokeGetScheduleFilterApi,
  invokeSetScheduleFilterApi,
} from '../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeGetAllProvinceWithStationApi } from '../../shared/stores/station/station.action';

@Component({
  selector: 'app-review-schedule-booking',
  templateUrl: './review-schedule-booking.component.html',
  styleUrl: './review-schedule-booking.component.scss',
})
export class ReviewScheduleBookingComponent {
  constructor(private store: Store) {}

  ngOnInit(): void {
    this.store.dispatch(invokeGetAllProvinceWithStationApi());
    this.store.dispatch(invokeGetScheduleBookingApi());
    this.store.dispatch(invokeGetScheduleFilterApi());
    // OBRS-903: a no-op unless this selection was restored from another tab, in
    // which case its seat snapshot is up to 30 minutes old — re-ask before the
    // customer builds on it (AC3).
    this.store.dispatch(revalidateRestoredScheduleBooking());
  }
}


