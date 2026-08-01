import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Dumb seat-map renderer for the change-seat dialog. Branches on
 * `vehicleType` between the existing fixed-layout
 * `app-passenger-seat-bus`/`app-passenger-seat-van` components — the same
 * reuse pattern `passenger-info-form.component.ts` (`isVanVehicle$`) and
 * `WalkInCenterPanelComponent` (`isVan`) already establish — rather than
 * hand-rolling a third seat grid (design-system §10/§12).
 *
 * Renders exactly one ticket's seat picker at a time (the active one); the
 * ticket stepper and per-ticket draft state live in the smart
 * `ChangeSeatDialogComponent`, which derives `takenSeats`/`pickedSeat` fresh
 * on every change (never mutating the availability arrays it reads from —
 * design-system §10).
 */
@Component({
    selector: 'app-change-seat-map',
    templateUrl: './change-seat-map.component.html',
    styleUrl: './change-seat-map.component.scss',
    standalone: false
})
export class ChangeSeatMapComponent {
  @Input() vehicleType = '';
  /** Every seat number that exists on this schedule's map — only consumed by
   * `app-passenger-seat-van` (bus is a fixed B1..B21 universe already). */
  @Input() availableSeatNumbers: string[] = [];
  /** Occupied-by-someone-else seats, unioned with every OTHER ticket's
   * current draft pick — disabled for the active ticket. */
  @Input() takenSeats: string[] = [];
  /** The active ticket's current draft seat (its original seat until the
   * traveler picks a different one) — rendered with the neutral `SELECTED`
   * marker (`passenger-seat-box`'s `gender='SELECTED'` branch), not a
   * gender icon. */
  @Input() pickedSeat = '';
  /**
   * The active ticket's ORIGINAL seat(s), in the seat-map's letter-prefixed
   * label form (`toSeatLabel`) — same as `pickedSeat`. Optional and
   * `null`-default (OBRS-170): every other consumer of the shared
   * `app-passenger-seat-van`/`app-passenger-seat-bus`/`app-passenger-seat-box`
   * chain (booking flow, staff walk-in) never sets this, so their rendering
   * is byte-identical to before (design-system §10 — extend, don't fork, a
   * shared component's contract). When set, renders a persistent `ORIGINAL`
   * marker on that seat, distinct from the `SELECTED` marker, so the
   * traveler doesn't lose track of their original seat once they pick a
   * different one.
   */
  @Input() originalSeats: string[] | null = null;

  @Output() readonly seatPicked = new EventEmitter<string>();

  get isVan(): boolean {
    const normalized = (this.vehicleType || '').toLowerCase();
    return normalized === 'van' || normalized === 'minibus';
  }

  /** Multi-select mode is always on (an object, never null) so the very
   * first click registers — see `passenger-seat-bus/van`'s
   * `setPassengerSeatPosition()`, which only treats clicks as no-ops when
   * `seatGenders === null`. Every seat in `originalSeats` is marked
   * `ORIGINAL` first; the active ticket's picked seat then overwrites its own
   * entry with `SELECTED` — so a seat that is BOTH the original and the
   * current pick (the common "nothing changed yet" case) still renders as
   * `SELECTED` exactly as before, and only a seat that stops being the pick
   * keeps its distinct `ORIGINAL` marker. Every other seat renders with no
   * icon. */
  get seatGenders(): Record<string, string> {
    const genders: Record<string, string> = {};
    const taken = this.takenSeats ?? [];
    for (const seat of this.originalSeats ?? []) {
      // Skip a seat that another ticket has since taken (multi-passenger:
      // once the active ticket vacates its original seat, another ticket can
      // pick it — it must then render as occupied, not as a misleading
      // available-looking ORIGINAL bookmark). `isSeatTakenByOther` still
      // blocks picking it, so this is purely the correct visual state.
      if (seat && !taken.includes(seat)) {
        genders[seat] = 'ORIGINAL';
      }
    }
    if (this.pickedSeat) {
      genders[this.pickedSeat] = 'SELECTED';
    }
    return genders;
  }

  onSeatClicked(seatNumber: string): void {
    this.seatPicked.emit(seatNumber);
  }
}
