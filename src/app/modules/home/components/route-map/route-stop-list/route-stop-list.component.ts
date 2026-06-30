import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { RouteStop } from '../../../../../shared/interfaces/route-map.interface';

@Component({
  selector: 'app-route-stop-list',
  templateUrl: './route-stop-list.component.html',
  styleUrl: './route-stop-list.component.scss',
})
export class RouteStopListComponent implements OnChanges {
  @Input() stops: RouteStop[] = [];
  @Input() type: 'pickup' | 'dropoff' = 'pickup';
  @Input() selectedSlug: string | null = null;
  @Input() province = '';
  /**
   * Straight-line distance (km) from the user to each stop, keyed by slug.
   * Null until the user uses "Use my location"; only meaningful for pickups.
   */
  @Input() distancesKm: Record<string, number> | null = null;

  @Output() stopSelected = new EventEmitter<RouteStop>();
  @Output() confirmClicked = new EventEmitter<void>();

  ngOnChanges(_changes: SimpleChanges): void {}

  /**
   * Distance to a stop rounded for display, or null when unknown. Values under
   * 10 km keep one decimal (e.g. 1.2); larger ones round to whole km.
   */
  distanceLabel(stop: RouteStop): string | null {
    const km = this.distancesKm?.[stop.slug];
    if (km === undefined) {
      return null;
    }
    return km < 10 ? km.toFixed(1) : Math.round(km).toString();
  }

  onStopClick(stop: RouteStop): void {
    this.stopSelected.emit(stop);
  }

  onConfirm(): void {
    this.confirmClicked.emit();
  }

  trackBySlug(_index: number, stop: RouteStop): string {
    return stop.slug;
  }
}
