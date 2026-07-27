import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { GoogleMap } from '@angular/google-maps';
import { RouteMeta, RouteStop } from '../../../../../shared/interfaces/route-map.interface';

/** Payload emitted once the user's current location has been resolved. */
export interface UserLocatedEvent {
  /** Slug of the pickup stop closest to the user, or null when none have coords. */
  nearestPickupSlug: string | null;
  /** Map of pickup-stop slug -> straight-line distance from the user, in km. */
  distancesKm: Record<string, number>;
}

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
 * The brand palette, restated for the map (OBRS-752).
 *
 * Google Maps markers are SVG data-URLs, so these cannot be `$primary-blue` /
 * `$secondary-blue` from styles/variables.scss -- they have to be literals in
 * TypeScript. That is exactly why they were left behind when the palette moved:
 * `scripts/check-brand-fill-contrast.mjs` reads .scss and never opens this file,
 * so the pickup pin sat at white-on-#4BC2F7 = 2.03:1 through the whole of
 * OBRS-740/741/752, while the numbered badge FOR THE SAME STOP, one component
 * away in route-stop-list.component.scss, was one of the 48 the gate did report.
 * A blind spot reads exactly like a pass -- the same shape as OBRS-734, one
 * layer further out.
 *
 * Named and hoisted so the next palette move has one place to look instead of
 * three call sites. Keep them equal to their SCSS counterparts.
 */
const MAP_PICKUP_COLOR = '#0772A2'; // = $primary-blue; white pin number on it = 5.33:1 (was 2.03:1)
const MAP_DROPOFF_COLOR = '#3B61A9'; // = $secondary-blue; white pin number on it = 6.05:1

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

// ---------------------------------------------------------------------------
// Road-snapped path cache (OBRS-91)
//
// The road-snapped polyline for a fixed, ordered stop-set is deterministic
// (roads don't change), yet today a billable Directions API request fires on
// every /home visit, reload, and new session because the in-session dedupe
// (`lastDirReqKey`) lives only on a single component instance. Persisting the
// result and serving it on repeat views cuts Directions calls to ~once per
// unique route per browser. Two tiers:
//   1. Module-level Map — shared across every RouteMapPanelComponent instance
//      within the SPA session (survives in-app navigation; no storage I/O).
//   2. localStorage — survives full reloads and new sessions.
// The cache key (see buildRequestKey) includes rounded stop coordinates, so an
// admin coordinate edit naturally invalidates the entry.
// ---------------------------------------------------------------------------

/** Bump when the cached value shape (or key format) changes to drop old entries. */
const DIR_CACHE_VERSION = 1;
const DIR_CACHE_STORAGE_KEY = `obrs.dirPathCache.v${DIR_CACHE_VERSION}`;
/** Entries older than this are treated as stale and ignored/pruned. */
const DIR_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Cap stored entries to keep localStorage bounded (the route set is small). */
const DIR_CACHE_MAX_ENTRIES = 50;

interface CachedDirEntry {
  path: google.maps.LatLngLiteral[];
  ts: number;
}

/** In-memory tier, shared across all panel instances within the SPA session. */
const dirPathMemCache = new Map<string, CachedDirEntry>();

/** Validate that a value is a non-trivial array of {lat,lng} literals. */
function isValidDirPath(path: unknown): path is google.maps.LatLngLiteral[] {
  return (
    Array.isArray(path) &&
    path.length > 1 &&
    path.every(
      (p) =>
        p != null &&
        typeof (p as { lat?: unknown }).lat === 'number' &&
        typeof (p as { lng?: unknown }).lng === 'number'
    )
  );
}

/** Read + parse the localStorage cache object; returns {} on any failure. */
function readDirStore(): Record<string, CachedDirEntry> {
  try {
    const raw = window.localStorage.getItem(DIR_CACHE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, CachedDirEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // localStorage unavailable (private mode / SSR) or corrupt JSON.
    return {};
  }
}

/** Persist the store, pruning expired entries and capping total size. */
function writeDirStore(store: Record<string, CachedDirEntry>): void {
  try {
    const now = Date.now();
    let entries = Object.entries(store).filter(
      ([, e]) => e && now - e.ts < DIR_CACHE_TTL_MS
    );
    if (entries.length > DIR_CACHE_MAX_ENTRIES) {
      // Keep the most-recently-written entries.
      entries = entries
        .sort((a, b) => b[1].ts - a[1].ts)
        .slice(0, DIR_CACHE_MAX_ENTRIES);
    }
    window.localStorage.setItem(
      DIR_CACHE_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(entries))
    );
  } catch {
    // localStorage unavailable/full (private mode, quota) — the in-memory tier
    // still serves this session; nothing else to do.
  }
}

