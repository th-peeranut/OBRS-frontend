import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DatePickerModule } from 'primeng/datepicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
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
import { OverrideCancelModalComponent } from './pages/bookings/override-cancel-modal/override-cancel-modal.component';
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
import { RoutePerformancePageComponent } from './pages/route-performance/route-performance-page.component';
import { CustomerBehaviorPageComponent } from './pages/customer-behavior/customer-behavior-page.component';
import { OpsEfficiencyPageComponent } from './pages/ops-efficiency/ops-efficiency-page.component';
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
import { SystemSettingsPageComponent } from './pages/system-settings/system-settings-page.component';
import {
  SYSTEM_SETTINGS_ROLES,
  SYSTEM_SETTINGS_TABS,
} from './pages/system-settings/system-settings-tabs';
import { CargoCapacityPageComponent } from './pages/cargo-capacity/cargo-capacity-page.component';
import { InspectionItemsPageComponent } from './pages/inspection-items/inspection-items-page.component';
import { ExpensesPageComponent } from './pages/expenses/expenses-page.component';
import { ExpenseListTableComponent } from './pages/expenses/expense-list-table/expense-list-table.component';
import { ExpenseFormModalComponent } from './pages/expenses/expense-form-modal/expense-form-modal.component';
import { ExpenseDeleteModalComponent } from './pages/expenses/expense-delete-modal/expense-delete-modal.component';
// OBRS-286 — manual refund worklist (AC-2/AC-3), owner-only.
import { ManualRefundWorklistPageComponent } from './pages/manual-refund-worklist/manual-refund-worklist-page.component';
import { CashRefundApprovalsPageComponent } from './pages/cash-refund-approvals/cash-refund-approvals-page.component';
import { MarkRefundedModalComponent } from './pages/manual-refund-worklist/mark-refunded-modal/mark-refunded-modal.component';
// OBRS-960 — driver cash ledger + parcel revenue share.
import { DriverCashDaysListComponent } from './pages/settlements/driver-cash-days-list/driver-cash-days-list.component';
import { DriverCashDayReturnModalComponent } from './pages/settlements/driver-cash-day-return-modal/driver-cash-day-return-modal.component';
import { ParcelShareConfigPageComponent } from './pages/parcel-share-config/parcel-share-config-page.component';
import { DriverCashRatesPageComponent } from './pages/driver-cash-rates/driver-cash-rates-page.component';
import { AuthGuard } from '../../auth/auth.guard';
import { CanDeactivateGuard } from '../../shared/guards/can-deactivate.guard';
import { PhoneFormatPipe } from '../../shared/pipes/phone-format.pipe';

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
        path: 'route-performance',
        component: RoutePerformancePageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.ROUTE_PERFORMANCE',
          subtitleKey: 'ADMIN.ROUTE_PERFORMANCE.SUBTITLE',
          requiredRoles: ['admin'],
        },
      },
      {
        path: 'customer-behavior',
        component: CustomerBehaviorPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.CUSTOMER_BEHAVIOR',
          subtitleKey: 'ADMIN.CUSTOMER_BEHAVIOR.SUBTITLE',
          requiredRoles: ['admin'],
        },
      },
      {
        path: 'ops-efficiency',
        component: OpsEfficiencyPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.OPS_EFFICIENCY',
          subtitleKey: 'ADMIN.OPS_EFFICIENCY.SUBTITLE',
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
        // OBRS-702: ONE "System settings" page for what used to be four
        // sidebar entries over a single table (`system_configs`) — booking
        // policy (OBRS-564), reminder timing (OBRS-223), jump seat (OBRS-358)
        // and the change history (OBRS-576), each now a tab.
        //
        // Children, tab strip and legacy redirects are all generated from
        // SYSTEM_SETTINGS_TABS, so they cannot drift apart. Each child keeps
        // the EXACT `requiredRoles` its standalone route carried and the shell
        // admits their union — access is unchanged in both directions. (Those
        // values differ on paper but not in effect: ROLE_GRANTS makes ['admin']
        // and ['admin','owner'] one predicate today. See the note on
        // SystemSettingsTab.requiredRoles before reading them as two gates.)
        path: 'settings',
        component: SystemSettingsPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.SYSTEM_SETTINGS',
          subtitleKey: 'ADMIN.SYSTEM_SETTINGS.SUBTITLE',
          requiredRoles: SYSTEM_SETTINGS_ROLES,
        },
        children: [
          // Safe for every visitor the shell admits: the first tab's roles are
          // the shell's own union (asserted in system-settings-page.component.spec.ts).
          { path: '', redirectTo: SYSTEM_SETTINGS_TABS[0].path, pathMatch: 'full' },
          ...SYSTEM_SETTINGS_TABS.map((tab) => ({
            path: tab.path,
            component: tab.component,
            canActivate: [AuthGuard],
            // Prompts before dropping an edit the user never saved. Inert on a
            // tab whose component implements no canDeactivate() (the read-only
            // history), by CanDeactivateGuard's own contract.
            canDeactivate: [CanDeactivateGuard],
            data: {
              // Same page title on every tab — the tab strip already says which
              // one is open, and getDeepestRoute() reads the CHILD's data.
              titleKey: 'ADMIN.PAGES.SYSTEM_SETTINGS',
              subtitleKey: tab.subtitleKey,
              requiredRoles: tab.requiredRoles,
            },
          })),
        ],
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
      {
        // OBRS-286: manual refund worklist — OWNER-only (the backend GET
        // /payments/refunds/pending is `hasRole('OWNER')`, K9), same gating
        // shape as settlements/cargo-capacity above.
        path: 'manual-refunds',
        component: ManualRefundWorklistPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.MANUAL_REFUNDS',
          subtitleKey: 'ADMIN.MANUAL_REFUNDS.SUBTITLE',
          requiredRoles: ['owner'],
        },
      },
      {
        // OBRS-844: the cash-refund step-up worklist — OWNER-only, matching
        // both backend doors it reads (`hasRole('OWNER')` on
        // CashRefundApprovalController). Deliberately NOT ['admin','owner']:
        // an admin owns no fleet, so the list is empty for them by
        // construction, and offering the page would suggest otherwise.
        path: 'cash-refund-approvals',
        component: CashRefundApprovalsPageComponent,
        canActivate: [AuthGuard],
        data: {
          titleKey: 'ADMIN.PAGES.CASH_REFUND_APPROVALS',
          subtitleKey: 'ADMIN.CASH_REFUND_APPROVALS.SUBTITLE',
          requiredRoles: ['owner'],
        },
      },
      // Back-compat redirects for the pre-standardization paths, so existing
      // bookmarks/deep links to the old admin URLs keep working.
      { path: 'lookup-settings', redirectTo: 'lookups', pathMatch: 'full' },
      { path: 'role-management', redirectTo: 'roles', pathMatch: 'full' },
      { path: 'user-management', redirectTo: 'users', pathMatch: 'full' },
      // OBRS-702: the four standalone config pages are tabs now. Generated
      // from the same table as the tabs themselves, so a tab can never be
      // added without its old URL still landing somewhere.
      ...SYSTEM_SETTINGS_TABS.map((tab) => ({
        path: tab.legacyPath,
        redirectTo: `settings/${tab.path}`,
        pathMatch: 'full' as const,
      })),
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
    OverrideCancelModalComponent,
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
    RoutePerformancePageComponent,
    CustomerBehaviorPageComponent,
    OpsEfficiencyPageComponent,
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
    SystemSettingsPageComponent,
    CargoCapacityPageComponent,
    InspectionItemsPageComponent,
    ExpensesPageComponent,
    ExpenseListTableComponent,
    ExpenseFormModalComponent,
    ExpenseDeleteModalComponent,
    ManualRefundWorklistPageComponent,
    CashRefundApprovalsPageComponent,
    MarkRefundedModalComponent,
    DriverCashDaysListComponent,
    DriverCashDayReturnModalComponent,
    ParcelShareConfigPageComponent,
    DriverCashRatesPageComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(adminRoutes),
    DatePickerModule,
    ToggleSwitchModule,
    AdminSharedModule,
    PhoneFormatPipe,
  ],
})
export class AdminModule {}
