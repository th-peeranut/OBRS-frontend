# ADR 0024 — Leaflet + MapTiler for the internal fleet live map (layer 1)

**Date:** 2026-07-19
**Status:** Accepted
**Branch:** `ao/obrs-424-fleet-live-map`

## Context

OBRS-424 adds `/staff/fleet-map`: a staff-area page showing all fleet
vehicles on one map, auto-refreshing every 60s, sourced from OBRS-423's
`GET /api/private/vehicles/positions`. The only existing map component in
this codebase, `RouteMapPanelComponent` (`src/app/modules/home/components/route-map/route-map-panel/`,
~900 lines), is Google-Maps-specific and booking-coupled (pickup/dropoff
selection, Directions-API road-snapping, a shared user-location flow) — not a
fit for a read-only fleet-position monitor, and reusing it would mean
threading fleet-map concerns through a component whose contract is already
booking-shaped.

This card introduces a second, independent mapping stack: **Leaflet** +
**MapTiler** raster tiles, coexisting with `@angular/google-maps`.

## Decision: Leaflet + MapTiler, not `@angular/google-maps`

**Leaflet** was already the pre-decided direction for the *next* mapping
surface — OBRS-301 (the GPS-tracking spike this card's contract, OBRS-422/423,
was built under) commits Leaflet for the customer-facing layer 2
("where's my van", OBRS-425/426), which is where real traffic/volume would
actually land. Building layer 1 (this card, a 6-vehicle internal staff tool)
on Google Maps instead would force layer 2 into one of two bad options later:
absorb real Google Maps billing at that point, or get rewritten off Google
to match the already-committed Leaflet direction. Building layer 1 on the
stack layer 2 already needs avoids that fork entirely — one mapping library
serves both GPS-tracking surfaces, `@angular/google-maps` stays scoped to the
booking flow it was built for.

**MapTiler**, not raw OpenStreetMap tiles, was the owner's call once this
card reached implementation (rev. 3 of `UX-OBRS-424-fleet-live-map.md` — see
its §13 changelog; the two earlier revisions carried this as an open `TBD`).

### Why MapTiler over Google — the real rationale, not the obvious-sounding one

**Cost did not decide this.** Checked live pricing before deciding: at this
card's volume (a staff-only tool, 6 vehicles, polled every 60s), Google
Dynamic Maps' free tier (10,000 map loads/month) and MapTiler's free tier are
both effectively ฿0 — neither is close to being reached. Anyone reasoning
"MapTiler because Google costs money" is reasoning from a premise this card
disproved by checking. What actually decided it:

1. **The OBRS-301 Leaflet commitment above.** Leaflet needs a tile provider
   regardless of which one; Google Maps tiles are not obtainable through
   Leaflet's tile-layer model on comparable terms (Google's terms require the
   Google Maps JS API, not a raw XYZ tile URL) — so "Leaflet + Google tiles"
   isn't actually an available combination the way "Leaflet + MapTiler" or
   "Leaflet + raw OSM" are. Once Leaflet was chosen for the reason above, the
   real remaining choice was MapTiler vs. raw OSM tiles, not MapTiler vs.
   Google.
2. **The existing Google Maps key (`environment.*.mapsApiKey`) is
   referrer-restricted**, with a documented history of failing on
   `localhost` (see `RouteMapPanelComponent`'s own key-loading code and the
   local-dev friction it has caused). Reusing that key for a second surface
   would directly obstruct this card's own local-lane QA
   (`docs/manual-tests` / the local-verify convention) — a self-inflicted
   problem a MapTiler key configured for `localhost` + the real deploy
   origins avoids from day one.

MapTiler over raw OSM tiles specifically: MapTiler's hosted endpoint is a
single reliable host with a documented free tier and simple domain-restricted
key management, versus self-hosting or depending on OSM's own
rate-limited-for-production tile servers (OSM's usage policy explicitly
disallows this kind of application-embedded, polled use of `tile.openstreetmap.org`
without a dedicated arrangement).

