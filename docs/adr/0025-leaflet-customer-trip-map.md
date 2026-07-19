# ADR 0025 — Leaflet + MapTiler for the customer trip-track map (layer 2)

**Date:** 2026-07-19
**Status:** Accepted
**Branch:** `ao/obrs-426-customer-trip-map`

## Context

OBRS-426 adds a per-trip "where is my bus" tracker to the my-bookings ticket
modal — one Leaflet map per journey leg, showing the vehicle's position (when
tracked) alongside the customer's own boarding-stop marker, polling
`GET /api/private/tickets/{ticketId}/vehicle-position` (OBRS-425). This is the
**first customer-facing** consumer of a Leaflet map in this codebase; the only
prior Leaflet surface, `FleetMapPanelComponent` (OBRS-424, ADR-0024), is
staff-only.

`docs/design-system.md` §12's Leaflet+MapTiler entry (added by ADR-0024) reads
*"Reuse Leaflet+MapTiler (not `@angular/google-maps`, not raw OSM tiles) for
the next **internal/high-frequency** map feature."* This card is
**customer-facing and low-frequency** (one modal open per trip, polled at
60s/5min — see BR-15/BR-16 of `SPEC-OBRS-426-customer-trip-map.md`), so that
qualifier does not, on its own wording, reach this surface. This ADR records
the decision on its own merits rather than borrowing ADR-0024's citation
verbatim — the spec's own review process (revision 2) caught exactly this gap
in an earlier draft that claimed "no justification needed."

## Decision: Leaflet + MapTiler, reused as-is (not `@angular/google-maps`)

1. **The alternative in-repo stack is `@angular/google-maps`**
   (`RouteMapPanelComponent`, booking-flow-coupled, ~900 lines). Its API key
   (`environment.*.mapsApiKey`) is referrer-restricted with a documented
   `localhost` failure mode (ADR-0024) — this card's verification lane is
   local-only (`obrs-local-verify-lane`: no external API is added, so no SIT
   deploy is required), and a Google Maps key that fails on `localhost` would
   directly obstruct that lane.
2. **OBRS-301's prior commitment.** The GPS-tracking spike epic already
   named Leaflet as the intended stack for this exact layer-2 surface before
   either OBRS-424 or OBRS-426 were implemented (see ADR-0024's own
   "Decision" section) — this card fulfills that commitment rather than
   opening a fresh choice.
3. **Bundle cost on the surface that matters most.** A customer standing at
   the roadside on mobile data is precisely the user this feature exists for.
   Running two map stacks on any *customer*-facing page would ship both
   bundles' worth of map JS to that connection for one feature; reusing the
   already-proven, materially smaller Leaflet stack avoids that entirely.
4. **The marker fill/halo split and the light-tiles precondition are already
   proven in this repo** (OBRS-424) — the reused surface is a tested one, not
   a first attempt.

## Consequences

- **The tile URL/attribution composition is extracted one level higher.**
  `fleetMapTileUrl()` / `FLEET_MAP_TILE_ATTRIBUTION`
  (`modules/staff/pages/fleet-map/fleet-map.constants.ts`) move to
  `src/app/shared/lib/map-tiles.ts` as `mapTileUrl()` / `MAP_TILE_ATTRIBUTION`
  — the single source of truth for both the staff fleet map and this card's
  customer map. `fleet-map.constants.ts` re-exports the old names unchanged
  so OBRS-424's imports and specs stay byte-identical. A customer-shell
  component importing a constant out of `modules/staff/` would be a
  cross-shell dependency the locked product decision (§4, "ห้ามเอา logic
  ปนกัน") forbids in spirit even for a constant with no logic — this
  extraction avoids that without duplicating the licensing-obligation string.
- **`--admin-*` CSS custom properties are re-declared, not imported.**
  `FleetMapPanelComponent`'s marker styling reads `--admin-success-text` /
  `--admin-warning-*` / `--admin-danger-*`, which only exist inside
  `.admin-shell` — copying that styling into the customer shell verbatim
  would render invisible (unfilled) markers. Per the established
  `ParcelTrackingPageComponent` (OBRS-305) / `MyReportsComponent` (OBRS-433)
  precedent (`docs/design-system.md` §12), `TripTrackPanelComponent`'s `:host`
  re-declares the SAME token *values* for its status chip. The Leaflet marker
  itself goes one step further and uses its OWN CSS custom-property names
  (`--trip-track-marker-*`, never `--admin-*`) — the marker HTML is injected
  by Leaflet directly (`L.DivIcon`'s raw `html` string) and is asserted by a
  dedicated unit test (`trip-track-map.component.spec.ts` U28) to carry no
  `--admin-` reference at all, so a future edit can't silently reintroduce the
  admin-shell coupling even though the *values* happen to match.
- **STALE must be visibly distinct from LIVE — the card's worst-case
  failure.** The vehicle marker's STALE styling is not merely an additive
  class: it swaps the fill/halo CSS variable NAMES, adds a dashed halo, and
  drops opacity to 0.55, and the panel additionally renders a persistent
  warning banner above the map (BR-11). Pinned with unit tests (U29–U31)
  asserting both that a LIVE→STALE transition changes the rendered marker AND
  that a STALE→LIVE round trip correctly un-degrades it — not just the first
  flip.
- **Dark-mode tiles stay light**, same precedent as ADR-0024 — inherited
  automatically since both surfaces call the same `mapTileUrl()`.
- **Two mapping libraries continue to coexist** in the bundle
  (`@angular/google-maps` + `leaflet`); still never rendered on the same page.
  No plan to unify them.

## Alternatives considered

- **`@angular/google-maps` (reuse `RouteMapPanelComponent`'s stack).**
  Rejected — see point 1 above; also this component's map needs no
  Directions-API road-snapping or pickup/dropoff selection, so
  `RouteMapPanelComponent`'s booking-shaped contract would be more surface
  than this feature needs.
- **A brand-new third map stack.** Rejected outright — no card justifies a
  third library when the existing Leaflet+MapTiler stack already satisfies
  every requirement (light tiles, dual attribution, empty-key degradation).
