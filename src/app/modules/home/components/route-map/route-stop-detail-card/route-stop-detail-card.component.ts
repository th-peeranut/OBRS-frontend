import { Component, Input } from '@angular/core';
import { RouteStop } from '../../../../../shared/interfaces/route-map.interface';
import { buildMapsDirectionsUrl } from '../../../../../shared/lib/maps-directions-url';

@Component({
  selector: 'app-route-stop-detail-card',
  templateUrl: './route-stop-detail-card.component.html',
  styleUrl: './route-stop-detail-card.component.scss',
})
export class RouteStopDetailCardComponent {
  @Input() stop: RouteStop | null = null;
  @Input() type: 'pickup' | 'dropoff' = 'pickup';
  @Input() province = '';

  /** OBRS-269: whether the selected stop has coordinates to navigate to (the
   *  pickup "Navigate" button is gated/disabled on this, distinct from the
   *  existing `googleMapsUrl` pin-view gate). */
  get hasPickupCoords(): boolean {
    return this.stop?.latitude != null && this.stop?.longitude != null;
  }

  openMaps(): void {
    if (this.stop?.googleMapsUrl) {
      window.open(this.stop.googleMapsUrl, '_blank', 'noopener,noreferrer');
    }
  }

  /** OBRS-269: opens Google Maps **Directions** from the user's current location
   *  to this pickup stop — a deep-link only (no Directions/Places API call),
   *  distinct from `openMaps()` above which opens the stop's own maps/search pin. */
  navigateToPickup(): void {
    if (!this.hasPickupCoords) {
      return;
    }
    const url = buildMapsDirectionsUrl(this.stop!.latitude as number, this.stop!.longitude as number);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