## Consequences

- **Two mapping libraries now coexist in the bundle** (`@angular/google-maps`
  + `leaflet`), accepted — they are never rendered on the same page, and
  Leaflet is materially smaller than the Google Maps JS API's footprint. No
  plan to unify them; `RouteMapPanelComponent` stays on Google Maps, this
  card's `FleetMapPanelComponent` and the future OBRS-425/426 stay on
  Leaflet.
- **The tile *request format*** (host/path/style) is composed in exactly one
  function, `fleetMapTileUrl(key)`
  (`src/app/modules/staff/pages/fleet-map/fleet-map.constants.ts`) — a
  one-line change if the style/host ever needs to change again. The MapTiler
  API **key** itself is normal multi-file `environment.*.ts` plumbing
  (`environment.base.ts` / `.sit.ts` / `.prod.ts` / `.local.example.ts`),
  mirrored exactly off the existing `mapsApiKey` shape — that's real,
  unavoidable surface area for "how does a key reach the browser," not a
  design gap `fleetMapTileUrl()` could hide.
- **No MapTiler key is provisioned yet** (the owner has been asked).
  `environment.base.ts` ships `maptilerKey: ''`, so CI and every fresh clone
  take the empty-key path by default: `FleetMapPanelComponent.canShowMap`
  (mirroring `RouteMapPanelComponent.showMap`) skips `L.map(...)` entirely
  and renders the `STAFF.FLEET_MAP.MAP_UNAVAILABLE` placeholder. The side
  list (`FleetVehicleStatusListComponent`) has no dependency on the map key
  at all, so the fleet's operational status stays fully readable with zero
  key configured — this is the primary, expected state until the key lands,
  not a degraded edge case.
- **Dark-mode tiles deliberately stay light in both themes** — the same
  precedent already set for the Google map (`dark-theme.scss:562-565`). This
  is a **prerequisite**, not incidental, for the marker-fill pattern this
  card also introduces (`design-system.md` §12): a marker's fill/halo reuses
  the `.admin-status` tokens' `-text`/`-bg` pair, and
  `--admin-success-*`/`--admin-warning-*`/`--admin-danger-*` have **no**
  dark-mode override anywhere in this codebase (`design-system.md` §2.4). The
  marker only stays legible because it always sits on a light tile surface —
  a future card adding dark tiles must add those token overrides FIRST,
  following the exact verified-contrast pattern already used for
  `--admin-neutral-*`/`--admin-inreview-*`.
- **`app-admin-dropdown`/every other design-system control** is unaffected —
  this page has no form selects (read-only monitoring, §6 of the UX spec).

## Security note — pre-empting a false alarm

The MapTiler key is visible in every tile request URL in the browser's
network tab (`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=...`).
**This is inherent to client-side tile requests, not a leak.** MapTiler keys
are designed to be used this way — mitigated by **domain/referrer
restriction in the MapTiler dashboard**, the same control model already
relied on for the existing `mapsApiKey`, not by concealment. Recorded here so
`obrs-security-audit`'s next pass doesn't file this as a leaked-secret
finding.

## Alternatives considered

- **`@angular/google-maps` (reuse `RouteMapPanelComponent`'s stack).**
  Rejected — see "Why MapTiler over Google" above; also would have coupled a
  read-only fleet monitor to a 900-line booking-flow component's contract.
- **Leaflet + raw OpenStreetMap tiles (no MapTiler).** Rejected — OSM's tile
  usage policy disallows this kind of polled, application-embedded
  production use without a dedicated arrangement; MapTiler's hosted, keyed
  endpoint is the supported path for exactly this use case.
- **A `{s}`-sharded tile URL template.** Rejected — OSM retired subdomain
  sharding and MapTiler's endpoint is a single host; a `{s}` placeholder here
  would 404.
