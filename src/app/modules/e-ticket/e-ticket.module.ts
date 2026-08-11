import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';

import { ETicketComponent } from './e-ticket.component';
import { BookingEffect } from '../../shared/stores/booking/booking.effect';
import { BookingReducer } from '../../shared/stores/booking/booking.reducer';
import { PassengerInfoEffect } from '../../shared/stores/passenger-info/passenger-info.effect';
import { PassengerInfoReducer } from '../../shared/stores/passenger-info/passenger-info.reducer';
import { ScheduleBookingEffect } from '../../shared/stores/schedule-booking/schedule-booking.effect';
import { ScheduleBookingReducer } from '../../shared/stores/schedule-booking/schedule-booking.reducer';
import { ScheduleFilterEffect } from '../../shared/stores/schedule-filter/schedule-filter.effect';
import { ScheduleFilterReducer } from '../../shared/stores/schedule-filter/schedule-filter.reducer';
import { ProvinceEffect } from '../../shared/stores/station/station.effect';
import { ProvinceReducer } from '../../shared/stores/station/station.reducer';
import { PhoneFormatPipe } from '../../shared/pipes/phone-format.pipe';

const routes: Routes = [{ path: '', component: ETicketComponent }];

/**
 * OBRS-1252, AC-2, option (a): this module registers every slice and every effect
 * `ETicketComponent` actually reads, rather than relying on the module the customer happened to
 * walk through on the way here.
 *
 * <p><b>What it was before.</b> Only `booking` was registered, while the component reads five
 * feature selectors. `createFeatureSelector` returns `undefined` for an unregistered key -
 * silently, with no throw and no type error - so every field fed by the other four rendered the
 * class default `-`, and `ngOnInit`'s `invokeGetAllProvinceWithStationApi()` was dispatched into
 * a store with no `ProvinceEffect` to answer it. Measured on a guest hard-load of `/e-ticket`
 * before this change: <b>9 fields showing `-` and zero `/api/` requests</b>. The same build
 * reached through the app (search -> select -> ... -> e-ticket) rendered the ticket fine, which
 * is why it survived: the modules on that path register these very slices into the same store.
 *
 * <p><b>Why registering here rather than dropping the dispatch (option b).</b> A lazy module has
 * to stand up alone. A direct link, a bookmark, a restored tab and a plain refresh all load this
 * one and nothing else - and for a guest that is the whole of the page, because
 * `loadTicketFromApi` returns early without a token (OBRS-858) and `/e-ticket` carries no
 * `requireAuth`. Dropping the dispatch would have silenced the symptom on the station line and
 * left the other four selectors reading `undefined`.
 *
 * <p><b>Registering the same key twice is not a conflict.</b> `StoreModule.forFeature` is
 * idempotent per key: the modules on the in-app path register these keys too, and NgRx keeps one
 * reducer per key. Same for the effects - NgRx instantiates one per module injector, which the
 * effects here are already written for (`consumeBookingSelectionRestoredFlag` and
 * `station.effect.ts`'s session guard are module-scoped precisely because of it).
 *
 * <p>`scripts/check-store-feature-registration.mjs` is the gate that keeps this true: it fails
 * the build when a declared component reads a feature selector its own module does not register.
 */
@NgModule({
  declarations: [ETicketComponent],
  imports: [
    SharedModule,
    RouterModule.forChild(routes),

    // Store - one entry per selector ETicketComponent reads.
    StoreModule.forFeature('booking', BookingReducer),
    StoreModule.forFeature('scheduleBooking', ScheduleBookingReducer),
    StoreModule.forFeature('scheduleFilter', ScheduleFilterReducer),
    StoreModule.forFeature('passengerInfo', PassengerInfoReducer),
    StoreModule.forFeature('provinceWithStationList', ProvinceReducer),

    // Effects - one entry per action ngOnInit dispatches, so none of them is dropped on the
    // floor. `ProvinceEffect` is the one that turns `invokeGetAllProvinceWithStationApi()` into
    // the `/api/stops` request this page needs to name its own stops.
    EffectsModule.forFeature([
      BookingEffect,
      ScheduleBookingEffect,
      ScheduleFilterEffect,
      PassengerInfoEffect,
      ProvinceEffect,
    ]),

    PhoneFormatPipe,
  ],
})
export class ETicketModule {}
