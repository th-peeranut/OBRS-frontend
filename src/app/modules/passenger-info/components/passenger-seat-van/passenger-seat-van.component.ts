import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-passenger-seat-van',
  templateUrl: './passenger-seat-van.component.html',
  styleUrl: './passenger-seat-van.component.scss',
})
export class PassengerSeatVanComponent {
  @Input() gender: string = '';

  @Output() passengerSeatPositionOnChange = new EventEmitter<string>();

  isSelected: string = '';
  isDisableSeat: boolean = false;

  setPassengerSeatPosition(passengerSeatPosition: string) {
    if (this.gender == '') {
      return;
    }

    if (this.isSelected == passengerSeatPosition) {
      this.isDisableSeat = false;
      this.isSelected = '';
      this.passengerSeatPositionOnChange.emit(this.isSelected);

      return;
    } else if (this.isDisableSeat) {
      return;
    }

    this.isDisableSeat = true;
    this.isSelected = passengerSeatPosition;
    this.passengerSeatPositionOnChange.emit(this.isSelected);
  }
}
