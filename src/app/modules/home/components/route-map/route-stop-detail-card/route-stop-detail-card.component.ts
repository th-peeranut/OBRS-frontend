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

  openMaps(): void {
    if (this.stop?.googleMapsUrl) {
      window.open(this.stop.googleMapsUrl, '_blank', 'noopener,noreferrer');
    }
  }
}
