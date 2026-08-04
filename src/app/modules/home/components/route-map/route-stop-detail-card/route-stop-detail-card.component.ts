import { Component, Input } from '@angular/core';
import { RouteStop } from '../../../../../shared/interfaces/route-map.interface';
import { buildMapsDirectionsUrl } from '../../../../../shared/lib/maps-directions-url';


@Component({
    selector: 'app-route-stop-detail-card',
    templateUrl: './route-stop-detail-card.component.html',
    styleUrl: './route-stop-detail-card.component.scss',
    standalone: false
})
export class RouteStopDetailCardComponent {
  private _stop: RouteStop | null = null;

  /** OBRS-1022: `set` rather than a plain `@Input()` so `photoFailed` resets when the
   *  selection changes. Without that, the first stop whose photo 404/403s would poison
   *  the empty state for every stop selected afterwards — including ones whose photo is
   *  perfectly fine — and the symptom (a card stuck on "no photo yet") would look like a
   *  data problem rather than a stale flag. */
  @Input() set stop(value: RouteStop | null) {
    this._stop = value;
    this.photoFailed = false;
  }

  get stop(): RouteStop | null {
    return this._stop;
  }

  @Input() type: 'pickup' | 'dropoff' = 'pickup';
  @Input() province = '';

  /** Raised by the `<img>` `(error)` handler when the photo URL does not resolve. */
  photoFailed = false;

  onPhotoError(): void {
    this.photoFailed = true;
  }

  /** A photo is shown only when there is a URL AND it actually loaded. */
  get showPhoto(): boolean {
    return !!this._stop?.primaryPhotoUrl && !this.photoFailed;
  }

  /** OBRS-1022: the owner-written landmark note, or null.
   *
   *  Blank is folded to null here as well as in the backend resolver: the two guards protect
   *  different things. The backend one stops a blank row shadowing the `en` fallback; this one
   *  stops a whitespace-only value that somehow reaches the wire from rendering an empty
   *  labelled line — an empty "จุดสังเกต:" is worse than no line at all. */
  get landmark(): string | null {
    const value = this._stop?.description;
    return value != null && value.trim() !== '' ? value : null;
  }

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
