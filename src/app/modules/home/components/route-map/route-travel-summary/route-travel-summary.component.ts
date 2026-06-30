import { Component, Input } from '@angular/core';
import {
  RouteMeta,
  RouteStop,
} from '../../../../../shared/interfaces/route-map.interface';

@Component({
  selector: 'app-route-travel-summary',
  templateUrl: './route-travel-summary.component.html',
  styleUrl: './route-travel-summary.component.scss',
})
export class RouteTravelSummaryComponent {
  @Input() routeMeta: RouteMeta | null = null;
  @Input() pickupCount = 0;
  @Input() dropoffCount = 0;

  /** When both are set with known distances, the summary shows the distance and
   *  travel time for that selected segment instead of the whole route. */
  @Input() selectedPickupStop: RouteStop | null = null;
  @Input() selectedDropoffStop: RouteStop | null = null;

  /** True when the figures below reflect the selected pickup→dropoff segment
   *  (not the whole route). Drives a small hint in the template. */
  get isSegment(): boolean {
    return this.segmentDistanceKm !== null;
  }

  /** Along-route distance (km) between the selected pickup and dropoff, or null
   *  when a selection or its distance is missing. */
  private get segmentDistanceKm(): number | null {
    const pickup = this.selectedPickupStop?.distanceKmFromOrigin;
    const dropoff = this.selectedDropoffStop?.distanceKmFromOrigin;
    if (pickup == null || dropoff == null) {
      return null;
    }
    const km = Math.abs(dropoff - pickup);
    return km > 0 ? km : null;
  }

  /** Fraction of the whole route covered by the selected segment, clamped to
   *  (0, 1]. Used to scale the route's duration band down to the segment. */
  private get segmentRatio(): number | null {
    const segKm = this.segmentDistanceKm;
    const total = this.routeMeta?.totalDistanceKm;
    if (segKm == null || !total || total <= 0) {
      return null;
    }
    return Math.min(segKm / total, 1);
  }

  /** Distance shown in the summary: the selected segment when available, else
   *  the whole-route total. Rounded to a whole km (min 1 for a real segment). */
  get displayDistanceKm(): number {
    const segKm = this.segmentDistanceKm;
    if (segKm != null) {
      return Math.max(1, Math.round(segKm));
    }
    return this.routeMeta?.totalDistanceKm ?? 0;
  }

  get displayDurationMin(): number {
    const ratio = this.segmentRatio;
    const routeMin = this.routeMeta?.durationMinMinutes ?? 0;
    return ratio == null ? routeMin : Math.max(1, Math.round(routeMin * ratio));
  }

  get displayDurationMax(): number {
    const ratio = this.segmentRatio;
    const routeMax = this.routeMeta?.durationMaxMinutes ?? 0;
    return ratio == null ? routeMax : Math.max(1, Math.round(routeMax * ratio));
  }
}
