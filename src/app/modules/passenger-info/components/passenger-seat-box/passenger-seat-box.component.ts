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

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {}

  setPassengerSeatOuput(passengerSeat: string) {
    if (this.isDisabled) {
      return;
    }
    this.passengerSeatOutput.emit(passengerSeat);
  }
}
