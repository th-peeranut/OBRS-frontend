// UX-OBRS-424-fleet-live-map.md §4.1/§9.1.
import { mapTileUrl, MAP_TILE_ATTRIBUTION } from '../../../../shared/lib/map-tiles';

/** Upstream GPS pushes land at ~1 min cadence (OBRS-423). Do NOT poll faster. */
export const FLEET_MAP_POLL_INTERVAL_MS = 60000;

/** SPEC-OBRS-426 BR-22: the tile URL/attribution are now composed in
 * `shared/lib/map-tiles.ts` (shared with the customer trip-track map) —
 * re-exported here under their original names so this card's existing
 * imports/specs stay byte-identical. See
 * docs/adr/0024-leaflet-fleet-live-map.md and
 * docs/adr/0025-leaflet-customer-trip-map.md. */
export const fleetMapTileUrl = mapTileUrl;
export const FLEET_MAP_TILE_ATTRIBUTION = MAP_TILE_ATTRIBUTION;

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
