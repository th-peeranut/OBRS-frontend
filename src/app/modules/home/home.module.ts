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
import { EffectsModule } from '@ngrx/effects';

import { StoreModule } from '@ngrx/store';
import { StationReducer } from '../../shared/stores/station/station.reducer';
import { StationsEffect } from '../../shared/stores/station/station.effect';
import { RouteReducer } from '../../shared/stores/route/route.reducer';
import { RouteEffect } from '../../shared/stores/route/route.effect';
import { RouteMapReducer } from '../../shared/stores/route-map/route-map.reducer';
import { RouteMapEffect } from '../../shared/stores/route-map/route-map.effect';
import { ScheduleFilterReducer } from '../../shared/stores/schedule-filter/schedule-filter.reducer';
import { ScheduleFilterEffect } from '../../shared/stores/schedule-filter/schedule-filter.effect';

const routes: Routes = [{ path: '', component: HomeComponent }];

@NgModule({
  declarations: [HomeComponent, HomeBookingComponent, StationHomeComponent],
  imports: [
    SharedModule,
    RouterModule.forChild(routes),

    // Store
    StoreModule.forFeature('stationList', StationReducer),
    StoreModule.forFeature('routeList', RouteReducer),
    StoreModule.forFeature('routeMapList', RouteMapReducer),
    StoreModule.forFeature('scheduleFilter', ScheduleFilterReducer),
    EffectsModule.forFeature([
      StationsEffect,
      RouteEffect,
      RouteMapEffect,
      ScheduleFilterEffect,
    ]),

    // Add-ons
    CalendarModule,

    // Components
    DropdownObrsComponent,
    DropdownObrsPassengerComponent,
  ],
  exports: [
    HomeBookingComponent,
    DropdownObrsComponent,
    DropdownObrsPassengerComponent,
  ],
})
export class HomeModule {}
