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

// Store
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { RouteMapEffect } from '../../shared/stores/route-map/route-map.effect';
import { RouteMapReducer } from '../../shared/stores/route-map/route-map.reducer';
import { RouteEffect } from '../../shared/stores/route/route.effect';
import { RouteReducer } from '../../shared/stores/route/route.reducer';
import { ScheduleFilterEffect } from '../../shared/stores/schedule-filter/schedule-filter.effect';
import { ScheduleFilterReducer } from '../../shared/stores/schedule-filter/schedule-filter.reducer';
import { StationsEffect } from '../../shared/stores/station/station.effect';
import { StationReducer } from '../../shared/stores/station/station.reducer';
import { ScheduleListEffect } from '../../shared/stores/schedule-list/schedule-list.effect';
import { ScheduleListReducer } from '../../shared/stores/schedule-list/schedule-list.reducer';

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
    StoreModule.forFeature('stationList', StationReducer),
    StoreModule.forFeature('routeList', RouteReducer),
    StoreModule.forFeature('routeMapList', RouteMapReducer),
    StoreModule.forFeature('scheduleFilter', ScheduleFilterReducer),
    StoreModule.forFeature('scheduleList', ScheduleListReducer),
    EffectsModule.forFeature([
      StationsEffect,
      RouteEffect,
      RouteMapEffect,
      ScheduleFilterEffect,
      ScheduleListEffect,
    ]),

    // Add-ons
    CalendarModule,

    // Components
    DropdownObrsComponent,
    DropdownObrsPassengerComponent,
  ],
})
export class ScheduleBookingModule {}
