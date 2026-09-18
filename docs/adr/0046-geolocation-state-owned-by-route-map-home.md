# ADR 0046 — "Use my location" state moves from `route-map-panel` up to `route-map-home`

**Date:** 2026-09-15
**Status:** Accepted
**Branch:** `ao/obrs-1214-locate-me-on-stop-tab`

## Context

Before this card, "use my location" was entirely owned by `route-map-panel`:
the button lived as an overlay control on the `<google-map>` itself
(`.map-overlay-controls`), and `locating`/`locationError`/`userLocation` plus
`useMyLocation()`/`onLocationResolved()`/`emitDistances()`/the haversine
helper all lived on `RouteMapPanelComponent`. The panel emitted a resolved fix
to the parent via `@Output() userLocated`.

That placement made the feature unreachable without first paying for
`maps.googleapis.com/maps/api/js` (ADR 0039, OBRS-1211): the panel — and
therefore its button — only mounts once `RouteMapHomeComponent.mapRevealed`
is true, and reveal is behind an explicit tap. So a customer who wanted their
nearest pickup had to reveal the paid map first, defeating half the point of
"nearest pickup" (finding it without scrolling a list).

OBRS-1214 moves the button onto `<app-route-stop-list>`'s pickup instance —
the default tab, rendered unconditionally on page load — which requires it
to work with no `<app-route-map-panel>` mounted at all.

## Decision

Move all geolocation state and logic up to `RouteMapHomeComponent`:
`locating`, `locationError`, `userLocation` become fields there;
`onUseMyLocation()` (renamed from `useMyLocation()` since it is no longer a
component's own "please locate me" verb but a home-level action handler),
`onLocationResolved()`, `emitDistances()` and the haversine helper move with
them. `emitDistances()` calls `onUserLocated()` — the same handler the
panel's `(userLocated)` output used to call — directly, since resolver and
handler are now the same component; the panel's `@Output() userLocated` is
deleted along with the button and its error banner.

`RouteMapPanelComponent` changes from state OWNER to state RECEIVER: it gains
`@Input() userLocation: google.maps.LatLngLiteral | null`, and keeps
`userMarkerOptions`/`buildUserMarkerOptions()`/`frameUserAndPickups()` — the
parts that genuinely need the live `GoogleMap` instance — behind a new
`applyUserLocation()` gate that only acts once **both** `this.map` and
`this.userLocation` are set.

## Why two triggers instead of one

`applyUserLocation()` is called from two places: `ngOnChanges` (when the
`userLocation` input changes) and `onTilesLoaded()` (when the map finishes
its first draw). Before this card the map always existed by the time the
button could be pressed — same component, one `useMyLocation()` call site,
`this.map` already resolved. After this card that ordering flips: the common
path is now "tap 'use my location' on the pickup list" **before** the map
has ever been revealed, so `userLocation` arrives at the panel as an input
before `this.map` exists. A single trigger on the input alone would silently
never place the marker for anyone who located first and revealed the map
second — which, post-OBRS-1211, is most people. `onTilesLoaded()` catches
that case; the input-change trigger still covers the other order (map already
revealed, then the user locates).

## Consequences

- `route-map-home.component.spec.ts` gained the geolocation/haversine/
  nearest-pickup unit tests that used to live in
  `route-map-panel.component.spec.ts`; the panel spec now only exercises the
  `userLocation` input's two triggers (with `this.map` stubbed directly, the
  same pattern the existing `zoomIn`/`zoomOut` tests already used).
- `RouteMapHomeComponent`'s constructor gained an `NgZone` dependency (the
  geolocation callback re-entry the panel used to do with its own injected
  `NgZone`).
- `applyRouteData()` now calls `emitDistances()` once the new pickup set
  arrives (initial load, a direction toggle, or a language re-fetch),
  preserving the pre-existing "re-locate against the new stop set" behaviour
  that used to fall out of the panel's `ngOnChanges` re-firing
  `emitDistances()` on every `pickupStops`/`dropoffStops` change.
- `route-stop-list.component.ts` gained `showLocateMe`/`locating`/
  `locationError`/`locateMeClicked`, all defaulting off, so the dropoff list
  and the change-stop dialog (`confirmMode="per-side"`) are unaffected.
