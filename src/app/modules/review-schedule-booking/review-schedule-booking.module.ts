import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { DatePickerModule } from 'primeng/datepicker';
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
// OBRS-1343: this page now reads the search RESULT, not just the selection —
// `returnBoardingStop` says which stop the return leg boards at and lives there.
// Registered here because a tab opened straight onto this URL (the OBRS-903
// verify-your-email hop) never loads `schedule-booking.module`, which is the
// only other place the slice is declared.
import { ScheduleListEffect } from '../../shared/stores/schedule-list/schedule-list.effect';
import { ScheduleListReducer } from '../../shared/stores/schedule-list/schedule-list.reducer';
import { ProvinceReducer } from '../../shared/stores/station/station.reducer';
import { ProvinceEffect } from '../../shared/stores/station/station.effect';

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
    DatePickerModule,

    // Store
    StoreModule.forFeature('provinceWithStationList', ProvinceReducer),
    StoreModule.forFeature('scheduleBooking', ScheduleBookingReducer),
    StoreModule.forFeature('scheduleFilter', ScheduleFilterReducer),
    StoreModule.forFeature('scheduleList', ScheduleListReducer),

    EffectsModule.forFeature([
      ProvinceEffect,
      ScheduleFilterEffect,
      ScheduleBookingEffect,
      ScheduleListEffect,
    ]),

    // Components
    DropdownObrsComponent,
    DropdownObrsPassengerComponent,
  ],
})
export class ReviewScheduleBookingModule {}


