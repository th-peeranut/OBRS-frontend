import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

@Component({
  selector: 'app-passenger-seat-box',
  templateUrl: './passenger-seat-box.component.html',
  styleUrl: './passenger-seat-box.component.scss',
})
export class PassengerSeatBoxComponent implements OnChanges {
  @Input() label: string = '';
  @Input() isDisabled: boolean = false;
  @Input() gender: string = ''; // MALE, FEMALE, MONK

  @Output() passengerSeatOutput = new EventEmitter<string>();

  isSelectPassenger: boolean = false;

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {}

  setPassengerSeatOuput(passengerSeat: string) {
    this.isSelectPassenger = !this.isSelectPassenger;
    this.passengerSeatOutput.emit(passengerSeat);
  }
}
