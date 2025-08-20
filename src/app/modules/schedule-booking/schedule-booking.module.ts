// Modules
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { CalendarModule } from 'primeng/calendar';

// Components
import { ScheduleBookingComponent } from './schedule-booking.component';
import { ScheduleBookingFilterComponent } from './components/schedule-booking-filter/schedule-booking-filter.component';
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownObrsPassengerComponent } from '../home/components/dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import { ScheduleBookingListComponent } from './components/schedule-booking-list/schedule-booking-list.component';
import { DropdownGroupObrsComponent } from '../../shared/components/dropdown-group-obrs/dropdown-group-obrs.component';

// Store
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { ScheduleFilterEffect } from '../../shared/stores/schedule-filter/schedule-filter.effect';
import { ScheduleFilterReducer } from '../../shared/stores/schedule-filter/schedule-filter.reducer';
import { ScheduleListEffect } from '../../shared/stores/schedule-list/schedule-list.effect';
import { ScheduleListReducer } from '../../shared/stores/schedule-list/schedule-list.reducer';
import { ProvinceEffect } from '../../shared/stores/province/province.effect';
import { ProvinceReducer } from '../../shared/stores/province/province.reducer';
import { ScheduleBookingReducer } from '../../shared/stores/schedule-booking/schedule-booking.reducer';
import { ScheduleBookingEffect } from '../../shared/stores/schedule-booking/schedule-booking.effect';

const routes: Routes = [{ path: '', component: ScheduleBookingComponent }];

@NgModule({
  declarations: [
    ScheduleBookingComponent,
    ScheduleBookingFilterComponent,
    ScheduleBookingListComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(routes),

    // Store
    StoreModule.forFeature('provinceWithStationList', ProvinceReducer),
    StoreModule.forFeature('scheduleFilter', ScheduleFilterReducer),
    StoreModule.forFeature('scheduleList', ScheduleListReducer),
    StoreModule.forFeature('scheduleBooking', ScheduleBookingReducer),

    EffectsModule.forFeature([
      ProvinceEffect,
      ScheduleFilterEffect,
      ScheduleListEffect,
      ScheduleBookingEffect,
    ]),

    // Add-ons
    CalendarModule,

    // Components
    DropdownObrsComponent,
    DropdownGroupObrsComponent,
    DropdownObrsPassengerComponent,
  ],
})
export class ScheduleBookingModule {}
