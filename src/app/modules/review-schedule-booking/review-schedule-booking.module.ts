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

    // Components
    DropdownObrsComponent,
    DropdownObrsPassengerComponent,
  ],
})
export class ReviewScheduleBookingModule {}
