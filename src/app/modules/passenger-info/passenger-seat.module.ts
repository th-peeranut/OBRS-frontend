import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PassengerSeatBusComponent } from './components/passenger-seat-bus/passenger-seat-bus.component';
import { PassengerSeatVanComponent } from './components/passenger-seat-van/passenger-seat-van.component';
import { PassengerSeatBoxComponent } from './components/passenger-seat-box/passenger-seat-box.component';

@NgModule({
  declarations: [PassengerSeatBusComponent, PassengerSeatVanComponent, PassengerSeatBoxComponent],
  exports: [PassengerSeatBusComponent, PassengerSeatVanComponent, PassengerSeatBoxComponent],
  imports: [CommonModule],
})
export class PassengerSeatModule {}
