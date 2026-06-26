import { Component, Input } from '@angular/core';
import { RouteMeta } from '../../../../../shared/interfaces/route-map.interface';

@Component({
  selector: 'app-route-travel-summary',
  templateUrl: './route-travel-summary.component.html',
  styleUrl: './route-travel-summary.component.scss',
})
export class RouteTravelSummaryComponent {
  @Input() routeMeta: RouteMeta | null = null;
  @Input() pickupCount = 0;
  @Input() dropoffCount = 0;
}
