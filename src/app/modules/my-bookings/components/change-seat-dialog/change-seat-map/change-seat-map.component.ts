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

  @Output() readonly seatPicked = new EventEmitter<string>();

  get isVan(): boolean {
    const normalized = (this.vehicleType || '').toLowerCase();
    return normalized === 'van' || normalized === 'minibus';
  }

  /** Multi-select mode is always on (an object, never null) so the very
   * first click registers — see `passenger-seat-bus/van`'s
   * `setPassengerSeatPosition()`, which only treats clicks as no-ops when
   * `seatGenders === null`. Only the active ticket's picked seat carries the
   * `SELECTED` token; every other seat renders with no icon. */
  get seatGenders(): Record<string, string> {
    return this.pickedSeat ? { [this.pickedSeat]: 'SELECTED' } : {};
  }

  onSeatClicked(seatNumber: string): void {
    this.seatPicked.emit(seatNumber);
  }
}
