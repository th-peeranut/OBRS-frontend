import { inject, NgModule } from '@angular/core';
import { Router, RouterModule, Routes, UrlTree } from '@angular/router';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TabsModule } from 'primeng/tabs';
import { BadgeModule } from 'primeng/badge';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { InputNumberModule } from 'primeng/inputnumber';
import { MenuModule } from 'primeng/menu';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { SharedModule } from '../../shared/shared.module';
import { AuthGuard } from '../../auth/auth.guard';
import { AuthService } from '../../auth/auth.service';
import { featureEnabledGuard } from '../../shared/guards/feature-flag.guard';
import { AdminSharedModule } from '../admin/admin-shared.module';
import { PassengerSeatModule } from '../passenger-info/passenger-seat.module';
import { ProvinceReducer } from '../../shared/stores/station/station.reducer';
import { ProvinceEffect } from '../../shared/stores/station/station.effect';

import { StaffLayoutComponent } from './staff-layout.component';
import { SellPageComponent } from './pages/sell/sell-page.component';
import { SellReceiptPageComponent } from './pages/sell-receipt/sell-receipt-page.component';
import { StaffSchedulesPageComponent } from './pages/staff-schedules/staff-schedules-page.component';
import { DriverSchedulesPageComponent } from './pages/driver-schedules/driver-schedules-page.component';
import { BoardingListPageComponent } from './pages/boarding-list/boarding-list-page.component';
import { BoardingEntryPageComponent } from './pages/boarding-entry/boarding-entry-page.component';
import { WalkInTripBrowserComponent } from './components/walk-in-trip-browser/walk-in-trip-browser.component';
import { WalkInCenterPanelComponent } from './components/walk-in-center-panel/walk-in-center-panel.component';
import { WalkInCheckoutComponent } from './components/walk-in-checkout/walk-in-checkout.component';
import { TripDetailsEditFormComponent } from './components/trip-details-edit/trip-details-edit-form/trip-details-edit-form.component';
import { InspectionPageComponent } from './pages/inspection/inspection-page.component';

// OBRS-305 Card 2 — parcel consigned intake + delivery handoff (staff-facing).
import { ParcelConsignPageComponent } from './pages/parcel-consign/parcel-consign-page.component';
import { ParcelConsignFormComponent } from './components/parcel-consign-form/parcel-consign-form.component';
import { ParcelIntakeResultPanelComponent } from './components/parcel-intake-result-panel/parcel-intake-result-panel.component';
import { ParcelWaybillPageComponent } from './pages/parcel-waybill/parcel-waybill-page.component';
import { ParcelWaybillPaperComponent } from './components/parcel-waybill-paper/parcel-waybill-paper.component';
import { ParcelDeliveryListPageComponent } from './pages/parcel-delivery-list/parcel-delivery-list-page.component';
import { ParcelCollectDialogComponent } from './components/parcel-collect-dialog/parcel-collect-dialog.component';

// OBRS-416 (Epic OBRS-302, Card 3b) — staff/driver physical parcel verification.
import { ParcelVerifyListPageComponent } from './pages/parcel-verify-list/parcel-verify-list-page.component';
import { ParcelVerifyDialogComponent } from './components/parcel-verify-dialog/parcel-verify-dialog.component';

// OBRS-574 — the two pages above now share one schedule picker and one tabbed
// page; the two entry pickers they used to have were deleted with this card.
import { ParcelScheduleEntryPageComponent } from './pages/parcel-schedule/parcel-schedule-entry-page.component';
import {
  ParcelScheduleTab,
  ParcelScheduleTabsPageComponent,
} from './pages/parcel-schedule/parcel-schedule-tabs-page.component';

/** Legacy `parcels/{verify,deliveries}/:scheduleId` → the merged page, on the
 * tab that URL used to be. Built as a `UrlTree` rather than a string so the
 * query param is encoded by the router, not by hand. */
function legacyParcelScheduleUrl(scheduleId: string, tab: ParcelScheduleTab): UrlTree {
  return inject(Router).createUrlTree(['/staff/parcels/schedule', scheduleId], {
    queryParams: { tab },
  });
}

// OBRS-424 — internal fleet live map (layer 1).
import { FleetMapPageComponent } from './pages/fleet-map/fleet-map-page.component';
import { FleetMapPanelComponent } from './components/fleet-map-panel/fleet-map-panel.component';
import { FleetVehicleStatusListComponent } from './components/fleet-vehicle-status-list/fleet-vehicle-status-list.component';
import { PhoneFormatPipe } from '../../shared/pipes/phone-format.pipe';

