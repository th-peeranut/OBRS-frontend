import { inject, NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
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
import { ParcelDeliveryEntryPageComponent } from './pages/parcel-delivery-schedule/parcel-delivery-schedule-page.component';
import { ParcelDeliveryListPageComponent } from './pages/parcel-delivery-list/parcel-delivery-list-page.component';
import { ParcelCollectDialogComponent } from './components/parcel-collect-dialog/parcel-collect-dialog.component';

// OBRS-416 (Epic OBRS-302, Card 3b) — staff/driver physical parcel verification.
import { ParcelVerifyEntryPageComponent } from './pages/parcel-verify-schedule/parcel-verify-schedule-page.component';
import { ParcelVerifyListPageComponent } from './pages/parcel-verify-list/parcel-verify-list-page.component';
import { ParcelVerifyDialogComponent } from './components/parcel-verify-dialog/parcel-verify-dialog.component';

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
      {
        path: 'parcels/deliveries',
        component: ParcelDeliveryEntryPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver', 'salesperson'], titleKey: 'STAFF.PAGES.PARCEL_DELIVERY', subtitleKey: 'STAFF.PARCEL_DELIVERY.ENTRY_SUBTITLE' },
      },
      {
        path: 'parcels/deliveries/:scheduleId',
        component: ParcelDeliveryListPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver', 'salesperson'], titleKey: 'STAFF.PAGES.PARCEL_DELIVERY', subtitleKey: 'STAFF.PARCEL_DELIVERY.LIST_SUBTITLE' },
      },
      // OBRS-416 (Epic OBRS-302, Card 3b) — staff/driver physical parcel
      // verification (created -> accepted|rejected). Same requiredRoles
      // pair as boarding/parcels/deliveries above; the role hierarchy
      // already admits salesperson/owner/admin over the backend's
      // DRIVER-only endpoint gate (staff.module.ts:138-141's fleet-map
      // comment documents the same expansion).
      {
        path: 'parcels/verify',
        component: ParcelVerifyEntryPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver', 'salesperson'], titleKey: 'STAFF.PAGES.PARCEL_VERIFY', subtitleKey: 'STAFF.PARCEL_VERIFY.ENTRY_SUBTITLE' },
      },
      {
        path: 'parcels/verify/:scheduleId',
        component: ParcelVerifyListPageComponent,
        canActivate: [AuthGuard],
        data: { requiredRoles: ['driver', 'salesperson'], titleKey: 'STAFF.PAGES.PARCEL_VERIFY', subtitleKey: 'STAFF.PARCEL_VERIFY.LIST_SUBTITLE' },
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
    ParcelDeliveryEntryPageComponent,
    ParcelDeliveryListPageComponent,
    ParcelCollectDialogComponent,
    ParcelVerifyEntryPageComponent,
    ParcelVerifyListPageComponent,
    ParcelVerifyDialogComponent,
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
