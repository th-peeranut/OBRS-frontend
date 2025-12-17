import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { CalendarModule } from 'primeng/calendar';
import { SharedModule } from '../../shared/shared.module';

// Components
import { PassengerInfoComponent } from './passenger-info.component';
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownObrsPassengerComponent } from '../home/components/dropdown-obrs-passenger/dropdown-obrs-passenger.component';

// Store
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { ProvinceEffect } from '../../shared/stores/province/province.effect';
import { ProvinceReducer } from '../../shared/stores/province/province.reducer';
import { ScheduleBookingEffect } from '../../shared/stores/schedule-booking/schedule-booking.effect';
import { ScheduleBookingReducer } from '../../shared/stores/schedule-booking/schedule-booking.reducer';
import { ScheduleFilterEffect } from '../../shared/stores/schedule-filter/schedule-filter.effect';
import { ScheduleFilterReducer } from '../../shared/stores/schedule-filter/schedule-filter.reducer';
import { PassengerInfoFormComponent } from './components/passenger-info-form/passenger-info-form.component';
import { PassengerInfoSummaryComponent } from './components/passenger-info-summary/passenger-info-summary.component';
import { PassengerSeatBusComponent } from './components/passenger-seat-bus/passenger-seat-bus.component';
import { PassengerSeatVanComponent } from './components/passenger-seat-van/passenger-seat-van.component';
import { PassengerSeatBoxComponent } from './components/passenger-seat-box/passenger-seat-box.component';
import { PassengerInfoReducer } from '../../shared/stores/passenger-info/passenger-info.reducer';
import { PassengerInfoEffect } from '../../shared/stores/passenger-info/passenger-info.effect';


const routes: Routes = [
  { path: '', component: PassengerInfoComponent },
];

@NgModule({
  declarations: [PassengerInfoComponent, PassengerInfoFormComponent, PassengerInfoSummaryComponent, PassengerSeatBusComponent, PassengerSeatVanComponent, PassengerSeatBoxComponent],
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
export class PassengerInfoModule {}
