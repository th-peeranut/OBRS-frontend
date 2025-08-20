import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { CalendarModule } from 'primeng/calendar';
import { SharedModule } from '../../shared/shared.module';

// Components
import { ReviewScheduleBookingComponent } from './review-schedule-booking.component';
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownObrsPassengerComponent } from '../home/components/dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import { ReviewScheduleBookingSummaryComponent } from './components/review-schedule-booking-summary/review-schedule-booking-summary.component';
import { ReviewScheduleBookingTotalComponent } from './components/review-schedule-booking-total/review-schedule-booking-total.component';

/// store
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { ScheduleBookingEffect } from '../../shared/stores/schedule-booking/schedule-booking.effect';
import { ScheduleBookingReducer } from '../../shared/stores/schedule-booking/schedule-booking.reducer';
import { ScheduleFilterEffect } from '../../shared/stores/schedule-filter/schedule-filter.effect';
import { ScheduleFilterReducer } from '../../shared/stores/schedule-filter/schedule-filter.reducer';
import { ProvinceReducer } from '../../shared/stores/province/province.reducer';
import { ProvinceEffect } from '../../shared/stores/province/province.effect';

const routes: Routes = [
  { path: '', component: ReviewScheduleBookingComponent },
];

@NgModule({
  declarations: [
    ReviewScheduleBookingComponent,
    ReviewScheduleBookingSummaryComponent,
    ReviewScheduleBookingTotalComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(routes),

    // Add-ons
    CalendarModule,

    // Store
    StoreModule.forFeature('provinceWithStationList', ProvinceReducer),
    StoreModule.forFeature('scheduleBooking', ScheduleBookingReducer),
    StoreModule.forFeature('scheduleFilter', ScheduleFilterReducer),

    EffectsModule.forFeature([
      ProvinceEffect,
      ScheduleFilterEffect,
      ScheduleBookingEffect,
    ]),

    // Components
    DropdownObrsComponent,
    DropdownObrsPassengerComponent,
  ],
})
export class ReviewScheduleBookingModule {}
