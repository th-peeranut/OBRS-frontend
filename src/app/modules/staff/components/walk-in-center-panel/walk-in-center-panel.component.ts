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
  /** passenger_type lookup slug (male|female|monk|nun) chosen in the checkout;
   *  drives the seat-map icon for the selected seat. */
  @Input() passengerGender = 'male';

  @Output() seatToggled = new EventEmitter<string>();

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
