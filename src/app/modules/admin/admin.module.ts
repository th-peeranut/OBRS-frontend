import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { AdminLayoutComponent } from './admin-layout.component';
import { LookupSettingsPageComponent } from './pages/lookup-settings/lookup-settings-page.component';
import { RoleManagementPageComponent } from './pages/role-management/role-management-page.component';
import { UserManagementPageComponent } from './pages/user-management/user-management-page.component';
import { VehiclesPageComponent } from './pages/vehicles/vehicles-page.component';
import { RoutesPageComponent } from './pages/routes/routes-page.component';
import { SchedulesPageComponent } from './pages/schedules/schedules-page.component';
import { BookingsPageComponent } from './pages/bookings/bookings-page.component';

const routes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: '', redirectTo: 'lookup-settings', pathMatch: 'full' },
      {
        path: 'lookup-settings',
        component: LookupSettingsPageComponent,
        data: { titleKey: 'ADMIN.PAGES.LOOKUP_SETTINGS' },
      },
      {
        path: 'role-management',
        component: RoleManagementPageComponent,
        data: { titleKey: 'ADMIN.PAGES.ROLE_MANAGEMENT' },
      },
      {
        path: 'user-management',
        component: UserManagementPageComponent,
        data: { titleKey: 'ADMIN.PAGES.USER_MANAGEMENT' },
      },
      {
        path: 'vehicles',
        component: VehiclesPageComponent,
        data: { titleKey: 'ADMIN.PAGES.VEHICLE_MANAGEMENT' },
      },
      {
        path: 'routes',
        component: RoutesPageComponent,
        data: { titleKey: 'ADMIN.PAGES.ROUTE_MANAGEMENT' },
      },
      {
        path: 'schedules',
        component: SchedulesPageComponent,
        data: { titleKey: 'ADMIN.PAGES.SCHEDULES' },
      },
      {
        path: 'bookings',
        component: BookingsPageComponent,
        data: { titleKey: 'ADMIN.PAGES.BOOKINGS_MANAGEMENT' },
      },
    ],
  },
];

@NgModule({
  declarations: [
    AdminLayoutComponent,
    LookupSettingsPageComponent,
    RoleManagementPageComponent,
    UserManagementPageComponent,
    VehiclesPageComponent,
    RoutesPageComponent,
    SchedulesPageComponent,
    BookingsPageComponent,
  ],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class AdminModule {}
