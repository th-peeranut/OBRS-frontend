import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { CalendarModule } from 'primeng/calendar';
import { MenuModule } from 'primeng/menu';
import { SharedModule } from '../../shared/shared.module';
import { ETicketCardModule } from '../../shared/components/e-ticket-card/e-ticket-card.module';
import { PaymentMethodsModule } from '../../shared/components/payment-methods/payment-methods.module';
import { MyBookingsComponent } from './my-bookings.component';
import { MyBookingTicketModalComponent } from './components/my-booking-ticket-modal/my-booking-ticket-modal.component';
import { RescheduleDialogComponent } from './components/reschedule-dialog/reschedule-dialog.component';
import { RescheduleDatePickerStepComponent } from './components/reschedule-dialog/reschedule-date-picker-step/reschedule-date-picker-step.component';
import { RescheduleOptionsListComponent } from './components/reschedule-dialog/reschedule-options-list/reschedule-options-list.component';
import { RescheduleEstimateSummaryComponent } from './components/reschedule-dialog/reschedule-estimate-summary/reschedule-estimate-summary.component';
import { ChangeSeatDialogComponent } from './components/change-seat-dialog/change-seat-dialog.component';
import { ChangeSeatMapComponent } from './components/change-seat-dialog/change-seat-map/change-seat-map.component';
import { ChangeStopDialogComponent } from './components/change-stop-dialog/change-stop-dialog.component';
import { PassengerSeatModule } from '../passenger-info/passenger-seat.module';
import { RouteStopListModule } from '../home/components/route-map/route-stop-list/route-stop-list.module';
import { myBookingsReducer } from './store/my-bookings.reducer';
import { MyBookingsEffect } from './store/my-bookings.effect';
import { RescheduleEffect } from './store/reschedule.effect';
import { ChangeSeatEffect } from './store/change-seat.effect';
import { ChangeStopEffect } from './store/change-stop.effect';
import { MY_BOOKINGS_FEATURE_KEY } from './store/my-bookings.selector';

const routes: Routes = [{ path: '', component: MyBookingsComponent }];

@NgModule({
  declarations: [
    MyBookingsComponent,
    MyBookingTicketModalComponent,
    RescheduleDialogComponent,
    RescheduleDatePickerStepComponent,
    RescheduleOptionsListComponent,
    RescheduleEstimateSummaryComponent,
    ChangeSeatDialogComponent,
    ChangeSeatMapComponent,
    ChangeStopDialogComponent,
  ],
  imports: [
    SharedModule,
    ETicketCardModule,
    // Reuses app-payment-creditcard / app-payment-qrcode as the reschedule
    // dialog's embedded "Complete payment" step (see docs/adr). Imports the
    // extracted PaymentMethodsModule rather than the full PaymentModule —
    // PaymentModule has its own routed children which would otherwise fold
    // into this (also lazily-routed) module's route config.
    PaymentMethodsModule,
    CalendarModule,
    // Per-card overflow action menu (View e-ticket / Reschedule / Change seat
    // / Cancel booking) — same PrimeNG p-menu popup pattern already used by
    // WalkInTripBrowserComponent in the staff module.
    MenuModule,
    // Reuses the existing fixed-layout bus/van seat components (and the
    // shared passenger-seat-box) for the change-seat dialog's seat map —
    // same components the passenger-info flow and walk-in sell flow already
    // use (design-system §10/§12: extend, don't fork).
    PassengerSeatModule,
    // Reuses app-route-stop-list (the same pickup/drop-off picker the home
    // route map uses) as-is for the change-stop dialog's pickup/drop-off
    // steps — extracted into its own module so importing it here doesn't
    // fold HomeModule's own routes into this module's route config (same
    // reasoning as PaymentMethodsModule above).
    RouteStopListModule,
    RouterModule.forChild(routes),
    StoreModule.forFeature(MY_BOOKINGS_FEATURE_KEY, myBookingsReducer),
    EffectsModule.forFeature([MyBookingsEffect, RescheduleEffect, ChangeSeatEffect, ChangeStopEffect]),
  ],
})
export class MyBookingsModule {}
