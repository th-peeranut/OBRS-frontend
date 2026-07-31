import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import * as L from 'leaflet';
import { TranslateService } from '@ngx-translate/core';
import { FleetPositionRespDto } from '../../../../services/staff/staff-api.service';
import {
  FLEET_STATUS_HAS_MARKER,
  FleetVehicleStatus,
  fleetVehicleStatusChip,
  resolveFleetVehicleStatus,
} from '../../../../shared/lib/fleet-vehicle-status';
import { fleetRelativeTime, fleetRelativeTimeLabel } from '../../../../shared/lib/fleet-relative-time';
import {
  FLEET_MAP_DEFAULT_CENTER,
  FLEET_MAP_DEFAULT_ZOOM,
  FLEET_MAP_FIT_BOUNDS_PADDING,
  FLEET_MAP_FIT_MAX_ZOOM,
  FLEET_MAP_TILE_ATTRIBUTION,
  fleetMapTileUrl,
} from '../../pages/fleet-map/fleet-map.constants';
import { FLEET_MARKER_COLORS, FLEET_MARKER_OPACITY } from './fleet-map-panel.constants';

/** Minimal HTML-escape for values interpolated into a Leaflet popup's raw
 * HTML string (Popup.setContent treats a string as markup). Backend plate
 * values are not free user text, but this stays defensive rather than
 * trusting the wire. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * OBRS-424 — the map itself (UX-OBRS-424-fleet-live-map.md §4). Dumb
 * component: inputs only, no store access. See the file-level comments below
 * for the two hard rules this component exists to satisfy:
 *   1. Markers are mutated in place via a `Map<vehicleId, L.Marker>` field,
 *      never rebuilt as a fresh array each poll (route-map-panel.component.ts
 *      :253-256 precedent — a fresh-object-reference getter hard-locked the
 *      browser).
 *   2. `ngOnChanges` always runs before `ngAfterViewInit` — the `@Input`
 *      write is buffered into `latestVehicles` and replayed once the map
 *      exists (§4.7).
 */
