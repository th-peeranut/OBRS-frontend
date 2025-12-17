import { NgModule } from '@angular/core';
import { PaymentComponent } from './payment.component';
import { Routes, RouterModule } from '@angular/router';
import { CalendarModule } from 'primeng/calendar';
import { SharedModule } from '../../shared/shared.module';

// components
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownObrsPassengerComponent } from '../home/components/dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import { PaymentInfoComponent } from './components/payment-info/payment-info.component';
import { PaymentSummaryComponent } from './components/payment-summary/payment-summary.component';
import { PaymentCreditcardComponent } from './components/payment-creditcard/payment-creditcard.component';
import { PaymentQrcodeComponent } from './components/payment-qrcode/payment-qrcode.component';

/// store
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { ScheduleBookingEffect } from '../../shared/stores/schedule-booking/schedule-booking.effect';
import { ScheduleBookingReducer } from '../../shared/stores/schedule-booking/schedule-booking.reducer';
import { ScheduleFilterEffect } from '../../shared/stores/schedule-filter/schedule-filter.effect';
import { ScheduleFilterReducer } from '../../shared/stores/schedule-filter/schedule-filter.reducer';
import { ProvinceReducer } from '../../shared/stores/province/province.reducer';
import { ProvinceEffect } from '../../shared/stores/province/province.effect';
import { PassengerInfoReducer } from '../../shared/stores/passenger-info/passenger-info.reducer';
import { PassengerInfoEffect } from '../../shared/stores/passenger-info/passenger-info.effect';

const routes: Routes = [
  { path: '', component: PaymentComponent },
];

@NgModule({
  declarations: [
    PaymentComponent,
    PaymentInfoComponent,
    PaymentSummaryComponent,
    PaymentCreditcardComponent,
    PaymentQrcodeComponent
  ],
  imports: [
      SharedModule,
      RouterModule.forChild(routes),
  
      // Add-ons
      CalendarModule,
  
      // Store
      StoreModule.forFeature('provinceWithStationList', ProvinceReducer),
      StoreModule.forFeature('scheduleBooking', ScheduleBookingReducer),
      StoreModule.forFeature('scheduleFilter', ScheduleFilterReducer),
      StoreModule.forFeature('passengerInfo', PassengerInfoReducer),
  
      EffectsModule.forFeature([
        ProvinceEffect,
        ScheduleFilterEffect,
        ScheduleBookingEffect,
        PassengerInfoEffect,
      ]),
  
      // Components
      DropdownObrsComponent,
      DropdownObrsPassengerComponent,
    ],
})
export class PaymentModule { }
