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

  /** The route's total distance span in the same units as each stop's
   *  distanceKmFromOrigin (max − min across all stops). The per-stop values are
   *  offset-derived proxies whose scale differs from routeMeta.totalDistanceKm,
   *  so the selected segment is expressed as a fraction of this span and then
   *  projected onto totalDistanceKm — keeping the summary self-consistent (a
   *  full pickup→dropoff selection equals the whole-route figures). */
  @Input() routeSpanKm: number | null = null;

  /** True when the figures below reflect the selected pickup→dropoff segment
   *  (not the whole route). Drives a small hint in the template. */
  get isSegment(): boolean {
    return this.segmentRatio !== null;
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
   *  (0, 1]. Scales both the distance and the duration band onto the route's
   *  stated totals. Null (→ whole-route figures) when the span is unknown. */
  private get segmentRatio(): number | null {
    const segKm = this.segmentDistanceKm;
    const span = this.routeSpanKm;
    if (segKm == null || !span || span <= 0) {
      return null;
    }
    return Math.min(segKm / span, 1);
  }

  /** Distance shown in the summary: the selected segment projected onto the
   *  route's stated total when available, else the whole-route total. Rounded
   *  to a whole km (min 1 for a real segment). */
  get displayDistanceKm(): number {
    const ratio = this.segmentRatio;
    const total = this.routeMeta?.totalDistanceKm ?? 0;
    return ratio == null ? total : Math.max(1, Math.round(ratio * total));
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
