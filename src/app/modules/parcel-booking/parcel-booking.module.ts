import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DatePickerModule } from 'primeng/datepicker';
import { SharedModule } from '../../shared/shared.module';
import { PaymentMethodsModule } from '../../shared/components/payment-methods/payment-methods.module';
import { DropdownGroupObrsComponent } from '../../shared/components/dropdown-group-obrs/dropdown-group-obrs.component';
import { ParcelBookingPageComponent } from './pages/parcel-booking-page/parcel-booking-page.component';
import { ParcelBookingSuccessPageComponent } from './pages/parcel-booking-success-page/parcel-booking-success-page.component';
import { ParcelTripFormComponent } from './components/parcel-trip-form/parcel-trip-form.component';
import { ParcelDetailsFormComponent } from './components/parcel-details-form/parcel-details-form.component';
import { ParcelBookingProgressComponent } from './components/parcel-booking-progress/parcel-booking-progress.component';

const routes: Routes = [
  { path: '', component: ParcelBookingPageComponent },
  { path: 'success/:trackingNumber', component: ParcelBookingSuccessPageComponent },
];

/**
 * OBRS-415 — customer online consigned-parcel booking wizard + Omise
 * payment. Imports `PaymentMethodsModule` (NOT the full `PaymentModule`,
 * which has its own routed children that would fold into this lazily-routed
 * module's route config — same reasoning as `my-bookings`' reschedule
 * dialog, see that module's own comment).
 */
@NgModule({
  declarations: [
    ParcelBookingPageComponent,
    ParcelBookingSuccessPageComponent,
    ParcelTripFormComponent,
    ParcelDetailsFormComponent,
    ParcelBookingProgressComponent,
  ],
  imports: [
    SharedModule,
    DatePickerModule,
    DropdownGroupObrsComponent,
    PaymentMethodsModule,
    RouterModule.forChild(routes),
  ],
})
export class ParcelBookingModule {}
