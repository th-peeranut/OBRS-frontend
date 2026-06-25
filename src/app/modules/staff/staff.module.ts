import { inject, NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CalendarModule } from 'primeng/calendar';
import { DropdownModule } from 'primeng/dropdown';
import { TabViewModule } from 'primeng/tabview';
import { BadgeModule } from 'primeng/badge';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { InputNumberModule } from 'primeng/inputnumber';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { SharedModule } from '../../shared/shared.module';
import { AuthGuard } from '../../auth/auth.guard';
import { AuthService } from '../../auth/auth.service';
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
import { TripDetailsViewComponent } from './components/trip-details-edit/trip-details-view/trip-details-view.component';
import { TripDetailsEditFormComponent } from './components/trip-details-edit/trip-details-edit-form/trip-details-edit-form.component';

export const staffRoutes: Routes = [
  {
    path: '',
    component: StaffLayoutComponent,
    children: [
      // Role-aware default landing: the staff portal is shared by salespersons
      // and drivers, but the sell desk is salesperson-only. A static redirect to
      // 'sell' bounces drivers off the salesperson guard, so pick the landing by
      // role — salesperson/admin → sell, driver → driver schedules.
      {
        path: '',
        pathMatch: 'full',
        redirectTo: () =>
          inject(AuthService).hasAnyRole(['salesperson']) ? 'sell' : 'driver',
      },
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
    TripDetailsViewComponent,
    TripDetailsEditFormComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(staffRoutes),
    CalendarModule,
    DropdownModule,
    TabViewModule,
    BadgeModule,
    ProgressSpinnerModule,
    InputNumberModule,
    AdminSharedModule,
    PassengerSeatModule,

    // Station list (stop dropdowns on the sell search step). Registered per
    // lazy module — same pattern as the public booking modules.
    StoreModule.forFeature('provinceWithStationList', ProvinceReducer),
    EffectsModule.forFeature([ProvinceEffect]),
  ],
})
export class StaffModule {}
