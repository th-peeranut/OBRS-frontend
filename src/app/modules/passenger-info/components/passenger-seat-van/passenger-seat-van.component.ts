import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { normalizeSeatNumber } from '../../../../shared/lib/seat-label';
import { DEFAULT_VAN_SEAT_LAYOUT, SeatLayout } from '../../../../shared/lib/seat-layout';

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
  /**
   * Per-seat gender map for multi-select walk-in mode (seat label → upper-case
   * gender token, e.g. { A1: 'MALE', A3: 'FEMALE' }).
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
  /**
   * Per-seat attribute map (OBRS-362) — which seats are wheelchair-accessible
   * / have extra legroom, keyed by the backend's plain-numeric seat label
   * (`normalizeSeatNumber('A1') === '1'`). Null (the default) renders no
   * badges — every existing call site is unaffected (same null-default
   * `@Input()` precedent as `seatOwners`/`seatGenders`, OBRS-242).
   */
  @Input() seatAttributes: Record<string, ('WHEELCHAIR' | 'EXTRA_LEGROOM')[]> | null = null;
  /** Pre-translated aria-labels forwarded to every seat box's badge. */
  @Input() wheelchairBadgeAriaLabel: string = '';
  @Input() extraLegroomBadgeAriaLabel: string = '';
  /**
   * OBRS-384: the vehicle's seat floor plan — rows of seat/empty/driver cells.
   * Null (the default) renders the built-in 13-seat van (DEFAULT_VAN_SEAT_LAYOUT),
   * identical to the previous hardcoded template, so every existing call site is
   * unaffected. Supply a layout to render a different vehicle (e.g. a 21-seat
   * minibus) — the same seat-selection/owner/attribute logic drives every cell.
   */
  @Input() seatLayout: SeatLayout | null = null;

  @Output() passengerSeatPositionOnChange = new EventEmitter<string>();
  @Output() seatClicked = new EventEmitter<string>();

  isSelected: string = '';

  /** OBRS-384: the layout actually rendered — the caller's, or the 13-seat van default. */
  get rows(): SeatLayout {
    return this.seatLayout ?? DEFAULT_VAN_SEAT_LAYOUT;
  }

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
    // In multi-select/shared-map mode allow click as long as an owner or
    // gender map exists.
    const effectiveGender =
      this.seatOwners !== null || this.seatGenders !== null ? 'multi' : this.gender;
    if (effectiveGender == '') {
      return;
    }

    if (this.isSeatTakenByOther(passengerSeatPosition)) {
      return;
    }

    this.seatClicked.emit(passengerSeatPosition);

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

  /**
   * Returns the gender token to display for a given seat label.
   * Multi-select mode: look up from seatGenders map.
   * Single-select mode: only the currently selected seat shows the gender.
   */
  // proto-key-ok: ADR-0028 names seatGenders/seatOwners by name -- `label` is a seat
  // label this component itself renders from the server's seat list, so reaching
  // Object.prototype needs a seat literally labelled "constructor".
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
  // proto-key-ok: ADR-0028 -- `label in this.seatOwners` included; same server-enumerated
  // seat label as seatGenderFor() above.
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

  /** Attribute list for a seat label (OBRS-362); empty when unset/unknown. */
  // proto-key-ok: ADR-0028 -- seat label again, normalized; same reachability argument.
  attributesFor(label: string): ('WHEELCHAIR' | 'EXTRA_LEGROOM')[] {
    if (!this.seatAttributes) {
      return [];
    }
    return this.seatAttributes[normalizeSeatNumber(label)] ?? [];
  }

  hasWheelchairBadge(label: string): boolean {
    return this.attributesFor(label).includes('WHEELCHAIR');
  }

  hasExtraLegroomBadge(label: string): boolean {
    return this.attributesFor(label).includes('EXTRA_LEGROOM');
  }

  private isSeatAvailable(seat: string): boolean {
    const available = this.availableSeatNumbers ?? [];
    if (available.length === 0) {
      return true;
    }

    const normalized = normalizeSeatNumber(seat);
    if (!normalized) {
      return true;
    }

    return available.includes(normalized);
  }
}
