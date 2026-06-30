import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { RouteMeta, RouteStop } from '../../../../../shared/interfaces/route-map.interface';

interface GoogleWindow {
  google?: {
    maps?: unknown;
  };
}

interface MarkerEntry {
  slug: string;
  options: google.maps.MarkerOptions;
}

/**
 * Load the Google Maps JS API once per page using Google's recommended
 * `loading=async` bootstrap + a `callback`. Loading the API the legacy
 * (synchronous) way keeps the browser's tab-loading indicator spinning and logs
 * the "loaded directly without loading=async" console warning; the async
 * bootstrap lets the page settle to idle and silences the warning.
 *
 * Shared across every RouteMapPanelComponent instance (the /home page renders a
 * desktop and a mobile panel) via a module-level promise, so the script is
 * injected at most once and both panels resolve off the same load.
 */
let googleMapsLoad: Promise<void> | null = null;

function loadGoogleMapsApi(apiKey: string): Promise<void> {
  if (googleMapsLoad) {
    return googleMapsLoad;
  }

  const win = window as unknown as GoogleWindow;
  if (win.google?.maps) {
    googleMapsLoad = Promise.resolve();
    return googleMapsLoad;
  }

  googleMapsLoad = new Promise<void>((resolve, reject) => {
    const callbackName = '__obrsGoogleMapsReady';
    (window as unknown as Record<string, () => void>)[callbackName] = () =>
      resolve();

    const script = document.createElement('script');
    script.setAttribute('data-maps-api', 'true');
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${apiKey}` +
      `&loading=async&libraries=marker&callback=${callbackName}`;
    script.async = true;
    script.onerror = () =>
      reject(new Error('Google Maps JS API failed to load'));
    document.head.appendChild(script);
  });

  return googleMapsLoad;
}

/** Maximum number of points per Directions API request (origin + N-2 waypoints + destination). */
const DIRECTIONS_CHUNK_SIZE = 25;

@Component({
  selector: 'app-route-map-panel',
  templateUrl: './route-map-panel.component.html',
  styleUrl: './route-map-panel.component.scss',
})
export class RouteMapPanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() pickupStops: RouteStop[] = [];
  @Input() dropoffStops: RouteStop[] = [];
  @Input() selectedPickupSlug: string | null = null;
  @Input() selectedDropoffSlug: string | null = null;
  @Input() mapsApiKey = '';
  @Input() routeMeta: RouteMeta | null = null;

  @ViewChild('mapContainer') mapContainer!: ElementRef;

  mapsLoaded = false;
  mapsError = false;

  // Precomputed stable fields — only reassigned when the underlying inputs change.
  // Keeping them as fields (not getters) prevents @angular/google-maps from seeing
  // a new object reference on every change-detection pass, which was the root cause
  // of the direction-toggle CD storm (GitHub issue #73).
  mapCenter: google.maps.LatLngLiteral = { lat: 13.7563, lng: 100.5018 };

  mapOptions: google.maps.MapOptions = {
    zoom: 10,
    center: { lat: 13.7563, lng: 100.5018 },
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  };

  polylinePath: google.maps.LatLngLiteral[] = [];

  // Constant — never changes, so safe as a readonly field.
  readonly polylineOptions: google.maps.PolylineOptions = {
    strokeColor: '#4BC2F7',
    strokeWeight: 4,
    strokeOpacity: 0.85,
  };

  // Precomputed marker arrays for *ngFor — avoids per-marker method calls in the template.
  pickupMarkers: MarkerEntry[] = [];
  dropoffMarkers: MarkerEntry[] = [];

  // ---------------------------------------------------------------------------
  // Directions road-snap state
  // ---------------------------------------------------------------------------

  /**
   * Straight-line path (pickup stops sorted by order, then dropoff stops sorted
   * by order) that is assigned immediately on stops-change. The Directions
   * request upgrades this to a road-snapped path asynchronously.
   */
  private straightPath: google.maps.LatLngLiteral[] = [];

  /**
   * Monotonically increasing counter incremented each time a new Directions
   * request is fired. Callbacks capture the counter at request time and discard
   * their result if a newer request has since been started (stale-response guard).
   */
  private dirReqSeq = 0;

  /**
   * Key derived from the ordered stop slugs of the last Directions request.
   * Prevents re-querying for the same set of stops (dedupe).
   */
  private lastDirReqKey = '';

  /**
   * The `dirReqSeq` value for which a Directions request has actually been
   * dispatched. Prevents ngOnInit's deferred re-fire from issuing a duplicate
   * request when recomputeMapData already fired one (maps was already loaded at
   * ngOnChanges time, e.g. on re-navigation to /home).
   */
  private dirReqDispatchedSeq = -1;

  get showMap(): boolean {
    return this.mapsLoaded && !!this.mapsApiKey && this.hasCoordinates;
  }

  get hasCoordinates(): boolean {
    return (
      this.pickupStops.some((s) => s.latitude !== null && s.longitude !== null) ||
      this.dropoffStops.some((s) => s.latitude !== null && s.longitude !== null)
    );
  }

  trackBySlug(_index: number, item: MarkerEntry): string {
    return item.slug;
  }

  stopHasCoords(stop: RouteStop): boolean {
    return stop.latitude !== null && stop.longitude !== null;
  }

  ngOnInit(): void {
    if (!this.mapsApiKey) {
      return;
    }

    // `loadGoogleMapsApi` is called from inside the Angular zone here, so the
    // promise continuations below run in-zone too (zone.js patches Promise) —
    // the `mapsLoaded` flip is picked up by change detection without an explicit
    // NgZone.run, matching the original `script.onload` behaviour.
    loadGoogleMapsApi(this.mapsApiKey)
      .then(() => {
        this.mapsLoaded = true;
        this.recomputeMarkers();
        // Stops may have arrived before maps finished loading. If a straight path
        // is already set and a Directions key was registered, fire the road-snap
        // request now that the DirectionsService is available.
        if (
          this.straightPath.length > 1 &&
          this.lastDirReqKey &&
          this.dirReqDispatchedSeq !== this.dirReqSeq
        ) {
          this.dirReqDispatchedSeq = this.dirReqSeq;
          void this.requestDirectionsPath(this.straightPath, this.dirReqSeq);
        }
      })
      .catch(() => {
        this.mapsError = true;
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    const stopsChanged = 'pickupStops' in changes || 'dropoffStops' in changes;
    const pickupSelectionChanged = 'selectedPickupSlug' in changes;
    const dropoffSelectionChanged = 'selectedDropoffSlug' in changes;

    if (stopsChanged) {
      // Stop changes affect map center, polyline path, AND all markers.
      this.recomputeMapData();
      this.recomputeMarkers();
    } else {
      // Selection-only changes: update only the affected marker array.
      // mapOptions/mapCenter must NOT be touched — unnecessary center re-apply would
      // re-trigger the same CD storm that this fix is designed to prevent.
      if (pickupSelectionChanged) {
        this.recomputePickupMarkers();
      }
      if (dropoffSelectionChanged) {
        this.recomputeDropoffMarkers();
      }
    }
  }

  ngOnDestroy(): void {}

  // ---------------------------------------------------------------------------
  // Private recompute methods
  // ---------------------------------------------------------------------------

  private recomputeMapData(): void {
    const stopsWithCoords = [
      ...this.pickupStops,
      ...this.dropoffStops,
    ].filter((s) => s.latitude !== null && s.longitude !== null);

    const center: google.maps.LatLngLiteral =
      stopsWithCoords.length === 0
        ? { lat: 13.7563, lng: 100.5018 } // Bangkok default
        : {
            lat:
              stopsWithCoords.reduce((sum, s) => sum + (s.latitude ?? 0), 0) /
              stopsWithCoords.length,
            lng:
              stopsWithCoords.reduce((sum, s) => sum + (s.longitude ?? 0), 0) /
              stopsWithCoords.length,
          };

    this.mapCenter = center;
    this.mapOptions = {
      zoom: 10,
      center,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    };

    const pickupCoords = this.pickupStops
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ lat: s.latitude as number, lng: s.longitude as number }));

    const dropoffCoords = this.dropoffStops
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ lat: s.latitude as number, lng: s.longitude as number }));

    // Set the straight path immediately — the map line renders at once without
    // waiting for the Directions API response.
    this.straightPath = [...pickupCoords, ...dropoffCoords];
    this.polylinePath = this.straightPath;

    // Dedupe: skip re-querying Directions when the stops haven't changed.
    const reqKey = this.buildRequestKey();
    if (reqKey === this.lastDirReqKey) {
      return;
    }
    this.lastDirReqKey = reqKey;
    this.dirReqSeq++;
    const seqId = this.dirReqSeq;

    // Fire Directions only when maps is already loaded. If maps hasn't loaded
    // yet, ngOnInit's .then() will re-fire using the captured straightPath.
    const win = window as unknown as GoogleWindow;
    if (this.straightPath.length > 1 && win.google?.maps) {
      this.dirReqDispatchedSeq = seqId;
      void this.requestDirectionsPath(this.straightPath, seqId);
    }
  }

  private recomputeMarkers(): void {
    this.recomputePickupMarkers();
    this.recomputeDropoffMarkers();
  }

  private recomputePickupMarkers(): void {
    const win = window as unknown as GoogleWindow;
    if (!win.google?.maps) {
      // Google Maps JS not loaded yet; markers will be built once the script
      // fires its onload handler (which also calls recomputeMarkers).
      return;
    }
    this.pickupMarkers = this.pickupStops.map((stop) => ({
      slug: stop.slug,
      options: this.buildMarkerOptions(stop, this.selectedPickupSlug, '#4BC2F7'),
    }));
  }

  private recomputeDropoffMarkers(): void {
    const win = window as unknown as GoogleWindow;
    if (!win.google?.maps) {
      return;
    }
    this.dropoffMarkers = this.dropoffStops.map((stop) => ({
      slug: stop.slug,
      options: this.buildMarkerOptions(stop, this.selectedDropoffSlug, '#4069B8'),
    }));
  }

  private buildMarkerOptions(
    stop: RouteStop,
    selectedSlug: string | null,
    color: string
  ): google.maps.MarkerOptions {
    const isSelected = stop.slug === selectedSlug;
    return {
      position: {
        lat: stop.latitude as number,
        lng: stop.longitude as number,
      },
      icon: {
        url: this.buildSvgMarkerUrl(stop.order, color, isSelected),
        scaledSize: new google.maps.Size(
          isSelected ? 44 : 36,
          isSelected ? 44 : 36
        ),
        anchor: new google.maps.Point(
          isSelected ? 22 : 18,
          isSelected ? 44 : 36
        ),
      },
      title: stop.name,
      zIndex: isSelected ? 100 : stop.order,
    };
  }

  private buildSvgMarkerUrl(
    order: number,
    color: string,
    selected: boolean
  ): string {
    const size = selected ? 44 : 36;
    const ring = selected
      ? `<circle cx="18" cy="18" r="17" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="4 2" opacity="0.7"/>`
      : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 36 36">
      ${ring}
      <circle cx="18" cy="18" r="${selected ? 14 : 12}" fill="${color}"/>
      <text x="18" y="23" text-anchor="middle" font-family="sans-serif" font-size="${selected ? 13 : 11}" font-weight="bold" fill="#fff">${order}</text>
    </svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  // ---------------------------------------------------------------------------
  // Directions API road-snapping
  // ---------------------------------------------------------------------------

  /**
   * Build a deduplication key from the ordered stop slugs. Two calls with the
   * same pickup and dropoff stops (same order) produce the same key, so the
   * Directions request is skipped when stops haven't actually changed.
   */
  private buildRequestKey(): string {
    const pickupSlugs = this.pickupStops
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .sort((a, b) => a.order - b.order)
      .map((s) => s.slug);
    const dropoffSlugs = this.dropoffStops
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .sort((a, b) => a.order - b.order)
      .map((s) => s.slug);
    return [...pickupSlugs, ...dropoffSlugs].join('|');
  }

  /**
   * Split a path into consecutive chunks of at most DIRECTIONS_CHUNK_SIZE
   * points, where adjacent chunks share exactly one endpoint. This keeps each
   * Directions request within the API's waypoint limit.
   *
   * Example with CHUNK_SIZE=25 and a 50-point path:
   *   chunk 1: points [0..24]  — origin + 23 waypoints + destination
   *   chunk 2: points [24..48] — origin + 23 waypoints + destination
   *   chunk 3: points [48..49] — origin + destination (no waypoints)
   */
  private chunkPath(
    path: google.maps.LatLngLiteral[]
  ): google.maps.LatLngLiteral[][] {
    if (path.length <= DIRECTIONS_CHUNK_SIZE) {
      return [path];
    }
    const step = DIRECTIONS_CHUNK_SIZE - 1; // shared endpoint = overlap by 1
    const chunks: google.maps.LatLngLiteral[][] = [];
    for (let i = 0; i < path.length - 1; i += step) {
      const end = Math.min(i + DIRECTIONS_CHUNK_SIZE, path.length);
      chunks.push(path.slice(i, end));
      if (end >= path.length) {
        break;
      }
    }
    return chunks;
  }

  /**
   * Wrap a single DirectionsService.route() callback call in a Promise.
   * Returns the DirectionsResult on success, null on any failure status.
   */
  private requestChunk(
    svc: google.maps.DirectionsService,
    chunk: google.maps.LatLngLiteral[]
  ): Promise<google.maps.DirectionsResult | null> {
    return new Promise((resolve) => {
      const origin = chunk[0];
      const destination = chunk[chunk.length - 1];
      const waypoints: google.maps.DirectionsWaypoint[] = chunk
        .slice(1, -1)
        .map((p) => ({
          location: p as google.maps.LatLngLiteral,
          stopover: false,
        }));

      svc.route(
        {
          origin,
          destination,
          waypoints,
          // Use string literals to avoid a runtime dependency on the
          // google.maps enum objects (which may be absent in test mocks
          // or before the Maps JS script finishes loading).
          travelMode: 'DRIVING' as google.maps.TravelMode,
          optimizeWaypoints: false,
        },
        (result, status) => {
          if ((status as string) === 'OK' && result) {
            resolve(result);
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  /**
   * Request road-snapped geometry for `straightPath` from the Directions API,
   * chunking if needed to stay within the waypoint limit.
   *
   * - Sets `polylinePath` to the road-snapped path on full success.
   * - Falls back to `straightPath` (already assigned) on any error — the map
   *   is never left blank.
   * - Discards stale responses via the `seqId` guard: if `dirReqSeq` has
   *   advanced since this request was fired, the result is silently dropped.
   */
  private async requestDirectionsPath(
    straightPath: google.maps.LatLngLiteral[],
    seqId: number
  ): Promise<void> {
    // Guard: DirectionsService might not exist in the current maps stub (tests).
    const win = window as unknown as GoogleWindow;
    if (!win.google?.maps) {
      return;
    }

    try {
      const svc = new google.maps.DirectionsService();
      const chunks = this.chunkPath(straightPath);
      const roadPaths: google.maps.LatLngLiteral[][] = [];

      for (const chunk of chunks) {
        // Stale-response guard: abort if a newer request has started.
        if (seqId !== this.dirReqSeq) {
          return;
        }

        const result = await this.requestChunk(svc, chunk);

        if (!result) {
          // Any chunk failure means we can't assemble a complete road path —
          // keep the straight path (already assigned) and abort.
          console.warn('[RouteMapPanel] Directions chunk failed; using straight-line path.');
          return;
        }

        const chunkRoadPath = result.routes[0].overview_path.map((p) => ({
          lat: p.lat(),
          lng: p.lng(),
        }));
        roadPaths.push(chunkRoadPath);
      }

      // Final stale check before writing the result.
      if (seqId !== this.dirReqSeq) {
        return;
      }

      // Concatenate chunk road paths. Skip the first point of each subsequent
      // chunk to avoid duplicating the shared endpoint.
      let combined: google.maps.LatLngLiteral[] = [];
      for (let i = 0; i < roadPaths.length; i++) {
        combined =
          i === 0
            ? [...roadPaths[0]]
            : [...combined, ...roadPaths[i].slice(1)];
      }

      this.polylinePath = combined;
    } catch (e) {
      // Covers: DirectionsService constructor unavailable, network failures,
      // API not enabled on this key, quota exceeded, etc.
      console.warn('[RouteMapPanel] Directions API error; using straight-line path.', e);
      // polylinePath is already set to straightPath — no action needed.
    }
  }
}
