import { Component, Input } from '@angular/core';
import {
  RouteMeta,
  RouteStop,
} from '../../../../../shared/interfaces/route-map.interface';

@Component({
    selector: 'app-route-travel-summary',
    templateUrl: './route-travel-summary.component.html',
    styleUrl: './route-travel-summary.component.scss',
    standalone: false
})
export class RouteTravelSummaryComponent {
  @Input() routeMeta: RouteMeta | null = null;
  @Input() pickupCount = 0;
  @Input() dropoffCount = 0;

  /** When both are set with known distances/offsets, the summary shows the
   *  distance and travel time for that selected segment instead of the whole
   *  route. */
  @Input() selectedPickupStop: RouteStop | null = null;
  @Input() selectedDropoffStop: RouteStop | null = null;

  /** OBRS-1496: the two top rows named the whole route (`province + count`) even
   *  after a stop was chosen, while the distance/duration rows below had already
   *  switched to the selected segment. Null until that row's own stop is chosen,
   *  so choosing only a pickup leaves the drop-off row on the whole-route text —
   *  the same per-row independence `segmentDistanceKm` and `segmentDurationMinutes`
   *  already have. */
  get selectedPickupStopName(): string | null {
    return this.selectedPickupStop?.name ?? null;
  }

  get selectedDropoffStopName(): string | null {
    return this.selectedDropoffStop?.name ?? null;
  }

  /** True when at least one figure below reflects the selected pickup→dropoff
   *  segment (not the whole route). Drives a small hint in the template. */
  get isSegment(): boolean {
    return this.segmentDistanceKm != null || this.isDurationSegment;
  }

  /** Authoritative along-route distance (km) between the selected pickup and
   *  dropoff — the direct |Δ distanceKmFromOrigin|, not projected onto any
   *  other total. Null when a selection or its distance is missing. */
  private get segmentDistanceKm(): number | null {
    const pickup = this.selectedPickupStop?.distanceKmFromOrigin;
    const dropoff = this.selectedDropoffStop?.distanceKmFromOrigin;
    if (pickup == null || dropoff == null) {
      return null;
    }
    return Math.abs(dropoff - pickup);
  }

  /** Authoritative travel time (minutes) between the selected pickup and
   *  dropoff — the direct |Δ offsetMinutesFromOrigin|. Null when a selection
   *  or its offset is missing. */
  private get segmentDurationMinutes(): number | null {
    const pickup = this.selectedPickupStop?.offsetMinutesFromOrigin;
    const dropoff = this.selectedDropoffStop?.offsetMinutesFromOrigin;
    if (pickup == null || dropoff == null) {
      return null;
    }
    return Math.abs(dropoff - pickup);
  }

  /** True when the duration figure reflects the selected segment (renders
   *  `SUMMARY_DURATION_SEGMENT` instead of the whole-route `SUMMARY_DURATION`
   *  range). Independent of `segmentDistanceKm` — distance and duration each
   *  fall back on their own missing source field. */
  get isDurationSegment(): boolean {
    return this.segmentDurationMinutes != null;
  }

  /** Distance shown in the summary: the authoritative selected-segment delta
   *  when available, else the whole-route total. Rounded to a whole km
   *  (min 1 for a real segment).
   *
   *  OBRS-1341: the whole-route total is rounded on the same line as the segment.
   *  It used to be returned raw, which was invisible only because the seeded total
   *  was the whole number 80 — against a measured 133.57 the same panel would have
   *  read "133.57 km" unselected and "134 km" for first-stop→last-stop, which is the
   *  two-numbers-for-one-journey bug this card exists to remove, reintroduced by
   *  rounding instead of by data. */
  get displayDistanceKm(): number {
    const segment = this.segmentDistanceKm;
    if (segment != null) {
      return Math.max(1, Math.round(segment));
    }
    return Math.round(this.routeMeta?.totalDistanceKm ?? 0);
  }

  /** Duration shown in the summary when a segment is resolved: the
   *  authoritative selected-segment delta, rounded to a whole minute
   *  (min 1). Only meaningful when `isDurationSegment` is true. */
  get displayDurationMinutes(): number {
    const segment = this.segmentDurationMinutes;
    return segment != null ? Math.max(1, Math.round(segment)) : 0;
  }

  get displayDurationMin(): number {
    return this.routeMeta?.durationMinMinutes ?? 0;
  }

  get displayDurationMax(): number {
    return this.routeMeta?.durationMaxMinutes ?? 0;
  }
}
