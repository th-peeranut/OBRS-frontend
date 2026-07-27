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
import { RevenueAnalyticsPageComponent } from './pages/revenue-analytics/revenue-analytics-page.component';
import { BookingTrendPageComponent } from './pages/booking-trend/booking-trend-page.component';
import { EodSalesReportPageComponent } from './pages/eod-sales-report/eod-sales-report-page.component';
import { RefundVoidReportPageComponent } from './pages/refund-void-report/refund-void-report-page.component';
import { CashOnlineReconciliationReportPageComponent } from './pages/cash-online-reconciliation-report/cash-online-reconciliation-report-page.component';
import { AppVehicleMaintenancePanelComponent } from './pages/vehicles/vehicle-maintenance/vehicle-maintenance-panel.component';
import { AppVehicleInspectionPanelComponent } from './pages/vehicles/vehicle-inspection/vehicle-inspection-panel.component';
import { SettlementsPageComponent } from './pages/settlements/settlements-page.component';
import { SettlementsListComponent } from './pages/settlements/settlements-list/settlements-list.component';
import { SettlementDetailModalComponent } from './pages/settlements/settlement-detail-modal/settlement-detail-modal.component';
import { ReminderConfigPageComponent } from './pages/reminder-config/reminder-config-page.component';
import { JumpSeatConfigPageComponent } from './pages/jump-seat-config/jump-seat-config-page.component';
import { BookingPolicyConfigPageComponent } from './pages/booking-policy-config/booking-policy-config-page.component';
import { ConfigChangeHistoryPageComponent } from './pages/config-change-history/config-change-history-page.component';
import { CargoCapacityPageComponent } from './pages/cargo-capacity/cargo-capacity-page.component';
import { InspectionItemsPageComponent } from './pages/inspection-items/inspection-items-page.component';
import { ExpensesPageComponent } from './pages/expenses/expenses-page.component';
import { ExpenseListTableComponent } from './pages/expenses/expense-list-table/expense-list-table.component';
import { ExpenseFormModalComponent } from './pages/expenses/expense-form-modal/expense-form-modal.component';
import { ExpenseDeleteModalComponent } from './pages/expenses/expense-delete-modal/expense-delete-modal.component';
import { AuthGuard } from '../../auth/auth.guard';

// OBRS-543: exported (was module-private) so staff-nav-reachability.spec.ts can
// assert against the REAL route list rather than a hand-mirrored copy — the same
// reason staff.module.ts exports `staffRoutes`. A mirrored copy would drift with
// exactly the change the sweep exists to catch.
export const adminRoutes: Routes = [
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
        // OBRS-508: parcel cargo capacity settings, OWNER-only (the backend
        // PUT /vehicle-types/{id} requires OWNER; ADMIN inherits it via
        // ROLE_GRANTS — same gating shape as settlements/reminder-config).
        path: 'cargo-capacity',
        component: CargoCapacityPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.CARGO_CAPACITY',
          subtitleKey: 'ADMIN.CARGO_CAPACITY.SUBTITLE',
          requiredRoles: ['owner'],
        },
      },
      {
        // OBRS-509: vehicle-inspection checklist master list, OWNER-only
        // (the backend GET/POST/PUT/reorder all require OWNER; ADMIN inherits
        // via ROLE_GRANTS) — same gating shape as cargo-capacity above.
        path: 'inspection-items',
        component: InspectionItemsPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.INSPECTION_ITEMS',
          subtitleKey: 'ADMIN.INSPECTION_ITEMS.SUBTITLE',
          requiredRoles: ['owner'],
        },
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
        path: 'revenue-analytics',
        component: RevenueAnalyticsPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.REVENUE_ANALYTICS',
          subtitleKey: 'ADMIN.REVENUE_ANALYTICS.SUBTITLE',
          requiredRoles: ['admin'],
        },
      },
      {
        path: 'booking-trend',
        component: BookingTrendPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.BOOKING_TREND',
          subtitleKey: 'ADMIN.BOOKING_TREND.SUBTITLE',
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
        // OBRS-564: booking-policy config (advance-booking cap in days,
        // minutes-before-departure cutoff) — the backend PUT guard is
        // hasRole('OWNER'); ROLE_GRANTS admits ADMIN automatically (OBRS-446
        // comment on AuthService), so ['admin','owner'] states that intent
        // honestly rather than excluding admin.
        path: 'booking-policy-config',
        component: BookingPolicyConfigPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.BOOKING_POLICY_CONFIG',
          subtitleKey: 'ADMIN.BOOKING_POLICY_CONFIG.SUBTITLE',
          requiredRoles: ['admin', 'owner'],
        },
      },
      {
        // OBRS-576: one general config-change-history page under ระบบ,
        // covering every config key (not a panel inside booking-policy-config)
        // — access mirrors booking-policy-config's own guard, since reading
        // the history is granted to the same roles that can write it.
        path: 'config-change-history',
        component: ConfigChangeHistoryPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.CONFIG_CHANGE_HISTORY',
          subtitleKey: 'ADMIN.CONFIG_CHANGE_HISTORY.SUBTITLE',
          requiredRoles: ['admin', 'owner'],
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
      {
        // OBRS-685: vehicle/central expense log — admin+owner (backend 403s
        // salesperson on every endpoint), same audience/shape as
        // eod-sales-report above (whole always-shown admin+owner nav, not a
        // further-restricted owner-only page like settlements).
        path: 'expenses',
        component: ExpensesPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.EXPENSES',
          subtitleKey: 'ADMIN.EXPENSES.SUBTITLE',
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
    RevenueAnalyticsPageComponent,
    BookingTrendPageComponent,
    EodSalesReportPageComponent,
    RefundVoidReportPageComponent,
    CashOnlineReconciliationReportPageComponent,
    AppVehicleMaintenancePanelComponent,
    AppVehicleInspectionPanelComponent,
    SettlementsPageComponent,
    SettlementsListComponent,
    SettlementDetailModalComponent,
    ReminderConfigPageComponent,
    JumpSeatConfigPageComponent,
    BookingPolicyConfigPageComponent,
    ConfigChangeHistoryPageComponent,
    CargoCapacityPageComponent,
    InspectionItemsPageComponent,
    ExpensesPageComponent,
    ExpenseListTableComponent,
    ExpenseFormModalComponent,
    ExpenseDeleteModalComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(adminRoutes),
    CalendarModule,
    InputSwitchModule,
    AdminSharedModule,
  ],
})
export class AdminModule {}
