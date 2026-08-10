// Modules
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { DatePickerModule } from 'primeng/datepicker';

// Components
import { ScheduleBookingComponent } from './schedule-booking.component';
import { ScheduleBookingFilterComponent } from './components/schedule-booking-filter/schedule-booking-filter.component';
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownObrsPassengerComponent } from '../home/components/dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import { ScheduleBookingListComponent } from './components/schedule-booking-list/schedule-booking-list.component';
import { DropdownGroupObrsComponent } from '../../shared/components/dropdown-group-obrs/dropdown-group-obrs.component';
import { StationSwapButtonComponent } from '../../shared/components/station-swap-button/station-swap-button.component';
import { TripTypeToggleComponent } from '../../shared/components/trip-type-toggle/trip-type-toggle.component';

// Store
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { ScheduleFilterEffect } from '../../shared/stores/schedule-filter/schedule-filter.effect';
import { ScheduleFilterReducer } from '../../shared/stores/schedule-filter/schedule-filter.reducer';
import { ScheduleListEffect } from '../../shared/stores/schedule-list/schedule-list.effect';
import { ScheduleListReducer } from '../../shared/stores/schedule-list/schedule-list.reducer';
import { ProvinceEffect } from '../../shared/stores/station/station.effect';
import { ProvinceReducer } from '../../shared/stores/station/station.reducer';
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
    DatePickerModule,

    // Components
    DropdownObrsComponent,
    DropdownGroupObrsComponent,
    StationSwapButtonComponent,
    TripTypeToggleComponent,
    DropdownObrsPassengerComponent,
  ],
})
export class ScheduleBookingModule {}


