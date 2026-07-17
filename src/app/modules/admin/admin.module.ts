import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CalendarModule } from 'primeng/calendar';
import { InputSwitchModule } from 'primeng/inputswitch';
import { SharedModule } from '../../shared/shared.module';
import { AdminSharedModule } from './admin-shared.module';
import { AdminLayoutComponent } from './admin-layout.component';
import { DashboardPageComponent } from './pages/dashboard/dashboard-page.component';
import { LookupSettingsPageComponent } from './pages/lookup-settings/lookup-settings-page.component';
import { RoleManagementPageComponent } from './pages/role-management/role-management-page.component';
import { RoleListTableComponent } from './pages/role-management/role-list-table/role-list-table.component';
import { RoleFormModalComponent } from './pages/role-management/role-form-modal/role-form-modal.component';
import { RoleDeleteModalComponent } from './pages/role-management/role-delete-modal/role-delete-modal.component';
import { UserManagementPageComponent } from './pages/user-management/user-management-page.component';
import { UserListTableComponent } from './pages/user-management/user-list-table/user-list-table.component';
import { UserFormModalComponent } from './pages/user-management/user-form-modal/user-form-modal.component';
import { UserDeleteModalComponent } from './pages/user-management/user-delete-modal/user-delete-modal.component';
import { UserUnlockModalComponent } from './pages/user-management/user-unlock-modal/user-unlock-modal.component';
import { VehiclesPageComponent } from './pages/vehicles/vehicles-page.component';
import { VehicleListTableComponent } from './pages/vehicles/vehicle-list-table/vehicle-list-table.component';
import { VehicleFormModalComponent } from './pages/vehicles/vehicle-form-modal/vehicle-form-modal.component';
import { VehicleDeleteModalComponent } from './pages/vehicles/vehicle-delete-modal/vehicle-delete-modal.component';
import { RoutesPageComponent } from './pages/routes/routes-page.component';
import { RouteFormModalComponent } from './pages/routes/route-form-modal/route-form-modal.component';
import { SegmentEditModalComponent } from './pages/routes/segment-edit-modal/segment-edit-modal.component';
import { RouteDetailPanelComponent } from './pages/routes/route-detail-panel/route-detail-panel.component';
import { RouteListTableComponent } from './pages/routes/route-list-table/route-list-table.component';
import { SchedulesPageComponent } from './pages/schedules/schedules-page.component';
import { BookingsPageComponent } from './pages/bookings/bookings-page.component';
import { UsabilityReportsPageComponent } from './pages/usability-reports/usability-reports-page.component';
import { UsabilityReportDuplicatePickerComponent } from './pages/usability-reports/usability-report-duplicate-picker/usability-report-duplicate-picker.component';
import { PromotionsPageComponent } from './pages/promotions/promotions-page.component';
import { RoundTripPromotionCardComponent } from './pages/promotions/round-trip-promotion-card/round-trip-promotion-card.component';
import { PromotionListTableComponent } from './pages/promotions/promotion-list-table/promotion-list-table.component';
import { PromotionFormModalComponent } from './pages/promotions/promotion-form-modal/promotion-form-modal.component';
import { PromotionDeactivateModalComponent } from './pages/promotions/promotion-deactivate-modal/promotion-deactivate-modal.component';
import { ReportsPageComponent } from './pages/reports/reports-page.component';
import { EodSalesReportPageComponent } from './pages/eod-sales-report/eod-sales-report-page.component';
import { RefundVoidReportPageComponent } from './pages/refund-void-report/refund-void-report-page.component';
import { CashOnlineReconciliationReportPageComponent } from './pages/cash-online-reconciliation-report/cash-online-reconciliation-report-page.component';
import { AppVehicleMaintenancePanelComponent } from './pages/vehicles/vehicle-maintenance/vehicle-maintenance-panel.component';
import { SettlementsPageComponent } from './pages/settlements/settlements-page.component';
import { SettlementsListComponent } from './pages/settlements/settlements-list/settlements-list.component';
import { SettlementDetailModalComponent } from './pages/settlements/settlement-detail-modal/settlement-detail-modal.component';
import { ReminderConfigPageComponent } from './pages/reminder-config/reminder-config-page.component';
import { JumpSeatConfigPageComponent } from './pages/jump-seat-config/jump-seat-config-page.component';
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
      {
        path: 'settlements',
        component: SettlementsPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.SETTLEMENTS',
          subtitleKey: 'ADMIN.SETTLEMENTS.SUBTITLE',
          // OBRS-446: this does NOT exclude admin, despite how it reads —
          // AuthService.ROLE_GRANTS has admin granting owner, so ['owner'],
          // ['admin'] and ['admin', 'owner'] are one predicate here. Intent
          // only, inert until owner-scoping (OBRS-148/150).
          requiredRoles: ['owner'],
        },
      },
      {
        path: 'eod-sales-report',
        component: EodSalesReportPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.EOD_SALES_REPORT',
          subtitleKey: 'ADMIN.EOD_REPORT.SUBTITLE',
          requiredRoles: ['admin', 'owner'],
        },
      },
      {
        // OBRS-223: reminder-timing config, ADMIN-only (403 for non-admin
        // per the backend contract shipped by OBRS-139).
        path: 'reminder-config',
        component: ReminderConfigPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.REMINDER_CONFIG',
          subtitleKey: 'ADMIN.REMINDER_CONFIG.SUBTITLE',
          requiredRoles: ['admin'],
        },
      },
      {
        // OBRS-358: jump-seat (walk-in-only seat channel) toggle, ADMIN-only
        // (403 for non-admin) — mirrors reminder-config above.
        path: 'jump-seat-config',
        component: JumpSeatConfigPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.JUMP_SEAT_CONFIG',
          subtitleKey: 'ADMIN.JUMP_SEAT_CONFIG.SUBTITLE',
          requiredRoles: ['admin'],
        },
      },
      {
        path: 'refund-void-report',
        component: RefundVoidReportPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.REFUND_VOID_REPORT',
          subtitleKey: 'ADMIN.REFUND_VOID_REPORT.SUBTITLE',
          requiredRoles: ['admin', 'owner'],
        },
      },
      {
        path: 'cash-online-reconciliation-report',
        component: CashOnlineReconciliationReportPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.CASH_ONLINE_RECONCILIATION',
          subtitleKey: 'ADMIN.CASH_ONLINE_RECONCILIATION.SUBTITLE',
          requiredRoles: ['admin', 'owner'],
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
    RoleListTableComponent,
    RoleFormModalComponent,
    RoleDeleteModalComponent,
    UserManagementPageComponent,
    UserListTableComponent,
    UserFormModalComponent,
    UserDeleteModalComponent,
    UserUnlockModalComponent,
    VehiclesPageComponent,
    VehicleListTableComponent,
    VehicleFormModalComponent,
    VehicleDeleteModalComponent,
    RoutesPageComponent,
    RouteFormModalComponent,
    SegmentEditModalComponent,
    RouteDetailPanelComponent,
    RouteListTableComponent,
    SchedulesPageComponent,
    BookingsPageComponent,
    UsabilityReportsPageComponent,
    UsabilityReportDuplicatePickerComponent,
    PromotionsPageComponent,
    RoundTripPromotionCardComponent,
    PromotionListTableComponent,
    PromotionFormModalComponent,
    PromotionDeactivateModalComponent,
    ReportsPageComponent,
    EodSalesReportPageComponent,
    RefundVoidReportPageComponent,
    CashOnlineReconciliationReportPageComponent,
    AppVehicleMaintenancePanelComponent,
    SettlementsPageComponent,
    SettlementsListComponent,
    SettlementDetailModalComponent,
    ReminderConfigPageComponent,
    JumpSeatConfigPageComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(routes),
    CalendarModule,
    InputSwitchModule,
    AdminSharedModule,
  ],
})
export class AdminModule {}
