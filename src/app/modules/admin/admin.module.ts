import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CalendarModule } from 'primeng/calendar';
import { SharedModule } from '../../shared/shared.module';
import { AdminSharedModule } from './admin-shared.module';
import { AdminLayoutComponent } from './admin-layout.component';
import { DashboardPageComponent } from './pages/dashboard/dashboard-page.component';
import { LookupSettingsPageComponent } from './pages/lookup-settings/lookup-settings-page.component';
import { RoleManagementPageComponent } from './pages/role-management/role-management-page.component';
import { UserManagementPageComponent } from './pages/user-management/user-management-page.component';
import { VehiclesPageComponent } from './pages/vehicles/vehicles-page.component';
import { RoutesPageComponent } from './pages/routes/routes-page.component';
import { RouteFormModalComponent } from './pages/routes/route-form-modal/route-form-modal.component';
import { SegmentEditModalComponent } from './pages/routes/segment-edit-modal/segment-edit-modal.component';
import { RouteDetailPanelComponent } from './pages/routes/route-detail-panel/route-detail-panel.component';
import { RouteListTableComponent } from './pages/routes/route-list-table/route-list-table.component';
import { SchedulesPageComponent } from './pages/schedules/schedules-page.component';
import { BookingsPageComponent } from './pages/bookings/bookings-page.component';
import { AdminModalBackdropDirective } from './components/admin-modal-backdrop.directive';
import { UsabilityReportsPageComponent } from './pages/usability-reports/usability-reports-page.component';
import { PromotionsPageComponent } from './pages/promotions/promotions-page.component';
import { RoundTripPromotionCardComponent } from './pages/promotions/round-trip-promotion-card/round-trip-promotion-card.component';
import { ReportsPageComponent } from './pages/reports/reports-page.component';
import { AppVehicleMaintenancePanelComponent } from './pages/vehicles/vehicle-maintenance/vehicle-maintenance-panel.component';
import { AuthGuard } from '../../auth/auth.guard';

const routes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        component: DashboardPageComponent,
        data: { titleKey: 'ADMIN.PAGES.DASHBOARD', subtitleKey: 'ADMIN.DASHBOARD.SUBTITLE' },
      },
      {
        path: 'lookups',
        component: LookupSettingsPageComponent,
        data: { titleKey: 'ADMIN.PAGES.LOOKUP_SETTINGS', subtitleKey: 'ADMIN.LOOKUP.SUBTITLE' },
      },
      {
        path: 'roles',
        component: RoleManagementPageComponent,
        data: { titleKey: 'ADMIN.PAGES.ROLE_MANAGEMENT', subtitleKey: 'ADMIN.ROLES.SUBTITLE' },
      },
      {
        path: 'users',
        component: UserManagementPageComponent,
        data: { titleKey: 'ADMIN.PAGES.USER_MANAGEMENT', subtitleKey: 'ADMIN.USERS.SUBTITLE' },
      },
      {
        path: 'vehicles',
        component: VehiclesPageComponent,
        data: { titleKey: 'ADMIN.PAGES.VEHICLE_MANAGEMENT', subtitleKey: 'ADMIN.VEHICLES.SUBTITLE' },
      },
      {
        path: 'routes',
        component: RoutesPageComponent,
        data: { titleKey: 'ADMIN.PAGES.ROUTE_MANAGEMENT', subtitleKey: 'ADMIN.ROUTES.SUBTITLE' },
      },
      {
        path: 'schedules',
        component: SchedulesPageComponent,
        data: { titleKey: 'ADMIN.PAGES.SCHEDULES', subtitleKey: 'ADMIN.SCHEDULES.SUBTITLE' },
      },
      {
        path: 'bookings',
        component: BookingsPageComponent,
        data: { titleKey: 'ADMIN.PAGES.BOOKINGS_MANAGEMENT', subtitleKey: 'ADMIN.BOOKINGS.SUBTITLE' },
      },
      {
        path: 'promotions',
        component: PromotionsPageComponent,
        data: { titleKey: 'ADMIN.PAGES.PROMOTIONS', subtitleKey: 'ADMIN.PROMOTIONS.SUBTITLE' },
      },
      {
        path: 'usability-reports',
        component: UsabilityReportsPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.USABILITY_REPORTS',
          subtitleKey: 'ADMIN.USABILITY_REPORTS.SUBTITLE',
          requiredRoles: ['admin'],
        },
      },
      {
        path: 'reports',
        component: ReportsPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.REPORTS',
          subtitleKey: 'ADMIN.REPORTS.SUBTITLE',
          requiredRoles: ['admin'],
        },
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
    RouteFormModalComponent,
    SegmentEditModalComponent,
    RouteDetailPanelComponent,
    RouteListTableComponent,
    SchedulesPageComponent,
    BookingsPageComponent,
    AdminModalBackdropDirective,
    UsabilityReportsPageComponent,
    PromotionsPageComponent,
    RoundTripPromotionCardComponent,
    ReportsPageComponent,
    AppVehicleMaintenancePanelComponent,
  ],
  imports: [SharedModule, RouterModule.forChild(routes), CalendarModule, AdminSharedModule],
})
export class AdminModule {}
