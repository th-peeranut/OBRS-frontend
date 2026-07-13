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
  /**
   * Per-seat OWNER map for the collapsed shared seat map (OBRS-242): every
   * seat already assigned to ANY passenger in this booking, keyed by seat
   * label, with that passenger's badge label + gender. Null (the default)
   * leaves every existing single-select/`seatGenders` call site untouched.
   * When set, it takes priority over `seatGenders` for rendering — but the
   * click-eligibility guard is unchanged: `currentSeat` still means "the
   * ACTIVE passenger's own seat" and `takenSeats` still means "seats owned
   * by every OTHER passenger", so the host needs no new guard logic.
   */
  @Input() seatOwners: Record<string, { label: string; gender: string }> | null = null;

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
    // In multi-select/shared-map mode allow click as long as an owner or
    // gender map exists (non-empty string guard is irrelevant — the map
    // drives rendering, not `gender`).
    const effectiveGender =
      this.seatOwners !== null || this.seatGenders !== null ? 'multi' : this.gender;
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
    if (this.seatOwners !== null) {
      return this.seatOwners[label]?.gender ?? '';
    }
    if (this.seatGenders !== null) {
      return this.seatGenders[label] ?? '';
    }
    return this.isSelected === label ? this.gender : '';
  }

  /**
   * Whether a seat is "active" (selected/occupied by the current booking).
   * Shared-map: any seat present in the seatOwners map.
   * Multi-select: any seat present in seatGenders map.
   * Single-select: only the one isSelected seat.
   */
  isSeatActive(label: string): boolean {
    if (this.seatOwners !== null) {
      return label in this.seatOwners;
    }
    if (this.seatGenders !== null) {
      return label in this.seatGenders && (this.seatGenders[label] ?? '') !== '';
    }
    return this.isSelected === label;
  }

  /** Owner badge label for a seat in shared-map mode; null outside it. */
  ownerLabelFor(label: string): string | null {
    return this.seatOwners?.[label]?.label ?? null;
  }

  /**
   * Whether this seat is the currently ACTIVE passenger's own assigned seat
   * (shared-map mode only) — drives the emphasis ring.
   */
  isActiveOwnerFor(label: string): boolean {
    return this.seatOwners !== null && !!this.currentSeat && label === this.currentSeat;
  }
}