// OBRS-766 — counter (staff act-on-behalf) cancel: the first frontend caller
// of OBRS-661's ordinary act-on-behalf cancel and OBRS-669's cash
// second-person approval.
import { CounterCancelPageComponent } from './pages/counter-cancel/counter-cancel-page.component';
import { CounterCancelSearchFormComponent } from './pages/counter-cancel/counter-cancel-search-form/counter-cancel-search-form.component';
import { CounterCancelResultListComponent } from './pages/counter-cancel/counter-cancel-result-list/counter-cancel-result-list.component';
import { CounterCancelModalComponent } from './pages/counter-cancel/counter-cancel-modal/counter-cancel-modal.component';

// OBRS-960 — driver cash ledger panel (/staff/boarding/:scheduleId).
import { DriverCashPanelComponent } from './components/driver-cash-panel/driver-cash-panel.component';
import { DriverCashDaySummaryComponent } from './components/driver-cash-panel/driver-cash-day-summary/driver-cash-day-summary.component';
import { DriverCashAdvanceFormComponent } from './components/driver-cash-panel/driver-cash-advance-form/driver-cash-advance-form.component';
import { DriverCashPerHeadFormComponent } from './components/driver-cash-panel/driver-cash-per-head-form/driver-cash-per-head-form.component';
import { DriverCashExpenseFormComponent } from './components/driver-cash-panel/driver-cash-expense-form/driver-cash-expense-form.component';

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
        // OBRS-195/OBRS-188: a staff-owned, printable proof of a walk-in sale.
        // Deliberately NOT `data: { customerArea: true }` — this is a staff
        // page and only a salesperson should reach it, which `requiredRoles`
        // says and `customerArea` does not.
        // OBRS-1001 retired the ORIGINAL reason given here: `customerArea`
        // used to bounce staff outright (the `/e-ticket` failure OBRS-188 was
        // named for), and no longer does. The route is unchanged — but the
        // rationale above is the one that still holds, so it is written down
        // rather than left pointing at a hazard that has been deleted.
        path: 'sell/receipt/:bookingId',
        component: SellReceiptPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['salesperson'], titleKey: 'STAFF.PAGES.SELL_RECEIPT', subtitleKey: 'STAFF.SELL_RECEIPT.SUBTITLE' },
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
      {
        // OBRS-312: digital weekly vehicle inspection checklist — driver-only,
        // sibling of 'driver'/'boarding/:scheduleId' above.
        path: 'inspection',
        component: InspectionPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver'], titleKey: 'STAFF.PAGES.INSPECTION', subtitleKey: 'STAFF.INSPECTION.SUBTITLE' },
      },
      // OBRS-305 Card 2 (consigned) + OBRS-341 (carry-on-on-seat, mode toggle
      // on the SAME page) — the shell-owned title/subtitle must read true in
      // BOTH modes, since there is no per-mode route to carry a different
      // one. 'PARCEL_INTAKE'/'PARCEL_INTAKE.SUBTITLE' are deliberately
      // mode-neutral copy, not a per-mode swap mechanism (that would be more
      // machinery than this problem deserves) — see the OBRS-341 card.
      {
        path: 'parcels/consign',
        component: ParcelConsignPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['salesperson'], titleKey: 'STAFF.PAGES.PARCEL_INTAKE', subtitleKey: 'STAFF.PARCEL_INTAKE.SUBTITLE' },
      },
      {
        path: 'parcels/:id/waybill',
        component: ParcelWaybillPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['salesperson'], titleKey: 'STAFF.PAGES.PARCEL_WAYBILL', subtitleKey: 'STAFF.PARCEL_WAYBILL.SUBTITLE' },
      },
      // OBRS-574 — one schedule selection for both parcel jobs on a trip:
      // verifying boxes in (OBRS-416) and handing them over (OBRS-305). Those
      // shipped as two routes with two byte-for-byte identical entry pickers,
      // so a driver working one trip picked that trip twice per run. The
      // requiredRoles pair is unchanged from both — the role hierarchy already
      // admits salesperson/owner/admin over the backend's DRIVER-only endpoint
      // gate (the fleet-map comment below documents the same expansion).
      {
        path: 'parcels/schedule',
        component: ParcelScheduleEntryPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver', 'salesperson'], titleKey: 'STAFF.PAGES.PARCEL_SCHEDULE', subtitleKey: 'STAFF.PARCEL_SCHEDULE.ENTRY_SUBTITLE' },
      },
      {
        path: 'parcels/schedule/:scheduleId',
        component: ParcelScheduleTabsPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver', 'salesperson'], titleKey: 'STAFF.PAGES.PARCEL_SCHEDULE', subtitleKey: 'STAFF.PARCEL_SCHEDULE.TABS_SUBTITLE' },
      },
      // Legacy aliases. Both pairs of URLs shipped and may be bookmarked, so
      // they resolve rather than 404 — carrying the tab, because a detail
      // redirect that lands on the merged page's *default* tab would look like
      // it worked while showing the other half of the job.
      //
      // pathMatch: 'full' is load-bearing on the two bare ones. A child route
      // matches by PREFIX by default, so without it '/staff/parcels/verify/8'
      // matches 'parcels/verify' first, and the router appends the leftover
      // segment to the target — landing on '/staff/parcels/schedule/8' with no
      // tab, quietly skipping the :scheduleId rule two lines below.
      { path: 'parcels/deliveries', pathMatch: 'full', redirectTo: '/staff/parcels/schedule' },
      { path: 'parcels/verify', pathMatch: 'full', redirectTo: '/staff/parcels/schedule' },
      {
        path: 'parcels/deliveries/:scheduleId',
        redirectTo: ({ params }) => legacyParcelScheduleUrl(params['scheduleId'], 'handover'),
      },
      {
        path: 'parcels/verify/:scheduleId',
        redirectTo: ({ params }) => legacyParcelScheduleUrl(params['scheduleId'], 'verify'),
      },
      {
        // OBRS-424: internal fleet live map (layer 1). Single requiredRoles
        // entry, per the sell/schedules precedent — ROLE_GRANTS already
        // expands this to salesperson+owner+admin; 'owner'/'admin' would be
        // inert and 'driver' must stay excluded (UX-OBRS-424 §1).
        // OBRS-622: gated behind environment.features.fleetMap (go-live scope
        // cut) — featureEnabledGuard runs AFTER AuthGuard so auth/role checks
        // still gate first; flag off redirects to home.
        path: 'fleet-map',
        component: FleetMapPageComponent,
        canActivate: [AuthGuard, featureEnabledGuard('fleetMap')],
        data: { requiredRoles: ['salesperson'], titleKey: 'STAFF.PAGES.FLEET_MAP', subtitleKey: 'STAFF.FLEET_MAP.SUBTITLE' },
      },
      {
        // OBRS-766: counter act-on-behalf cancel — salesperson only (never
        // driver), same requiredRoles shape as 'sell'/'schedules'.
        path: 'cancel-booking',
        component: CounterCancelPageComponent,
        canActivate: [AuthGuard],
        data: {
          requiredRoles: ['salesperson'],
          titleKey: 'STAFF.PAGES.CANCEL_BOOKING',
          subtitleKey: 'STAFF.CANCEL_BOOKING.SUBTITLE',
        },
      },
    ],
  },
];

