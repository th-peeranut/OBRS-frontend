import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';

import { ETicketComponent } from './e-ticket.component';
import { BookingEffect } from '../../shared/stores/booking/booking.effect';
import { BookingReducer } from '../../shared/stores/booking/booking.reducer';
import { PhoneFormatPipe } from '../../shared/pipes/phone-format.pipe';

const routes: Routes = [{ path: '', component: ETicketComponent }];

@NgModule({
  declarations: [ETicketComponent],
  imports: [
    SharedModule,
    RouterModule.forChild(routes),
    StoreModule.forFeature('booking', BookingReducer),
    EffectsModule.forFeature([BookingEffect]),
    PhoneFormatPipe,
  ],
})
export class ETicketModule {}
