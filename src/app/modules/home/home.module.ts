// Modules
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { DatePickerModule } from 'primeng/datepicker';
import { GoogleMapsModule } from '@angular/google-maps';
import { TabsModule } from 'primeng/tabs';
import { ButtonModule } from 'primeng/button';
import { BadgeModule } from 'primeng/badge';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { CardModule } from 'primeng/card';
import { SelectButtonModule } from 'primeng/selectbutton';

// Components
import { HomeComponent } from './home.component';
import { HomeBookingComponent } from './components/home-booking/home-booking.component';
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownObrsPassengerComponent } from './components/dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import { StationHomeComponent } from './components/station-home/station-home.component';
import { DropdownGroupObrsComponent } from '../../shared/components/dropdown-group-obrs/dropdown-group-obrs.component';
import { RecentRoutesQuickPickComponent } from './components/recent-routes-quick-pick/recent-routes-quick-pick.component';

// Route-Map Components
import { RouteMapHomeComponent } from './components/route-map/route-map-home/route-map-home.component';
import { RouteStopListModule } from './components/route-map/route-stop-list/route-stop-list.module';
import { RouteMapPanelComponent } from './components/route-map/route-map-panel/route-map-panel.component';
import { RouteStopDetailCardComponent } from './components/route-map/route-stop-detail-card/route-stop-detail-card.component';
import { RouteTravelSummaryComponent } from './components/route-map/route-travel-summary/route-travel-summary.component';

import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { ProvinceReducer } from '../../shared/stores/station/station.reducer';
import { ProvinceEffect } from '../../shared/stores/station/station.effect';
import { ScheduleFilterReducer } from '../../shared/stores/schedule-filter/schedule-filter.reducer';
import { ScheduleFilterEffect } from '../../shared/stores/schedule-filter/schedule-filter.effect';


const routes: Routes = [{ path: '', component: HomeComponent }];

@NgModule({
  declarations: [
    HomeComponent,
    HomeBookingComponent,
    StationHomeComponent,
    RouteMapHomeComponent,
    RouteMapPanelComponent,
    RouteStopDetailCardComponent,
    RouteTravelSummaryComponent,
  ],
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
    DatePickerModule,
    GoogleMapsModule,
    TabsModule,
    ButtonModule,
    BadgeModule,
    ProgressSpinnerModule,
    CardModule,
    SelectButtonModule,

    // Components
    DropdownObrsComponent,
    DropdownGroupObrsComponent,
    DropdownObrsPassengerComponent,
    RecentRoutesQuickPickComponent,
    RouteStopListModule,
  ],
  exports: [
    HomeBookingComponent,
    DropdownObrsComponent,
    DropdownObrsPassengerComponent,
  ],
})
export class HomeModule {}


