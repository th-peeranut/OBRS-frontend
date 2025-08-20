// Modules
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { CalendarModule } from 'primeng/calendar';

// Components
import { HomeComponent } from './home.component';
import { HomeBookingComponent } from './components/home-booking/home-booking.component';
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownObrsPassengerComponent } from './components/dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import { StationHomeComponent } from './components/station-home/station-home.component';
import { DropdownGroupObrsComponent } from '../../shared/components/dropdown-group-obrs/dropdown-group-obrs.component';

import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { ProvinceReducer } from '../../shared/stores/province/province.reducer';
import { ProvinceEffect } from '../../shared/stores/province/province.effect';
import { ScheduleFilterReducer } from '../../shared/stores/schedule-filter/schedule-filter.reducer';
import { ScheduleFilterEffect } from '../../shared/stores/schedule-filter/schedule-filter.effect';


const routes: Routes = [{ path: '', component: HomeComponent }];

@NgModule({
  declarations: [HomeComponent, HomeBookingComponent, StationHomeComponent],
  imports: [
    SharedModule,
    RouterModule.forChild(routes),

    // Store
    StoreModule.forFeature('provinceWithStationList', ProvinceReducer),
    StoreModule.forFeature('scheduleFilter', ScheduleFilterReducer),
    
    EffectsModule.forFeature([
      ProvinceEffect,
      ScheduleFilterEffect
    ]),

    // Add-ons
    CalendarModule,

    // Components
    DropdownObrsComponent,
    DropdownGroupObrsComponent,
    DropdownObrsPassengerComponent,
  ],
  exports: [
    HomeBookingComponent,
    DropdownObrsComponent,
    DropdownObrsPassengerComponent,
  ],
})
export class HomeModule {}
