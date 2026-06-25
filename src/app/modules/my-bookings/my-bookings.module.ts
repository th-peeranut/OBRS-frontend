import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { SharedModule } from '../../shared/shared.module';
import { ETicketCardModule } from '../../shared/components/e-ticket-card/e-ticket-card.module';
import { MyBookingsComponent } from './my-bookings.component';
import { MyBookingTicketModalComponent } from './components/my-booking-ticket-modal/my-booking-ticket-modal.component';
import { myBookingsReducer } from './store/my-bookings.reducer';
import { MyBookingsEffect } from './store/my-bookings.effect';
import { MY_BOOKINGS_FEATURE_KEY } from './store/my-bookings.selector';

const routes: Routes = [{ path: '', component: MyBookingsComponent }];

@NgModule({
  declarations: [MyBookingsComponent, MyBookingTicketModalComponent],
  imports: [
    SharedModule,
    ETicketCardModule,
    RouterModule.forChild(routes),
    StoreModule.forFeature(MY_BOOKINGS_FEATURE_KEY, myBookingsReducer),
    EffectsModule.forFeature([MyBookingsEffect]),
  ],
})
export class MyBookingsModule {}
