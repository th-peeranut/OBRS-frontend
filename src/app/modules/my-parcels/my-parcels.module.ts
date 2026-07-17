import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { SharedModule } from '../../shared/shared.module';
import { MyParcelsComponent } from './my-parcels.component';
import { myParcelsReducer } from './store/my-parcels.reducer';
import { MyParcelsEffect } from './store/my-parcels.effect';
import { MY_PARCELS_FEATURE_KEY } from './store/my-parcels.selector';

const routes: Routes = [{ path: '', component: MyParcelsComponent }];

/**
 * OBRS-415 — `/my-parcels`, the customer's own paginated parcel list. Own,
 * module-local NgRx feature slice (`MY_PARCELS_FEATURE_KEY`) — same
 * convention `my-bookings` already establishes for a customer filtered
 * read-list page (UX-OBRS-415 §12.7).
 */
@NgModule({
  declarations: [MyParcelsComponent],
  imports: [
    SharedModule,
    RouterModule.forChild(routes),
    StoreModule.forFeature(MY_PARCELS_FEATURE_KEY, myParcelsReducer),
    EffectsModule.forFeature([MyParcelsEffect]),
  ],
})
export class MyParcelsModule {}
