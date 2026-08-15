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
    standalone: false
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
  /**
   * OBRS-1358. Two callers, two genuinely different confirm actions:
   *
   * <p>'pair' is the home page. There the container always demanded BOTH sides, so a
   * per-side button was a button that confirmed nothing - the symptom usability report #6
   * reported. It gets one shared label and arms only on `canConfirm`.
   *
   * <p>'per-side' is the change-stop dialog, a real two-step wizard where confirming just
   * this side IS the action. It keeps the old label and the old `selectedSlug` guard, and
   * is the default so the dialog needs no change (and cannot be broken by forgetting one).
   */
  @Input() confirmMode: 'per-side' | 'pair' = 'per-side';
  /** Whether BOTH sides are chosen. Only read in 'pair' mode - the list cannot know this. */
  @Input() canConfirm = false;

  @Output() stopSelected = new EventEmitter<RouteStop>();
  @Output() confirmClicked = new EventEmitter<void>();

  ngOnChanges(_changes: SimpleChanges): void {}

  /**
   * Distance to a stop rounded for display, or null when unknown. Values under
   * 10 km keep one decimal (e.g. 1.2); larger ones round to whole km.
   */
  // proto-key-ok: ADR-0028 -- `stop.slug` is server-enumerated, so reaching
  // Object.prototype needs a stop literally slugged "constructor". Same call the ADR
  // made for the rest of the stop/seat-label family: left unguarded, not padded.
  distanceLabel(stop: RouteStop): string | null {
    const km = this.distancesKm?.[stop.slug];
    if (km === undefined) {
      return null;
    }
    return km < 10 ? km.toFixed(1) : Math.round(km).toString();
  }

  get confirmLabelKey(): string {
    if (this.confirmMode === 'pair') {
      return 'HOME.ROUTE_MAP.CONFIRM_PICKUP_DROPOFF';
    }
    return this.type === 'pickup'
      ? 'HOME.ROUTE_MAP.CONFIRM_PICKUP'
      : 'HOME.ROUTE_MAP.CONFIRM_DROPOFF';
  }

  get confirmDisabled(): boolean {
    return this.confirmMode === 'pair' ? !this.canConfirm : !this.selectedSlug;
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
