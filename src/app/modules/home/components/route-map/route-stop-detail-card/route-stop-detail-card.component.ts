import { Component, Input } from '@angular/core';
import { RouteStop } from '../../../../../shared/interfaces/route-map.interface';

@Component({
  selector: 'app-route-stop-detail-card',
  templateUrl: './route-stop-detail-card.component.html',
  styleUrl: './route-stop-detail-card.component.scss',
})
export class RouteStopDetailCardComponent {
  @Input() stop: RouteStop | null = null;
  @Input() type: 'pickup' | 'dropoff' = 'pickup';
  @Input() province = '';
  @Input() mapsApiKey = '';

  get staticMapUrl(): string | null {
    if (!this.mapsApiKey || !this.stop?.latitude || !this.stop?.longitude) {
      return null;
    }
    const lat = this.stop.latitude;
    const lng = this.stop.longitude;
    return (
      `https://maps.googleapis.com/maps/api/staticmap` +
      `?center=${lat},${lng}&zoom=15&size=400x200` +
      `&markers=color:${this.type === 'pickup' ? 'blue' : 'red'}|${lat},${lng}` +
      `&key=${this.mapsApiKey}`
    );
  }

  openPhoto(): void {
    if (this.stop?.primaryPhotoUrl) {
      window.open(this.stop.primaryPhotoUrl, '_blank', 'noopener,noreferrer');
    }
  }

  openMaps(): void {
    if (this.stop?.googleMapsUrl) {
      window.open(this.stop.googleMapsUrl, '_blank', 'noopener,noreferrer');
    }
  }
}
