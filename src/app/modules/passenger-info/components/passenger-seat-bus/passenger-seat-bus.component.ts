import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  SimpleChanges,
  Output,
} from '@angular/core';

@Component({
  selector: 'app-passenger-seat-bus',
  templateUrl: './passenger-seat-bus.component.html',
  styleUrl: './passenger-seat-bus.component.scss',
})
export class PassengerSeatBusComponent implements OnChanges {
  @Input() gender: string = '';
  @Input() takenSeats: string[] = [];
  @Input() currentSeat: string = '';
  /**
   * Per-seat gender map for multi-select walk-in mode (seat label → upper-case
   * gender token, e.g. { B1: 'MALE', B3: 'FEMALE' }).
   * When null (the default), the component falls back to the single-select
   * behaviour driven by `isSelected` + `gender` — the customer passenger-info
   * flow is unaffected.
   */
  @Input() seatGenders: Record<string, string> | null = null;

  @Output() passengerSeatPositionOnChange = new EventEmitter<string>();
  @Output() seatClicked = new EventEmitter<string>();

  isSelected: string = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentSeat'] && changes['currentSeat'].currentValue !== undefined) {
      const seat = changes['currentSeat'].currentValue || '';
      this.isSelected = seat;
      if (seat && this.isSeatTakenByOther(seat)) {
        this.isSelected = '';
      }
    }
  }

  setPassengerSeatPosition(passengerSeatPosition: string) {
    // In multi-select mode allow click as long as a gender map exists (non-empty
    // string guard is irrelevant — the map drives rendering, not `gender`).
    const effectiveGender = this.seatGenders !== null ? 'multi' : this.gender;
    if (effectiveGender === '') {
      return;
    }

    if (this.isSeatTakenByOther(passengerSeatPosition)) {
      return;
    }

    this.seatClicked.emit(passengerSeatPosition);

    if (this.isSelected === passengerSeatPosition) {
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

  /**
   * Returns the gender token to display for a given seat label.
   * Multi-select mode: look up from seatGenders map.
   * Single-select mode: only the currently selected seat shows the gender.
   */
  seatGenderFor(label: string): string {
    if (this.seatGenders !== null) {
      return this.seatGenders[label] ?? '';
    }
    return this.isSelected === label ? this.gender : '';
  }

  /**
   * Whether a seat is "active" (selected/occupied by the current booking).
   * Multi-select: any seat present in seatGenders map.
   * Single-select: only the one isSelected seat.
   */
  isSeatActive(label: string): boolean {
    if (this.seatGenders !== null) {
      return label in this.seatGenders && (this.seatGenders[label] ?? '') !== '';
    }
    return this.isSelected === label;
  }
}
