import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import * as L from 'leaflet';
import { TranslateService } from '@ngx-translate/core';
import { Subject, takeUntil } from 'rxjs';
import { mapTileUrl, MAP_TILE_ATTRIBUTION } from '../../../../shared/lib/map-tiles';

/**
 * C2 (SPEC-OBRS-426) — the customer trip-track map. Dumb component: inputs
 * only, no HTTP/store access (owned by the parent `TripTrackPanelComponent`).
 * Two markers max: the vehicle (mutated in place every poll tick, never
 * rebuilt — the `FleetMapPanelComponent`/route-map-panel precedent) and the
 * customer's own boarding stop (static — built once, never re-styled).
 *
 * Two hard rules, both from the OBRS-424 precedent (DEV-GOTCHAS):
 *   1. `ngOnChanges` always precedes `ngAfterViewInit` — every `@Input` write
 *      is buffered into `latest*` fields and replayed once the map exists.
 *   2. The SAME `L.Marker` instance persists across polls; only `.setIcon()`
 *      when the vehicle's `stale` flag actually changes (BR-11/U29-U31 — the
 *      STALE marker must be visually distinct, and the distinction must
 *      survive a LIVE→STALE→LIVE round trip, not just the first flip).
 */
@Component({
    selector: 'app-trip-track-map',
    templateUrl: './trip-track-map.component.html',
    styleUrl: './trip-track-map.component.scss',
    standalone: false
})
export class TripTrackMapComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() lat: number | null = null;
  @Input() lon: number | null = null;
  /** BR-11: drives the marker's visual degradation. Never read `stale` off
   * the raw DTO here — the parent already resolved it via `resolveTripTrackView`. */
  @Input() stale = false;
  @Input() boardingStopLat: number | null = null;
  @Input() boardingStopLon: number | null = null;
  @Input() maptilerKey = '';

  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLDivElement>;

  private map: L.Map | null = null;
  private vehicleMarker: L.Marker | null = null;
  private boardingMarker: L.Marker | null = null;
  private prevStale: boolean | null = null;
  private hasFitOnce = false;

  private latestLat: number | null = null;
  private latestLon: number | null = null;
  private latestStale = false;
  private latestBoardingLat: number | null = null;
  private latestBoardingLon: number | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly translate: TranslateService) {
    // OBRS-1096 — the marker names live on a Leaflet layer, not in a template,
    // so nothing re-renders them when the language changes. Same subscription
    // as `FleetMapPanelComponent` (OBRS-1082) and safe before the map exists:
    // `applyMarkerLabels()` finds no markers and does nothing.
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => this.applyMarkerLabels());
  }

  get canShowMap(): boolean {
    return !!this.maptilerKey;
  }

  ngOnChanges(): void {
    this.latestLat = this.lat;
    this.latestLon = this.lon;
    this.latestStale = this.stale;
    this.latestBoardingLat = this.boardingStopLat;
    this.latestBoardingLon = this.boardingStopLon;
    if (this.map) {
      this.syncMarkers();
    }
    // else: buffered — ngAfterViewInit replays it below once the map exists.
  }

  ngAfterViewInit(): void {
    if (!this.canShowMap) {
      return; // no L.map(...) call at all — nothing to tear down either.
    }
    this.map = L.map(this.canvasRef.nativeElement).setView(this.initialCenter(), 15);
    L.tileLayer(mapTileUrl(this.maptilerKey), { attribution: MAP_TILE_ATTRIBUTION }).addTo(this.map);
    this.syncMarkers();
  }

  ngOnDestroy(): void {
    // No RouteReuseStrategy in this app and the modal is *ngIf-rendered —
    // every open builds a fresh map; without this the old one leaks resize
    // listeners.
    this.map?.remove();
    this.map = null;
    this.vehicleMarker = null;
    this.boardingMarker = null;
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initialCenter(): L.LatLngExpression {
    if (this.latestLat !== null && this.latestLon !== null) {
      return [this.latestLat, this.latestLon];
    }
    if (this.latestBoardingLat !== null && this.latestBoardingLon !== null) {
      return [this.latestBoardingLat, this.latestBoardingLon];
    }
    return [13.7563, 100.5018]; // Bangkok — defensive only, unreached in practice.
  }

  private syncMarkers(): void {
    if (!this.map) {
      return;
    }
    this.syncVehicleMarker();
    this.syncBoardingMarker();
    // After both, so one call names whichever marker this sync just created.
    this.applyMarkerLabels();

    // Fit bounds to both markers exactly ONCE, the first time both exist —
    // never re-run automatically on a later poll tick (would yank the map out
    // from under a customer who is panning). Same one-shot-fit precedent as
    // FleetMapPanelComponent.
    if (!this.hasFitOnce && this.vehicleMarker && this.boardingMarker) {
      this.hasFitOnce = true;
      const bounds = L.latLngBounds([this.vehicleMarker.getLatLng(), this.boardingMarker.getLatLng()]);
      this.map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
    }
  }

  private syncVehicleMarker(): void {
    if (!this.map || this.latestLat === null || this.latestLon === null) {
      return;
    }
    const latLng: L.LatLngExpression = [this.latestLat, this.latestLon];

    if (!this.vehicleMarker) {
      this.vehicleMarker = L.marker(latLng, {
        icon: this.buildVehicleIcon(this.latestStale),
      }).addTo(this.map);
      this.prevStale = this.latestStale;
      return;
    }

    // The SAME L.Marker instance persists across every poll tick — .setLatLng()
    // always...
    this.vehicleMarker.setLatLng(latLng);
    if (this.prevStale !== this.latestStale) {
      // ...but .setIcon() only when the stale flag actually changed, in
      // EITHER direction (U31 — must also un-degrade LIVE→STALE→LIVE).
      this.vehicleMarker.setIcon(this.buildVehicleIcon(this.latestStale));
      this.prevStale = this.latestStale;
    }
  }

  private syncBoardingMarker(): void {
    if (!this.map || this.latestBoardingLat === null || this.latestBoardingLon === null) {
      return; // BR-8: omit the marker entirely — never (0, 0).
    }
    const latLng: L.LatLngExpression = [this.latestBoardingLat, this.latestBoardingLon];

    if (!this.boardingMarker) {
      this.boardingMarker = L.marker(latLng, {
        icon: this.buildBoardingIcon(),
      }).addTo(this.map);
    } else {
      this.boardingMarker.setLatLng(latLng);
    }
  }

  /** OBRS-1096. Both icons are `L.divIcon`s, and Leaflet copies the `alt`
   * marker option onto the element ONLY when it is an `IMG`
   * (`leaflet-src.js:7907`) — so the two translated names this component used
   * to pass as `alt` were computed and thrown away, leaving the vehicle and
   * boarding pins nameless in the accessibility tree. Writing them straight
   * onto the marker's own element instead keeps the CSS-custom-property
   * styling the DIV icons exist for (BR-24/U28), and re-running this is all a
   * language switch needs: no new marker, no extra request.
   *
   * `aria-label` only, no `role`: Leaflet's default `keyboard: true` already
   * stamps `role="button"` + `tabIndex=0` on every marker element
   * (`leaflet-src.js:7916`), so the element is focusable and only ever lacked
   * a NAME — overwriting that role with `img` would make it a focusable image. */
  private applyMarkerLabels(): void {
    this.labelMarker(this.vehicleMarker, 'MY_BOOKINGS.TRIP_TRACK.MARKER.VEHICLE');
    this.labelMarker(this.boardingMarker, 'MY_BOOKINGS.TRIP_TRACK.MARKER.BOARDING_STOP');
  }

  private labelMarker(marker: L.Marker | null, key: string): void {
    marker?.getElement()?.setAttribute('aria-label', this.translate.instant(key));
  }

  /** BR-11/BR-24: the STALE marker must be visibly different from LIVE —
   * both a different fill/halo token AND a lower opacity AND a dashed halo,
   * never merely an additive class on top of the live token (U30). CSS
   * custom-property NAMES here are deliberately trip-track-* — NOT
   * `--admin-*` (BR-24/U28): the values are copied from `--admin-warning-*`
   * (design-system §2.4), but the customer-shell marker never references an
   * `--admin-*` var directly. */
  private buildVehicleIcon(stale: boolean): L.DivIcon {
    const fillVar = stale ? '--trip-track-marker-stale-fill' : '--trip-track-marker-live-fill';
    const haloVar = stale ? '--trip-track-marker-stale-halo' : '--trip-track-marker-live-halo';
    const haloClass = stale ? 'trip-track-marker-halo is-stale' : 'trip-track-marker-halo';
    const dotClass = stale ? 'trip-track-marker-dot is-stale' : 'trip-track-marker-dot';

    const html = `
      <span class="${haloClass}" style="background: var(${haloVar})"></span>
      <span class="${dotClass}" style="background: var(${fillVar})"></span>
    `;

    return L.divIcon({
      className: stale ? 'trip-track-marker is-stale' : 'trip-track-marker is-live',
      html,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  private buildBoardingIcon(): L.DivIcon {
    // OBRS-1202: `translate="no"` in its plain HTML form here, not the
    // `[attr.translate]` binding the templates use — Leaflet injects this string
    // into the DOM itself, so Angular (and with it ngx-translate's
    // `[translate]` directive) never sees it.
    const html = `
      <span class="trip-track-boarding-pin" style="background: var(--trip-track-marker-boarding-fill)">
        <span class="material-symbols-outlined trip-track-boarding-pin-icon" translate="no" aria-hidden="true">flag</span>
      </span>
    `;
    return L.divIcon({
      className: 'trip-track-boarding-marker',
      html,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }
}