@NgModule({
  declarations: [
    StaffLayoutComponent,
    SellPageComponent,
    SellReceiptPageComponent,
    StaffSchedulesPageComponent,
    DriverSchedulesPageComponent,
    BoardingListPageComponent,
    BoardingEntryPageComponent,
    WalkInTripBrowserComponent,
    WalkInCenterPanelComponent,
    WalkInCheckoutComponent,
    TripDetailsEditFormComponent,
    InspectionPageComponent,
    ParcelConsignPageComponent,
    ParcelConsignFormComponent,
    ParcelIntakeResultPanelComponent,
    ParcelWaybillPageComponent,
    ParcelWaybillPaperComponent,
    ParcelDeliveryListPageComponent,
    ParcelCollectDialogComponent,
    ParcelVerifyListPageComponent,
    ParcelVerifyDialogComponent,
    ParcelScheduleEntryPageComponent,
    ParcelScheduleTabsPageComponent,
    FleetMapPageComponent,
    FleetMapPanelComponent,
    FleetVehicleStatusListComponent,
    CounterCancelPageComponent,
    CounterCancelSearchFormComponent,
    CounterCancelResultListComponent,
    CounterCancelModalComponent,
    DriverCashPanelComponent,
    DriverCashDaySummaryComponent,
    DriverCashAdvanceFormComponent,
    DriverCashPerHeadFormComponent,
    DriverCashExpenseFormComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(staffRoutes),
    DatePickerModule,
    SelectModule,
    TabsModule,
    BadgeModule,
    ProgressSpinnerModule,
    InputNumberModule,
    MenuModule,
    AdminSharedModule,
    PassengerSeatModule,
    PhoneFormatPipe,

    // Station list (stop dropdowns on the sell search step). Registered per
    // lazy module — same pattern as the public booking modules.
    StoreModule.forFeature('provinceWithStationList', ProvinceReducer),
    EffectsModule.forFeature([ProvinceEffect]),
  ],
})
export class StaffModule {}
