import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CalendarModule } from 'primeng/calendar';
import { DropdownModule } from 'primeng/dropdown';
import { TabViewModule } from 'primeng/tabview';
import { BadgeModule } from 'primeng/badge';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { SharedModule } from '../../shared/shared.module';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminSharedModule } from '../admin/admin-shared.module';
import { PassengerSeatModule } from '../passenger-info/passenger-seat.module';
import { ProvinceReducer } from '../../shared/stores/station/station.reducer';
import { ProvinceEffect } from '../../shared/stores/station/station.effect';

import { StaffLayoutComponent } from './staff-layout.component';
import { SellPageComponent } from './pages/sell/sell-page.component';
import { StaffSchedulesPageComponent } from './pages/staff-schedules/staff-schedules-page.component';
import { DriverSchedulesPageComponent } from './pages/driver-schedules/driver-schedules-page.component';
import { BoardingListPageComponent } from './pages/boarding-list/boarding-list-page.component';
import { BoardingEntryPageComponent } from './pages/boarding-entry/boarding-entry-page.component';
import { WalkInTripBrowserComponent } from './components/walk-in-trip-browser/walk-in-trip-browser.component';
import { WalkInCenterPanelComponent } from './components/walk-in-center-panel/walk-in-center-panel.component';
import { WalkInCheckoutComponent } from './components/walk-in-checkout/walk-in-checkout.component';

export const staffRoutes: Routes = [
  {
    path: '',
    component: StaffLayoutComponent,
    children: [
      { path: '', redirectTo: 'sell', pathMatch: 'full' },
      {
        path: 'sell',
        component: SellPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['salesperson'], titleKey: 'STAFF.PAGES.SELL', subtitleKey: 'STAFF.SELL.SUBTITLE' },
      },
      {
        path: 'schedules',
        component: StaffSchedulesPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['salesperson'], titleKey: 'STAFF.PAGES.SCHEDULES', subtitleKey: 'STAFF.SCHEDULES.SUBTITLE' },
      },
      {
        path: 'driver',
        component: DriverSchedulesPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver'], titleKey: 'STAFF.PAGES.DRIVER', subtitleKey: 'STAFF.DRIVER.SUBTITLE' },
      },
      {
        path: 'boarding',
        component: BoardingEntryPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver', 'salesperson'], titleKey: 'STAFF.PAGES.BOARDING', subtitleKey: 'STAFF.BOARDING_ENTRY.SUBTITLE' },
      },
      {
        path: 'boarding/:scheduleId',
        component: BoardingListPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver', 'salesperson'], titleKey: 'STAFF.PAGES.BOARDING', subtitleKey: 'STAFF.BOARDING.SUBTITLE' },
      },
    ],
  },
];

@NgModule({
  declarations: [
    StaffLayoutComponent,
    SellPageComponent,
    StaffSchedulesPageComponent,
    DriverSchedulesPageComponent,
    BoardingListPageComponent,
    BoardingEntryPageComponent,
    WalkInTripBrowserComponent,
    WalkInCenterPanelComponent,
    WalkInCheckoutComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(staffRoutes),
    CalendarModule,
    DropdownModule,
    TabViewModule,
    BadgeModule,
    ProgressSpinnerModule,
    AdminSharedModule,
    PassengerSeatModule,

    // Station list (stop dropdowns on the sell search step). Registered per
    // lazy module — same pattern as the public booking modules.
    StoreModule.forFeature('provinceWithStationList', ProvinceReducer),
    EffectsModule.forFeature([ProvinceEffect]),
  ],
})
export class StaffModule {}
