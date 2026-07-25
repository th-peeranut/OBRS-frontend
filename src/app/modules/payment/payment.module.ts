import { NgModule } from '@angular/core';
import { PaymentComponent } from './payment.component';
import { Routes, RouterModule } from '@angular/router';
import { CalendarModule } from 'primeng/calendar';
import { SharedModule } from '../../shared/shared.module';

// components
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownObrsPassengerComponent } from '../home/components/dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import { PaymentInfoComponent } from './components/payment-info/payment-info.component';
import { PaymentResultComponent } from './components/payment-result/payment-result.component';
// PaymentCreditcardComponent/PaymentQrcodeComponent/PaymentSummaryComponent now
// live in shared/components/payment-methods (reused by the my-bookings
// reschedule dialog without pulling in this module's own routes — see
// PaymentMethodsModule and docs/adr).
import { PaymentMethodsModule } from '../../shared/components/payment-methods/payment-methods.module';
import { PhoneFormatPipe } from '../../shared/pipes/phone-format.pipe';

/// store
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { ProvinceReducer } from '../../shared/stores/station/station.reducer';
import { ProvinceEffect } from '../../shared/stores/station/station.effect';
import { PassengerInfoReducer } from '../../shared/stores/passenger-info/passenger-info.reducer';
import { PassengerInfoEffect } from '../../shared/stores/passenger-info/passenger-info.effect';
import { BookingReducer } from '../../shared/stores/booking/booking.reducer';
import { BookingEffect } from '../../shared/stores/booking/booking.effect';

const routes: Routes = [
  { path: 'result', component: PaymentResultComponent },
  { path: '', component: PaymentComponent, pathMatch: 'full' },
];

@NgModule({
  declarations: [
    PaymentComponent,
    PaymentInfoComponent,
    PaymentResultComponent
  ],
  imports: [
      SharedModule,
      RouterModule.forChild(routes),

      // Add-ons
      CalendarModule,
      PaymentMethodsModule,

      // Store
      StoreModule.forFeature('provinceWithStationList', ProvinceReducer),
      StoreModule.forFeature('passengerInfo', PassengerInfoReducer),
      StoreModule.forFeature('booking', BookingReducer),

      EffectsModule.forFeature([
        ProvinceEffect,
        PassengerInfoEffect,
        BookingEffect,
      ]),

      // Components
      DropdownObrsComponent,
      DropdownObrsPassengerComponent,
      PhoneFormatPipe,
    ],
})
export class PaymentModule { }
