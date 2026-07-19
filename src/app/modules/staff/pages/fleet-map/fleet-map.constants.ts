// UX-OBRS-424-fleet-live-map.md §4.1/§9.1.

/** Upstream GPS pushes land at ~1 min cadence (OBRS-423). Do NOT poll faster. */
export const FLEET_MAP_POLL_INTERVAL_MS = 60000;

/** The ONE place the tile request URL is composed. Takes the key as a
 * parameter rather than baking it in, because the key itself is genuinely
 * plumbed through 4 environment.*.ts files (§4.3) — that's real, unavoidable
 * surface area for "how does a key reach the browser," not something this
 * function can hide. What this function DOES make a one-line change is the
 * tile REQUEST FORMAT (host/path/style) if that ever needs to change again. */
export function fleetMapTileUrl(key: string): string {
  return `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${key}`;
}

// MapTiler's terms require BOTH MapTiler and OpenStreetMap credited, with the
// link visible — never pass `attributionControl: false` to L.map(...) and
// never manually removeControl(map.attributionControl). See §4.1 and
// docs/adr/0024-leaflet-fleet-live-map.md.
export const FLEET_MAP_TILE_ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>';

/** Chonburi-Bangkok corridor default center (§4.5). */
export const FLEET_MAP_DEFAULT_CENTER: [number, number] = [13.3622, 100.9847];
export const FLEET_MAP_DEFAULT_ZOOM = 9;

/** fitBounds() padding, px (§4.5). */
export const FLEET_MAP_FIT_BOUNDS_PADDING: [number, number] = [40, 40];

/** fitBounds() zoom ceiling. A single marker-eligible vehicle produces
 * zero-size bounds, and Leaflet then fits at the tile layer's maxZoom (18) —
 * street level on one van, with no fleet context. Day one (one tracker
 * installed) is exactly that state. */
export const FLEET_MAP_FIT_MAX_ZOOM = 14;