@Component({
    selector: 'app-fleet-map-panel',
    templateUrl: './fleet-map-panel.component.html',
    styleUrl: './fleet-map-panel.component.scss',
    standalone: false
})
export class FleetMapPanelComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() vehicles: FleetPositionRespDto[] = [];
  @Input() maptilerKey = '';

  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLDivElement>;

  private map: L.Map | null = null;
  private readonly markers = new Map<number, L.Marker>();
  private readonly markerStatuses = new Map<number, FleetVehicleStatus>();
  private hasFitOnce = false;
  private latestVehicles: FleetPositionRespDto[] = [];

  constructor(private readonly translate: TranslateService) {}

  get canShowMap(): boolean {
    return !!this.maptilerKey;
  }

  ngOnChanges(): void {
    this.latestVehicles = this.vehicles ?? [];
    if (this.map) {
      this.syncMarkers(this.latestVehicles);
    }
    // else: buffered — ngAfterViewInit replays it below once the map exists
    // (or never, if canShowMap is false — see §4.4).
  }

  ngAfterViewInit(): void {
    if (!this.canShowMap) {
      return; // no L.map(...) call at all — nothing to tear down either.
    }
    this.map = L.map(this.canvasRef.nativeElement).setView(FLEET_MAP_DEFAULT_CENTER, FLEET_MAP_DEFAULT_ZOOM);
    L.tileLayer(fleetMapTileUrl(this.maptilerKey), { attribution: FLEET_MAP_TILE_ATTRIBUTION }).addTo(this.map);
    this.syncMarkers(this.latestVehicles);
  }

  ngOnDestroy(): void {
    // AC#4's "no leaked interval" widened to "no leaked map" — this app has no
    // RouteReuseStrategy, so every route entry builds a fresh map and the old
    // one leaks (resize listeners/rAF/DOM handlers) without this.
    this.map?.remove();
    this.map = null;
    this.markers.clear();
    this.markerStatuses.clear();
  }

  /** "Center on fleet" (admin-btn secondary, §4.5) — re-fits to every
   * currently marker-eligible vehicle on demand. Distinct from the automatic
   * one-time fit in syncMarkers(): this always re-runs, regardless of
   * hasFitOnce. */
  protected centerOnFleet(): void {
    this.fitToMarkers();
  }

  private syncMarkers(vehicles: FleetPositionRespDto[]): void {
    if (!this.map) {
      return;
    }
    const map = this.map;
    const seenIds = new Set<number>();

    for (const vehicle of vehicles) {
      const status = resolveFleetVehicleStatus(vehicle);
      if (!FLEET_STATUS_HAS_MARKER[status]) {
        // §3.2's edge case (gpsImeiConfigured:false, positionKnown:true) is
        // handled here, by construction: never gets a marker, and any
        // pre-existing one (a prior status change) is removed.
        const existing = this.markers.get(vehicle.vehicleId);
        if (existing) {
          map.removeLayer(existing);
          this.markers.delete(vehicle.vehicleId);
          this.markerStatuses.delete(vehicle.vehicleId);
        }
        continue;
      }

      seenIds.add(vehicle.vehicleId);
      const latLng: L.LatLngExpression = [vehicle.lat as number, vehicle.lon as number];
      const prevStatus = this.markerStatuses.get(vehicle.vehicleId);
      let marker = this.markers.get(vehicle.vehicleId);

      if (!marker) {
        marker = L.marker(latLng, { icon: this.buildIcon(status), opacity: this.opacityFor(status) }).addTo(map);
        marker.bindPopup('');
        this.markers.set(vehicle.vehicleId, marker);
      } else {
        // The SAME L.Marker instance persists across every poll tick — this
        // is the Leaflet-world equivalent of route-map-panel's documented
        // getter-landmine. .setLatLng() always...
        marker.setLatLng(latLng);
        if (prevStatus !== status) {
          // ...but .setIcon() only when the status actually changed.
          marker.setIcon(this.buildIcon(status));
          marker.setOpacity(this.opacityFor(status));
        }
      }

      // .setPopupContent() ALWAYS — this is what keeps an open popup's
      // "last update" text from freezing between polls (§9.6: no separate
      // label-refresh timer).
      marker.setPopupContent(this.buildPopupHtml(vehicle, status));
      this.markerStatuses.set(vehicle.vehicleId, status);
    }

    // Defensive: the contract guarantees a stable "always all vehicles" set,
    // but a vehicle dropping out of the response must not leave an orphaned
    // marker behind.
    for (const [vehicleId, marker] of this.markers) {
      if (!seenIds.has(vehicleId)) {
        map.removeLayer(marker);
        this.markers.delete(vehicleId);
        this.markerStatuses.delete(vehicleId);
      }
    }

    // fitBounds() called EXACTLY ONCE — the first time the marker-eligible
    // count goes from 0 to >=1 (§4.5). Never re-run automatically on a later
    // poll tick; "Center on fleet" is the only other way to re-fit.
    if (!this.hasFitOnce && this.markers.size > 0) {
      this.hasFitOnce = true;
      this.fitToMarkers();
    }
  }

  private fitToMarkers(): void {
    if (!this.map || this.markers.size === 0) {
      return;
    }
    const bounds = L.latLngBounds(Array.from(this.markers.values()).map((marker) => marker.getLatLng()));
    // maxZoom is NOT cosmetic: with exactly ONE marker-eligible vehicle the
    // bounds are degenerate (zero-size), and Leaflet's getBoundsZoom() then
    // returns the tile layer's own maxZoom (18) — the map slams to street
    // level on a single van, losing all fleet context. Day one has exactly
    // one tracker installed, so this is the EXPECTED first state, not an
    // edge case. Capped at 14 (≈ town scale), still well above the zoom-9
    // default so a genuinely clustered fleet does zoom in.
    this.map.fitBounds(bounds, { padding: FLEET_MAP_FIT_BOUNDS_PADDING, maxZoom: FLEET_MAP_FIT_MAX_ZOOM });
  }

  private opacityFor(status: FleetVehicleStatus): number {
    return FLEET_MARKER_OPACITY[status] ?? 1;
  }

  private buildIcon(status: FleetVehicleStatus): L.DivIcon {
    const spec = FLEET_MARKER_COLORS[status];
    const fillVar = spec?.fillVar ?? '--admin-neutral-text';
    const haloVar = spec?.haloVar ?? '--admin-neutral-bg';
    const overlay = spec?.overlayIcon
      ? `<span class="material-symbols-outlined fleet-marker-overlay" aria-hidden="true">${spec.overlayIcon}</span>`
      : '';

    const html = `
      <span class="fleet-marker-halo" style="background: var(${haloVar})"></span>
      <span class="fleet-marker-dot" style="background: var(${fillVar})"></span>
      ${overlay}
    `;

    return L.divIcon({
      className: 'fleet-marker',
      html,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
    });
  }

  private buildPopupHtml(vehicle: FleetPositionRespDto, status: FleetVehicleStatus): string {
    const chip = fleetVehicleStatusChip(status);
    const statusLabel = this.translate.instant(chip.i18nKey);
    const speedLabel =
      vehicle.speed !== null
        ? this.translate.instant('STAFF.FLEET_MAP.POPUP.SPEED', { value: vehicle.speed })
        : '';
    const engineLabel =
      vehicle.engineStatus === 1
        ? this.translate.instant('STAFF.FLEET_MAP.POPUP.ENGINE_ON')
        : vehicle.engineStatus === 0
          ? this.translate.instant('STAFF.FLEET_MAP.POPUP.ENGINE_OFF')
          : '';
    const timeLabel = fleetRelativeTimeLabel(fleetRelativeTime(vehicle.recordedAt, new Date()));
    const timeText = this.translate.instant(timeLabel.key, timeLabel.params);

    const rows = [
      `<p class="fleet-marker-popup-plate">${escapeHtml(vehicle.numberPlate)}</p>`,
      `<p class="fleet-marker-popup-status">${escapeHtml(statusLabel)}</p>`,
      speedLabel ? `<p>${escapeHtml(speedLabel)}</p>` : '',
      engineLabel ? `<p>${escapeHtml(engineLabel)}</p>` : '',
      `<p class="fleet-marker-popup-time">${escapeHtml(timeText)}</p>`,
    ].filter((row) => row.length > 0);

    return `<div class="fleet-marker-popup">${rows.join('')}</div>`;
  }
}
