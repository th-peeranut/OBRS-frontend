// SPEC-OBRS-426 BR-22: single source of truth for the Leaflet/MapTiler tile
// request + attribution, shared by every map surface in the app — the
// internal fleet live map (OBRS-424) and the customer trip-track map
// (OBRS-426). Extracted out of `modules/staff/pages/fleet-map/` (its original
// home) so a customer-shell component doesn't take a runtime dependency on
// staff-domain code (locked decision §4 "ห้ามเอา logic ปนกัน" — a constant
// carries no logic, but the import path still shouldn't cross the shell
// boundary). `fleetMapTileUrl`/`FLEET_MAP_TILE_ATTRIBUTION` re-export from
// this module at their original location so OBRS-424's imports and specs
// stay byte-identical. See docs/adr/0024-leaflet-fleet-live-map.md and
// docs/adr/0025-leaflet-customer-trip-map.md.

/** The ONE place the tile request URL is composed. Takes the key as a
 * parameter rather than baking it in — the key itself is genuinely plumbed
 * through multiple `environment.*.ts` files (one per surface's own key), and
 * this function's job is to make the tile REQUEST FORMAT (host/path/style) a
 * one-line change if it ever needs to change again. */
export function mapTileUrl(key: string): string {
  return `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${key}`;
}

// MapTiler's terms require BOTH MapTiler and OpenStreetMap credited, with the
// link visible — never pass `attributionControl: false` to L.map(...) and
// never manually removeControl(map.attributionControl).
export const MAP_TILE_ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>';