/** Look up a cached road path by key. Checks memory first, then localStorage. */
function readDirPathCache(key: string): google.maps.LatLngLiteral[] | null {
  const now = Date.now();
  const mem = dirPathMemCache.get(key);
  if (mem && now - mem.ts < DIR_CACHE_TTL_MS && isValidDirPath(mem.path)) {
    return mem.path;
  }
  const stored = readDirStore()[key];
  if (stored && now - stored.ts < DIR_CACHE_TTL_MS && isValidDirPath(stored.path)) {
    dirPathMemCache.set(key, stored); // hydrate the memory tier
    return stored.path;
  }
  return null;
}

/** Store a computed road path under key in both tiers. */
function writeDirPathCache(
  key: string,
  path: google.maps.LatLngLiteral[]
): void {
  if (!isValidDirPath(path)) {
    return;
  }
  const entry: CachedDirEntry = { path, ts: Date.now() };
  dirPathMemCache.set(key, entry);
  const store = readDirStore();
  store[key] = entry;
  writeDirStore(store);
}

/** Clear both cache tiers. Exposed for tests and future cache-busting. */
export function clearDirectionsPathCache(): void {
  dirPathMemCache.clear();
  try {
    window.localStorage.removeItem(DIR_CACHE_STORAGE_KEY);
  } catch {
    // ignore — nothing to clear if storage is unavailable.
  }
}

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
  /** Localized title for the user marker; supplied by the parent. */
  @Input() userMarkerTitle = 'You are here';

  // Emitted after geolocation resolves so the parent can auto-select the nearest
  // pickup and feed straight-line distances into the stop list.
  @Output() userLocated = new EventEmitter<UserLocatedEvent>();

  // Marker clicks drive selection the same way the left-hand list does — the
  // parent (route-map-home) feeds these back in as selectedPickupSlug/Stop, so
  // the map and the list stay in sync regardless of which one the user clicks.
  @Output() pickupStopSelected = new EventEmitter<RouteStop>();
  @Output() dropoffStopSelected = new EventEmitter<RouteStop>();

  @ViewChild('mapContainer') mapContainer!: ElementRef;
  @ViewChild(GoogleMap) map?: GoogleMap;

  mapsLoaded = false;
  mapsError = false;

  // ---------------------------------------------------------------------------
  // "Use my location" state
  // ---------------------------------------------------------------------------

  /** True while a geolocation request is in flight (drives the button spinner). */
  locating = false;

  /** Last geolocation failure reason, surfaced to the user. Null when none. */
  locationError: 'denied' | 'unavailable' | null = null;

  /** The user's resolved position, or null before they tap "Use my location". */
  userLocation: google.maps.LatLngLiteral | null = null;

  /** Stable marker options for the user pin — only reassigned when userLocation changes. */
  userMarkerOptions: google.maps.MarkerOptions | null = null;

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
    cameraControl: false,
    zoomControl: false,
  };

  polylinePath: google.maps.LatLngLiteral[] = [];

  // Constant — never changes, so safe as a readonly field.
  readonly polylineOptions: google.maps.PolylineOptions = {
    strokeColor: MAP_PICKUP_COLOR,
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

  constructor(private zone: NgZone) {}

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

  // ---------------------------------------------------------------------------
  // Custom zoom control (replaces Google's un-styleable default zoomControl)
  // ---------------------------------------------------------------------------

  /**
   * Increment the map's zoom level by one. Google clamps the result to the
   * map's min/max zoom automatically, so no bounds-checking is needed here.
   */
  zoomIn(): void {
    const gm = this.map?.googleMap;
    if (!gm) {
      return;
    }
    gm.setZoom((gm.getZoom() ?? 10) + 1);
  }

  /** Decrement the map's zoom level by one. See {@link zoomIn} for clamping notes. */
  zoomOut(): void {
    const gm = this.map?.googleMap;
    if (!gm) {
      return;
    }
    gm.setZoom((gm.getZoom() ?? 10) - 1);
  }

  // ---------------------------------------------------------------------------
  // "Use my location" → nearest pickup
  // ---------------------------------------------------------------------------

  /**
   * Resolve the user's current position via the browser Geolocation API, drop a
   * "you are here" marker, frame the map around the user + pickup stops, and emit
   * straight-line distances (plus the nearest pickup slug) to the parent.
   *
   * Geolocation callbacks may fire outside Angular's zone depending on the
   * browser, so the handlers are re-entered via NgZone.run to guarantee change
   * detection picks up the state changes.
   */
  useMyLocation(): void {
    if (!('geolocation' in navigator)) {
      this.locationError = 'unavailable';
      return;
    }

    this.locating = true;
    this.locationError = null;

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        this.zone.run(() =>
          this.onLocationResolved(pos.coords.latitude, pos.coords.longitude)
        ),
      (err) =>
        this.zone.run(() => {
          this.locating = false;
          this.locationError =
            err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
        }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  private onLocationResolved(lat: number, lng: number): void {
    this.locating = false;
    this.userLocation = { lat, lng };
    this.userMarkerOptions = this.buildUserMarkerOptions(this.userLocation);
    this.emitDistances();
    this.frameUserAndPickups();
  }

  /**
   * Compute straight-line (haversine) distances from the user to every pickup
   * stop with coordinates, find the nearest, and emit both to the parent.
   * No-op when the user hasn't located yet — lets ngOnChanges re-emit safely
   * after a direction toggle changes the pickup set.
   */
  private emitDistances(): void {
    if (!this.userLocation) {
      return;
    }
    const distancesKm: Record<string, number> = {};
    let nearestPickupSlug: string | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;

    for (const stop of this.pickupStops) {
      if (stop.latitude === null || stop.longitude === null) {
        continue;
      }
      const km = this.haversineKm(this.userLocation, {
        lat: stop.latitude,
        lng: stop.longitude,
      });
      distancesKm[stop.slug] = km;
      if (km < nearestDist) {
        nearestDist = km;
        nearestPickupSlug = stop.slug;
      }
    }

    this.userLocated.emit({ nearestPickupSlug, distancesKm });
  }

  /** Frame the map to include the user and all pickup stops with coordinates. */
  private frameUserAndPickups(): void {
    const win = window as unknown as GoogleWindow;
    if (!this.userLocation || !this.map || !win.google?.maps) {
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(this.userLocation);
    for (const stop of this.pickupStops) {
      if (stop.latitude !== null && stop.longitude !== null) {
        bounds.extend({ lat: stop.latitude, lng: stop.longitude });
      }
    }
    this.map.fitBounds(bounds, 48);
  }

  /** Great-circle distance between two lat/lng points, in kilometres. */
  private haversineKm(
    a: google.maps.LatLngLiteral,
    b: google.maps.LatLngLiteral
  ): number {
    const R = 6371; // Earth radius in km
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  private buildUserMarkerOptions(
    pos: google.maps.LatLngLiteral
  ): google.maps.MarkerOptions {
    return {
      position: pos,
      icon: {
        url: this.buildUserMarkerUrl(),
        scaledSize: new google.maps.Size(28, 28),
        anchor: new google.maps.Point(14, 14),
      },
      title: this.userMarkerTitle,
      zIndex: 200, // above stop markers
    };
  }

  private buildUserMarkerUrl(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="13" fill="#4285F4" fill-opacity="0.2"/>
      <circle cx="14" cy="14" r="7" fill="#4285F4" stroke="#ffffff" stroke-width="3"/>
    </svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  // ---------------------------------------------------------------------------
  // Marker click → selection (map markers mirror the list)
  // ---------------------------------------------------------------------------

  onPickupMarkerClick(slug: string): void {
    const stop = this.pickupStops.find((s) => s.slug === slug);
    if (stop) {
      this.pickupStopSelected.emit(stop);
    }
  }

  onDropoffMarkerClick(slug: string): void {
    const stop = this.dropoffStops.find((s) => s.slug === slug);
    if (stop) {
      this.dropoffStopSelected.emit(stop);
    }
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
        // is already set and a Directions key was registered, resolve the
        // road-snap now that the DirectionsService is available — from cache if
        // possible, otherwise via a Directions request.
        if (
          this.straightPath.length > 1 &&
          this.lastDirReqKey &&
          this.dirReqDispatchedSeq !== this.dirReqSeq
        ) {
          this.resolveDirections(this.dirReqSeq);
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
      // If the user has already located, the pickup set just changed (e.g. a
      // direction toggle) — recompute distances against the new stops so the
      // list badges and nearest-pickup highlight stay correct.
      this.emitDistances();
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
      cameraControl: false,
      zoomControl: false,
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

    // Cache hit → use the stored road-snapped path immediately and skip the
    // billable Directions call entirely (no maps script needed). Marking the
    // request dispatched also stops ngOnInit's deferred re-fire from querying.
    const cached = readDirPathCache(reqKey);
    if (cached) {
      this.polylinePath = cached;
      this.dirReqDispatchedSeq = seqId;
      return;
    }

    // Cache miss: fire Directions only when maps is already loaded. If maps
    // hasn't loaded yet, ngOnInit's .then() will re-fire using straightPath.
    const win = window as unknown as GoogleWindow;
    if (this.straightPath.length > 1 && win.google?.maps) {
      this.dirReqDispatchedSeq = seqId;
      void this.requestDirectionsPath(this.straightPath, reqKey, seqId);
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
      options: this.buildMarkerOptions(stop, this.selectedPickupSlug, MAP_PICKUP_COLOR),
    }));
  }

  private recomputeDropoffMarkers(): void {
    const win = window as unknown as GoogleWindow;
    if (!win.google?.maps) {
      return;
    }
    this.dropoffMarkers = this.dropoffStops.map((stop) => ({
      slug: stop.slug,
      options: this.buildMarkerOptions(stop, this.selectedDropoffSlug, MAP_DROPOFF_COLOR),
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
   * Build a deduplication / cache key from the ordered stops. Each stop token
   * includes its slug AND rounded coordinates, so two calls with the same stops
   * (same order, same position) produce the same key — but an admin coordinate
   * edit changes the token and naturally invalidates any cached road path. The
   * version prefix lets us bust all keys when the format changes.
   */
  private buildRequestKey(): string {
    const token = (s: RouteStop): string =>
      `${s.slug}@${(s.latitude as number).toFixed(5)},${(s.longitude as number).toFixed(5)}`;
    const pickupTokens = this.pickupStops
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .sort((a, b) => a.order - b.order)
      .map(token);
    const dropoffTokens = this.dropoffStops
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .sort((a, b) => a.order - b.order)
      .map(token);
    return `v${DIR_CACHE_VERSION}|${[...pickupTokens, ...dropoffTokens].join('|')}`;
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
   * Resolve the road-snapped path for the current request key: serve it from
   * the persistent cache when present (skipping the billable Directions call),
   * otherwise dispatch a Directions request. Marks the request dispatched for
   * `seqId` either way, so ngOnInit's deferred re-fire won't duplicate it.
   * Callers must ensure the maps script is loaded before invoking.
   */
  private resolveDirections(seqId: number): void {
    this.dirReqDispatchedSeq = seqId;
    const cached = readDirPathCache(this.lastDirReqKey);
    if (cached) {
      this.polylinePath = cached;
      return;
    }
    void this.requestDirectionsPath(this.straightPath, this.lastDirReqKey, seqId);
  }

  /**
   * Request road-snapped geometry for `straightPath` from the Directions API,
   * chunking if needed to stay within the waypoint limit.
   *
   * - Sets `polylinePath` to the road-snapped path on full success and caches
   *   it under `cacheKey` so repeat views skip the API (OBRS-91).
   * - Falls back to `straightPath` (already assigned) on any error — the map
   *   is never left blank — and does NOT cache a failed/partial result.
   * - Discards stale responses via the `seqId` guard: if `dirReqSeq` has
   *   advanced since this request was fired, the result is silently dropped.
   */
  private async requestDirectionsPath(
    straightPath: google.maps.LatLngLiteral[],
    cacheKey: string,
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
      // Persist the deterministic road path so repeat views skip the API.
      writeDirPathCache(cacheKey, combined);
    } catch (e) {
      // Covers: DirectionsService constructor unavailable, network failures,
      // API not enabled on this key, quota exceeded, etc.
      console.warn('[RouteMapPanel] Directions API error; using straight-line path.', e);
      // polylinePath is already set to straightPath — no action needed.
    }
  }
}
