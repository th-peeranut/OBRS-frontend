// Modules
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { CalendarModule } from 'primeng/calendar';

// Components
import { ScheduleBookingComponent } from './schedule-booking.component';
import { StepperComponent } from './components/stepper/stepper.component';
import { ScheduleBookingFilterComponent } from './components/schedule-booking-filter/schedule-booking-filter.component';
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownObrsPassengerComponent } from '../home/components/dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import { ScheduleBookingListComponent } from './components/schedule-booking-list/schedule-booking-list.component';

const routes: Routes = [{ path: '', component: ScheduleBookingComponent }];

@NgModule({
  declarations: [
    ScheduleBookingComponent,
    StepperComponent,
    ScheduleBookingFilterComponent,
    ScheduleBookingListComponent,
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
export class ScheduleBookingModule {}
