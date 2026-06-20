import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CalendarModule } from 'primeng/calendar';
import { SharedModule } from '../../shared/shared.module';
import { AdminLayoutComponent } from './admin-layout.component';
import { DashboardPageComponent } from './pages/dashboard/dashboard-page.component';
import { LookupSettingsPageComponent } from './pages/lookup-settings/lookup-settings-page.component';
import { RoleManagementPageComponent } from './pages/role-management/role-management-page.component';
import { UserManagementPageComponent } from './pages/user-management/user-management-page.component';
import { VehiclesPageComponent } from './pages/vehicles/vehicles-page.component';
import { RoutesPageComponent } from './pages/routes/routes-page.component';
import { SchedulesPageComponent } from './pages/schedules/schedules-page.component';
import { BookingsPageComponent } from './pages/bookings/bookings-page.component';
import { AdminDropdownComponent } from './components/admin-dropdown/admin-dropdown.component';
import { AdminRefreshHintComponent } from './components/admin-refresh-hint/admin-refresh-hint.component';
import { AdminModalBackdropDirective } from './components/admin-modal-backdrop.directive';

const routes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        component: DashboardPageComponent,
        data: { titleKey: 'ADMIN.PAGES.DASHBOARD' },
      },
      {
        path: 'lookups',
        component: LookupSettingsPageComponent,
        data: { titleKey: 'ADMIN.PAGES.LOOKUP_SETTINGS' },
      },
      {
        path: 'roles',
        component: RoleManagementPageComponent,
        data: { titleKey: 'ADMIN.PAGES.ROLE_MANAGEMENT' },
      },
      {
        path: 'users',
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
      // Back-compat redirects for the pre-standardization paths, so existing
      // bookmarks/deep links to the old admin URLs keep working.
      { path: 'lookup-settings', redirectTo: 'lookups', pathMatch: 'full' },
      { path: 'role-management', redirectTo: 'roles', pathMatch: 'full' },
      { path: 'user-management', redirectTo: 'users', pathMatch: 'full' },
    ],
  },
];

@NgModule({
  declarations: [
    AdminLayoutComponent,
    DashboardPageComponent,
    LookupSettingsPageComponent,
    RoleManagementPageComponent,
    UserManagementPageComponent,
    VehiclesPageComponent,
    RoutesPageComponent,
    SchedulesPageComponent,
    BookingsPageComponent,
    AdminDropdownComponent,
    AdminRefreshHintComponent,
    AdminModalBackdropDirective,
  ],
  imports: [SharedModule, RouterModule.forChild(routes), CalendarModule],
})
export class AdminModule {}
