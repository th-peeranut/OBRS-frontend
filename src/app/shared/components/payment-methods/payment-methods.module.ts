import { NgModule } from '@angular/core';
import { DatePickerModule } from 'primeng/datepicker';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { SharedModule } from '../../shared.module';
import { ScheduleBookingReducer } from '../../stores/schedule-booking/schedule-booking.reducer';
import { ScheduleBookingEffect } from '../../stores/schedule-booking/schedule-booking.effect';
import { ScheduleFilterReducer } from '../../stores/schedule-filter/schedule-filter.reducer';
import { ScheduleFilterEffect } from '../../stores/schedule-filter/schedule-filter.effect';
import { PaymentCreditcardComponent } from './payment-creditcard/payment-creditcard.component';
import { PaymentQrcodeComponent } from './payment-qrcode/payment-qrcode.component';
import { PaymentSummaryComponent } from './payment-summary/payment-summary.component';

/**
 * Extracted from the `payment` feature module so it can be reused without
 * pulling in that module's own routes (`payment.module.ts` has its own
 * `RouterModule.forChild` — importing it directly from another lazily-routed
 * feature module, like `my-bookings`, would fold its `''`/`result` routes
 * into the importing module's own router config and collide with that
 * module's routes). See `docs/adr` for the reschedule-dialog decision this
 * extraction supports.
 *
 * Registers the `scheduleBooking`/`scheduleFilter` feature state these three
 * components read (NgRx supports registering the same feature key from more
 * than one lazy module — see `payment.module.ts`, which still needs them for
 * `PaymentInfoComponent`).
 */
@NgModule({
  declarations: [PaymentCreditcardComponent, PaymentQrcodeComponent, PaymentSummaryComponent],
  imports: [
    SharedModule,
    DatePickerModule,
    StoreModule.forFeature('scheduleBooking', ScheduleBookingReducer),
    StoreModule.forFeature('scheduleFilter', ScheduleFilterReducer),
    EffectsModule.forFeature([ScheduleBookingEffect, ScheduleFilterEffect]),
  ],
  exports: [PaymentCreditcardComponent, PaymentQrcodeComponent, PaymentSummaryComponent],
})
export class PaymentMethodsModule {}
