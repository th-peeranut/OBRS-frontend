import { inject, NgModule } from '@angular/core';
import { Router, RouterModule, Routes, UrlTree } from '@angular/router';
import { CalendarModule } from 'primeng/calendar';
import { DropdownModule } from 'primeng/dropdown';
import { TabViewModule } from 'primeng/tabview';
import { BadgeModule } from 'primeng/badge';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { InputNumberModule } from 'primeng/inputnumber';
import { MenuModule } from 'primeng/menu';
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
        // Deliberately NOT `data: { customerArea: true }` — that would route
        // through AuthGuard's public/customer branch and bounce staff off a
        // portal-confined account the same way the old `/e-ticket` redirect
        // did (OBRS-188). This is a normal staff-portal route instead.
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
      // OBRS-305 Card 2 — parcel consigned intake + delivery handoff.
      {
        path: 'parcels/consign',
        component: ParcelConsignPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['salesperson'], titleKey: 'STAFF.PAGES.PARCEL_CONSIGN', subtitleKey: 'STAFF.PARCEL_CONSIGN.SUBTITLE' },
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
        path: 'fleet-map',
        component: FleetMapPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['salesperson'], titleKey: 'STAFF.PAGES.FLEET_MAP', subtitleKey: 'STAFF.FLEET_MAP.SUBTITLE' },
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
    MenuModule,
    AdminSharedModule,
    PassengerSeatModule,

    // Station list (stop dropdowns on the sell search step). Registered per
    // lazy module — same pattern as the public booking modules.
    StoreModule.forFeature('provinceWithStationList', ProvinceReducer),
    EffectsModule.forFeature([ProvinceEffect]),
  ],
})
export class StaffModule {}
