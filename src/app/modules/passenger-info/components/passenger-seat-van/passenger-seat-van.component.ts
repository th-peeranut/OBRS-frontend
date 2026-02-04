import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

@Component({
  selector: 'app-passenger-seat-van',
  templateUrl: './passenger-seat-van.component.html',
  styleUrl: './passenger-seat-van.component.scss',
})
export class PassengerSeatVanComponent implements OnChanges {
  @Input() gender: string = '';
  @Input() takenSeats: string[] = [];
  @Input() currentSeat: string = '';
  @Input() availableSeatNumbers: string[] | null = null;

  @Output() passengerSeatPositionOnChange = new EventEmitter<string>();

  isSelected: string = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentSeat'] && changes['currentSeat'].currentValue !== undefined) {
      const seat = changes['currentSeat'].currentValue || '';
      this.isSelected = seat;
      if (seat && (this.isSeatTakenByOther(seat) || !this.isSeatAvailable(seat))) {
        this.isSelected = '';
      }
    }
  }

  setPassengerSeatPosition(passengerSeatPosition: string) {
    if (this.gender == '') {
      return;
    }

    if (this.isSeatTakenByOther(passengerSeatPosition)) {
      return;
    }

    if (this.isSelected == passengerSeatPosition) {
      this.isSelected = '';
      this.passengerSeatPositionOnChange.emit(this.isSelected);
      return;
    }

    this.isSelected = passengerSeatPosition;
    this.passengerSeatPositionOnChange.emit(this.isSelected);
  }

  isSeatTakenByOther(seat: string): boolean {
    const normalizedSeat = seat || '';
    if (!normalizedSeat) return false;

    const taken = this.takenSeats || [];
    const isSameAsCurrent = normalizedSeat === this.currentSeat;
    return taken.includes(normalizedSeat) && !isSameAsCurrent;
  }

  isSeatDisabled(seat: string): boolean {
    if (this.isSeatTakenByOther(seat)) {
      return true;
    }

    return !this.isSeatAvailable(seat);
  }

  private isSeatAvailable(seat: string): boolean {
    const available = this.availableSeatNumbers ?? [];
    if (available.length === 0) {
      return true;
    }

    const normalized = this.normalizeSeatNumber(seat);
    if (!normalized) {
      return true;
    }

    return available.includes(normalized);
  }

  private normalizeSeatNumber(seat: string): string {
    return (seat || '').replace(/\D/g, '');
  }
}
