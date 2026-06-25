import { Component, EventEmitter, Input, Output } from '@angular/core';
import { WalkInTripDto } from '../../../../services/staff/staff-api.service';
import dayjs from 'dayjs';

@Component({
  selector: 'app-walk-in-center-panel',
  templateUrl: './walk-in-center-panel.component.html',
  styleUrl: './walk-in-center-panel.component.scss',
})
export class WalkInCenterPanelComponent {
  @Input() selectedTrip: WalkInTripDto | null = null;
  @Input() selectedSeats: string[] = [];
  /** passenger_type lookup slug (male|female|monk|nun); drives the seat-map icon. */
  @Input() passengerGender = 'male';
  /** Route label from the parent (e.g. "Bangkok → Chiang Mai"); used to derive
   *  boarding/alighting point names for the center-panel header. */
  @Input() routeLabel: string | null = null;

  @Output() seatToggled = new EventEmitter<string>();
  @Output() passengerTypeChange = new EventEmitter<string>();

  protected readonly passengerTypeOptions: { value: string; labelKey: string; icon: string }[] = [
    { value: 'male',   labelKey: 'STAFF.SELL.PTYPE_MALE',   icon: 'icons/passenger-male.svg' },
    { value: 'female', labelKey: 'STAFF.SELL.PTYPE_FEMALE', icon: 'icons/passenger-female.svg' },
    { value: 'monk',   labelKey: 'STAFF.SELL.PTYPE_MONK',   icon: 'icons/passenger-monk.svg' },
    { value: 'nun',    labelKey: 'STAFF.SELL.PTYPE_NUN',    icon: '' },
  ];

  /** Splits routeLabel on any arrow/dash separator and returns first and last
   *  segment names, trimmed. Returns null when routeLabel is absent. */
  protected get routeEndpoints(): { from: string; to: string } | null {
    if (!this.routeLabel || !this.routeLabel.trim()) return null;
    const parts = this.routeLabel.split(/\s*[→—–\-]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    return { from: parts[0], to: parts[parts.length - 1] };
  }

  protected onSelectPassengerType(v: string): void {
    this.passengerTypeChange.emit(v);
  }

  /** Seat components expect an upper-case gender token (MALE|FEMALE|MONK). */
  protected get seatGender(): string {
    return (this.passengerGender || 'male').toUpperCase();
  }

  // Fixed seat universe for the BUS layout (B1..B21).
  private readonly busSeatLabels: string[] = Array.from(
    { length: 21 },
    (_, i) => `B${i + 1}`
  );

  protected get takenSeats(): string[] {
    if (!this.selectedTrip) return [];
    const available = (this.selectedTrip.availableSeatNumbers ?? []).map((s) =>
      String(s).replace(/\D/g, '')
    );
    if (available.length === 0) return [];
    return this.busSeatLabels.filter(
      (label) => !available.includes(label.replace(/\D/g, ''))
    );
  }

  protected get isVan(): boolean {
    return this.selectedTrip?.vehicleType === 'van';
  }

  protected get currentSeat(): string {
    return this.selectedSeats.length > 0 ? this.selectedSeats[0] : '';
  }

  protected formatDateTime(dateTime: string): string {
    return dayjs(dateTime).format('D MMM YYYY HH:mm');
  }

  protected formatDate(dateTime: string): string {
    return dayjs(dateTime).format('D MMM YYYY');
  }

  protected formatTime(dateTime: string): string {
    return dayjs(dateTime).format('HH:mm');
  }
}
