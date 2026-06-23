import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CalendarModule } from 'primeng/calendar';
import { SharedModule } from '../../shared/shared.module';
import { AuthGuard } from '../../auth/auth.guard';
import { AdminSharedModule } from '../admin/admin-shared.module';
import { PassengerInfoModule } from '../passenger-info/passenger-info.module';

import { StaffLayoutComponent } from './staff-layout.component';
import { SellPageComponent } from './pages/sell/sell-page.component';
import { StaffSchedulesPageComponent } from './pages/staff-schedules/staff-schedules-page.component';
import { DriverSchedulesPageComponent } from './pages/driver-schedules/driver-schedules-page.component';
import { BoardingListPageComponent } from './pages/boarding-list/boarding-list-page.component';
import { BoardingEntryPageComponent } from './pages/boarding-entry/boarding-entry-page.component';

const routes: Routes = [
  {
    path: '',
    component: StaffLayoutComponent,
    children: [
      { path: '', redirectTo: 'sell', pathMatch: 'full' },
      {
        path: 'sell',
        component: SellPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['salesperson'], titleKey: 'STAFF.PAGES.SELL' },
      },
      {
        path: 'schedules',
        component: StaffSchedulesPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['salesperson'], titleKey: 'STAFF.PAGES.SCHEDULES' },
      },
      {
        path: 'driver',
        component: DriverSchedulesPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver'], titleKey: 'STAFF.PAGES.DRIVER' },
      },
      {
        path: 'boarding',
        component: BoardingEntryPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver', 'salesperson'], titleKey: 'STAFF.PAGES.BOARDING' },
      },
      {
        path: 'boarding/:scheduleId',
        component: BoardingListPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver', 'salesperson'], titleKey: 'STAFF.PAGES.BOARDING' },
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
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(routes),
    CalendarModule,
    AdminSharedModule,
    PassengerInfoModule,
  ],
})
export class StaffModule {}
