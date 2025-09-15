import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-passenger-seat-van',
  templateUrl: './passenger-seat-van.component.html',
  styleUrl: './passenger-seat-van.component.scss',
})
export class PassengerSeatVanComponent {
  @Input() gender: string = '';

  @Output() passengerSeatPositionOnChange = new EventEmitter<string>();

  isSelected: string = "";
  isDisableSeat: boolean;

  setPassengerSeatPosition(passengerSeatPosition: string) {
    this.isDisableSeat = !this.isDisableSeat;
    this.isSelected = passengerSeatPosition;
    
    this.passengerSeatPositionOnChange.emit(this.isDisableSeat ? passengerSeatPosition : "");
  }
}
