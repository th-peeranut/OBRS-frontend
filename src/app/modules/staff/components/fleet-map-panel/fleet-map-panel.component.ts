import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import * as L from 'leaflet';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { FleetPositionRespDto } from '../../../../services/staff/staff-api.service';
import {
  FLEET_STATUS_HAS_MARKER,
  FleetVehicleStatus,
  fleetVehicleStatusChip,
  resolveFleetVehicleStatus,
} from '../../../../shared/lib/fleet-vehicle-status';
import { fleetRelativeTime, fleetRelativeTimeLabel } from '../../../../shared/lib/fleet-relative-time';
import { compassPointFromCourse, normalizeCourse } from '../../../../shared/lib/fleet-heading';
import {
  FLEET_MAP_DEFAULT_CENTER,
  FLEET_MAP_DEFAULT_ZOOM,
  FLEET_MAP_FIT_BOUNDS_PADDING,
  FLEET_MAP_FIT_MAX_ZOOM,
  FLEET_MAP_TILE_ATTRIBUTION,
  fleetMapTileUrl,
} from '../../pages/fleet-map/fleet-map.constants';
import { FLEET_HEADING_MIN_SPEED_KMH, FLEET_MARKER_COLORS, FLEET_MARKER_OPACITY } from './fleet-map-panel.constants';

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
  // OBRS-1070 — the always-on compact label (plate + speed). It is a STANDALONE
  // L.Tooltip layer, not `marker.bindTooltip(..., {permanent: true})`, because a
  // Leaflet layer holds exactly ONE bound tooltip and the marker's is already
  // spent on the hover detail below. Keyed by vehicleId in lockstep with
  // `markers` — every add/remove path must touch both.
  private readonly labels = new Map<number, L.Tooltip>();
  private readonly markerStatuses = new Map<number, FleetVehicleStatus>();
  private hasFitOnce = false;
  private latestVehicles: FleetPositionRespDto[] = [];
  private readonly destroy$ = new Subject<void>();

  constructor(private readonly translate: TranslateService) {
    // OBRS-1082 — every string on a marker is produced by `translate.instant()`
    // and written into a Leaflet layer as raw HTML, so there is no template
    // binding for Angular to re-render when the language changes. Without this
    // subscription the popup / permanent label / hover tooltip stay in the OLD
    // language until the next poll tick overwrites them — measured at up to 60 s
    // (FLEET_MAP_POLL_INTERVAL_MS), while the page's own buttons switch at once.
    // Subscribing in the constructor (the pattern this codebase already uses in
    // 8+ components, e.g. inspection-items-page.component.ts:132) is safe before
    // the map exists: refreshMarkerText() finds no markers and does nothing.
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => this.refreshMarkerText());
  }

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
    this.destroy$.next();
    this.destroy$.complete();
    this.map?.remove();
    this.map = null;
    this.markers.clear();
    this.labels.clear();
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
          this.removeLabel(map, vehicle.vehicleId);
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
        // OBRS-1070 AC1 — hover shows the SAME full detail the popup shows.
        // Leaflet opens a non-permanent tooltip on `mouseover` by itself; no
        // handler of ours is involved on the pointer path.
        // `direction: 'auto'` (left/right by which half of the map the marker
        // sits in), NOT 'top': Leaflet never flips a tooltip that would leave
        // the canvas, and a vehicle near the top edge — measured on SIT, plate
        // 16-8368 — had its detail box clipped by the panel edge.
        marker.bindTooltip('', { direction: 'auto', className: 'fleet-marker-detail' });
        // ...but `bindTooltip` ALSO wires `click` -> `_openTooltip` whenever
        // `L.Browser.touch` is true (Layer.Tooltip.js `_initTooltipInteractions`),
        // and staff work this screen on a tablet. Without this, one tap opens
        // the popup AND the tooltip — two boxes with identical content stacked
        // on the same marker. Registered AFTER bindTooltip so it runs last.
        marker.on('click', () => marker?.closeTooltip());
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

      // OBRS-905 — mutates the heading SPAN's inline style directly, every
      // tick, exactly like the content sync below and for the identical
      // reason: `course`/`speed` change every poll while `status` mostly
      // doesn't, so baking a rotation into buildIcon() would freeze it at
      // the first-seen value (the setIcon() condition above is untouched).
      this.syncHeading(marker, vehicle, status);

      // .setPopupContent() ALWAYS — this is what keeps an open popup's
      // "last update" text from freezing between polls (§9.6: no separate
      // label-refresh timer). OBRS-1070 extends the same rule to the hover
      // tooltip and the permanent label: CONTENT is mutated every tick,
      // the layer object never is (the .setIcon() condition above is
      // untouched — a speed/time change must not rebuild the DivIcon).
      const detailHtml = this.buildDetailHtml(vehicle, status);
      marker.setPopupContent(detailHtml);
      marker.setTooltipContent(detailHtml);
      this.syncLabel(map, vehicle, latLng);
      this.markerStatuses.set(vehicle.vehicleId, status);
    }

    // Defensive: the contract guarantees a stable "always all vehicles" set,
    // but a vehicle dropping out of the response must not leave an orphaned
    // marker behind.
    for (const [vehicleId, marker] of this.markers) {
      if (!seenIds.has(vehicleId)) {
        map.removeLayer(marker);
        this.markers.delete(vehicleId);
        this.removeLabel(map, vehicleId);
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
    // OBRS-1202: `translate="no"` in its plain HTML form here, not the
    // `[attr.translate]` binding the templates use — Leaflet injects this string
    // into the DOM itself, so Angular (and with it ngx-translate's
    // `[translate]` directive) never sees it.
    const overlay = spec?.overlayIcon
      ? `<span class="material-symbols-outlined fleet-marker-overlay" translate="no" aria-hidden="true">${spec.overlayIcon}</span>`
      : '';
    // OBRS-905 — the heading arrow is additive, LIVE-only (Trap 3/AC4: a
    // stale OFFLINE/GPS_LOST fix must never imply direction), so this span
    // only exists in the DOM at all for LIVE — not merely hidden for the
    // other statuses. Starts hidden (`display: none`); syncHeading() below
    // decides per-tick, off `speed`, whether to reveal + rotate it. This is
    // called from buildIcon() (status-gated, rebuilt only on status change)
    // deliberately — only WHETHER the slot exists depends on status; the
    // rotation itself never goes through here (Trap 2).
    const heading =
      status === 'LIVE'
        ? `<span class="fleet-marker-heading" style="--fleet-heading-fill: var(${fillVar}); display: none"></span>`
        : '';

    const html = `
      <span class="fleet-marker-halo" style="background: var(${haloVar})"></span>
      <span class="fleet-marker-dot" style="background: var(${fillVar})"></span>
      ${heading}
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

  /** OBRS-905 (Trap 2) — mutates the heading span's inline style directly on
   * the marker's live DOM element (`marker.getElement()`), never touches the
   * marker's ROOT element (Trap 1: Leaflet owns that element's `transform`
   * for pan/zoom `translate3d`, and a `rotate()` there would fight it) and
   * never rebuilds the DivIcon (Trap 2: that only happens on status change).
   * No-op when the current status never got a heading slot from buildIcon()
   * (OFFLINE/GPS_LOST) — the querySelector simply finds nothing. */
  private syncHeading(marker: L.Marker, vehicle: FleetPositionRespDto, status: FleetVehicleStatus): void {
    const heading = marker.getElement()?.querySelector<HTMLElement>('.fleet-marker-heading');
    if (!heading) {
      return;
    }
    const course = normalizeCourse(vehicle.course);
    const speed = vehicle.speed ?? 0;
    const showArrow = status === 'LIVE' && speed > FLEET_HEADING_MIN_SPEED_KMH && course !== null;
    heading.style.display = showArrow ? '' : 'none';
    if (showArrow) {
      heading.style.transform = `rotate(${course}deg)`;
    }
  }

  /** OBRS-1070 AC3 — creates the permanent label on first sight, then mutates
   * the SAME L.Tooltip on every later tick (position + content). Nothing here
   * ever constructs a second layer for a vehicle that already has one. */
  private syncLabel(map: L.Map, vehicle: FleetPositionRespDto, latLng: L.LatLngExpression): void {
    let label = this.labels.get(vehicle.vehicleId);
    if (!label) {
      label = L.tooltip({
        permanent: true,
        // Non-interactive on purpose: an interactive tooltip sits in the
        // pointer path and would swallow the `mouseover` that AC1's hover
        // detail depends on, and the click that opens the popup (AC2).
        interactive: false,
        direction: 'bottom',
        offset: [0, 16],
        className: 'fleet-marker-label',
      })
        .setLatLng(latLng)
        .setContent('');
      label.addTo(map);
      this.labels.set(vehicle.vehicleId, label);
    } else {
      label.setLatLng(latLng);
    }
    label.setContent(this.buildLabelHtml(vehicle));
  }

  /** OBRS-1082 — the language-change path, and deliberately NOT a call to
   * `syncMarkers()`. It re-runs the two content builders over the vehicles
   * ALREADY in hand (`latestVehicles`) and nothing else:
   *   - no `setLatLng()` ⇒ no marker moves (AC2), and an open popup stays open
   *     because `setPopupContent()` on a live popup swaps the DOM in place —
   *     the very same call the poll tick already makes every 60 s;
   *   - no `L.marker` / `L.tooltip` construction and no `setIcon()` ⇒ OBRS-1070
   *     AC6's guard spec stays green (AC4);
   *   - no store/service access of any kind ⇒ switching language costs zero
   *     `GET /api/private/vehicles/positions` calls (AC3).
   * A vehicle with no marker (not marker-eligible per FLEET_STATUS_HAS_MARKER)
   * has nothing on screen to retranslate, so it is skipped. */
  private refreshMarkerText(): void {
    for (const vehicle of this.latestVehicles) {
      const marker = this.markers.get(vehicle.vehicleId);
      // The status is READ from the last sync, never re-resolved here:
      // `resolveFleetVehicleStatus` is time-dependent, and a language switch
      // carries no new position data — re-deriving it could silently flip a
      // vehicle's status chip on an event that is purely about wording.
      const status = this.markerStatuses.get(vehicle.vehicleId);
      if (!marker || status === undefined) {
        continue;
      }
      const detailHtml = this.buildDetailHtml(vehicle, status);
      marker.setPopupContent(detailHtml);
      marker.setTooltipContent(detailHtml);
      this.labels.get(vehicle.vehicleId)?.setContent(this.buildLabelHtml(vehicle));
    }
  }

  private removeLabel(map: L.Map, vehicleId: number): void {
    const label = this.labels.get(vehicleId);
    if (label) {
      map.removeLayer(label);
      this.labels.delete(vehicleId);
    }
  }

  /** The always-on compact label: plate, plus speed only when there IS one.
   * Deliberately NOT the full detail — with the fleet parked at the depot the
   * labels sit on top of each other, so anything beyond two short tokens is
   * unreadable exactly when it matters (AC3). Full detail lives on
   * hover/click. AC4: a null speed drops the whole token rather than
   * rendering a unit with no number. */
  private buildLabelHtml(vehicle: FleetPositionRespDto): string {
    const speedText =
      vehicle.speed !== null
        ? this.translate.instant('STAFF.FLEET_MAP.SPEED_VALUE', { value: vehicle.speed })
        : '';

    const parts = [
      `<span class="fleet-marker-label-plate">${escapeHtml(vehicle.numberPlate)}</span>`,
      speedText ? `<span class="fleet-marker-label-speed">${escapeHtml(speedText)}</span>` : '',
    ].filter((part) => part.length > 0);

    // Joined with a real space, not just the CSS margin: `margin-left` puts a
    // visible gap on screen but leaves the two tokens fused in textContent, so
    // a screen reader (and any copy-paste) reads "16-836868 km/h".
    return parts.join(' ');
  }

  /** The full detail block, shared verbatim by the click popup (AC2) and the
   * hover tooltip (AC1) — one builder so the two surfaces can never drift
   * into phrasing the same fix differently. */
  private buildDetailHtml(vehicle: FleetPositionRespDto, status: FleetVehicleStatus): string {
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
    const directionText = this.buildDirectionText(vehicle, status);

    const rows = [
      `<p class="fleet-marker-popup-plate">${escapeHtml(vehicle.numberPlate)}</p>`,
      `<p class="fleet-marker-popup-status">${escapeHtml(statusLabel)}</p>`,
      speedLabel ? `<p>${escapeHtml(speedLabel)}</p>` : '',
      directionText ? `<p>${escapeHtml(directionText)}</p>` : '',
      engineLabel ? `<p>${escapeHtml(engineLabel)}</p>` : '',
      `<p class="fleet-marker-popup-time">${escapeHtml(timeText)}</p>`,
    ].filter((row) => row.length > 0);

    return `<div class="fleet-marker-popup">${rows.join('')}</div>`;
  }

  /** OBRS-905 AC6 — direction as TEXT, decoupled from the arrow graphic on
   * purpose: gated on `speed` (Trap 3, same GPS-noise reasoning as the arrow)
   * but NOT on `status === 'LIVE'`, so a `GPS_LOST`/`OFFLINE` vehicle that
   * was moving at its last fix still reports a direction — phrased as
   * last-known rather than present-tense so it doesn't imply the position is
   * still fresh. `buildDetailHtml` is only ever invoked for marker-eligible
   * statuses (OFFLINE/GPS_LOST/LIVE — see FLEET_STATUS_HAS_MARKER), so no
   * further status gating is needed here. */
  private buildDirectionText(vehicle: FleetPositionRespDto, status: FleetVehicleStatus): string {
    const speed = vehicle.speed ?? 0;
    if (speed <= FLEET_HEADING_MIN_SPEED_KMH) {
      return '';
    }
    const compassPoint = compassPointFromCourse(vehicle.course);
    if (!compassPoint) {
      return '';
    }
    const direction = this.translate.instant(`STAFF.FLEET_MAP.COMPASS.${compassPoint}`);
    return status === 'LIVE'
      ? this.translate.instant('STAFF.FLEET_MAP.POPUP.DIRECTION', { direction })
      : this.translate.instant('STAFF.FLEET_MAP.POPUP.DIRECTION_LAST_KNOWN', { direction });
  }
}
