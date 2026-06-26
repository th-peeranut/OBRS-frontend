# ADR 0005: Interactive Route Pickup/Drop-off Map on Home Page

## Status
Accepted

## Context

The previous home page showed a static `StationHomeComponent` listing service stations.
The product requirement replaced this with an interactive 3-panel UI:
- A pickup-stop selector (left)
- A Google Map showing the full route (center)
- A drop-off stop selector + trip summary (right)

When the user selects pickup + drop-off stops and presses confirm, the existing
`HomeBookingComponent` booking form must be pre-filled with those stations and the
search executed — without requiring duplicate API calls or a new NgRx slice.

## Decision

### Component family under `home/components/route-map/`

| Component | Type | Purpose |
|---|---|---|
| `RouteMapHomeComponent` | Smart container | Loads data via `RouteMapService`, manages selection state, emits `pickupDropoffConfirmed` event |
| `RouteStopListComponent` | Dumb | Numbered scrollable stop list (pickup or drop-off) |
| `RouteMapPanelComponent` | Dumb | Google Map with numbered SVG markers + polyline |
| `RouteStopDetailCardComponent` | Dumb | p-card detail for a selected stop |
| `RouteTravelSummaryComponent` | Dumb | Trip summary (counts, distance, duration) |

All components are NgModule-declared in `HomeModule` — **no standalone components**.

### Google Maps integration

`@angular/google-maps@^18` is added as a direct dependency.  
The Maps JS API script is injected **dynamically** in `RouteMapPanelComponent.ngOnInit()`
only when `environment.mapsApiKey` is non-blank and `window.google?.maps` is not
already present (ADDENDUM A3 script-race guard).

When `mapsApiKey` is blank (the default in all environments), `showMap` evaluates to
`false` and the component renders a `<div class="route-map-placeholder">` with a
Bootstrap icon — **no JS error, no runtime exception**.

Markers use a custom numbered SVG data-URL icon (`<map-marker>` not `<map-advanced-marker>`)
to avoid the need for a Maps ID and the `marker` library.

### ViewChild hand-off to `HomeBookingComponent` (ADDENDUM A1)

`HomeComponent` receives the `(pickupDropoffConfirmed)` event from `RouteMapHomeComponent`
and uses `@ViewChild(HomeBookingComponent)` to:
1. Call `onStartStationChange(pickupStation)` and `onEndStationChange(dropoffStation)`
   to pre-fill the booking form.
2. Check `homeBookingRef.isPassengerSelected` before calling `onSearch()`.
   If no passengers are selected, an `alertService.warning()` is shown and navigation
   is aborted.

This pattern avoids a shared NgRx slice for the pickup/drop-off selection —
`RouteMapHomeComponent`'s selection state is purely UI-local.

### Responsive layout

- **≥1200px** (desktop): 3-column Bootstrap grid (col-xl-3 / col-xl-6 / col-xl-3).
- **<1200px** (tablet/mobile): `p-tabView` with three tabs (จุดรับ / แผนที่ / จุดส่ง).

`BreakpointObserver` from `@angular/cdk/layout` drives the `isDesktop` flag.
CSS handles within-breakpoint reflow; the structural `*ngIf isDesktop` switch
is reserved for the 3-col ↔ 3-tab layout change only.

### Route slug resolution (ADDENDUM A2)

`RouteMapService.getFirstActiveRouteSlug()` normalizes the `status` field which
may arrive as a plain string **or** an object `{ code, slug, … }`:

```ts
const normalized =
  typeof status === 'object'
    ? String(status?.code ?? status?.slug ?? '').toLowerCase()
    : String(status).toLowerCase();
return normalized === 'active';
```

`environment.homeRouteSlug` short-circuits the `/api/routes` list call — if the slug
is configured the service fetches directly, falling back to the list only when blank.

### Backend API contract

`GET /api/routes/{slug}/pickup-dropoff` returns `RoutePickupDropoffResponse`
as defined in `src/app/shared/interfaces/route-map.interface.ts`.
The `originProvinceLabel` / `destinationProvinceLabel` fields come from the
API — they are **not** derived by splitting `titleLocalized`.

## Consequences

- The `@angular/google-maps` dependency is now a direct dependency.  
  Map rendering is a degraded-graceful feature: blank `mapsApiKey` → placeholder only.
- `StationHomeComponent` remains declared in `HomeModule` (not deleted) but is no
  longer referenced in the home template. It can be removed in a future cleanup sprint.
- The `HomeBookingComponent.isPassengerSelected` getter was added as a minimal public
  surface to support the ViewChild hand-off guard in A1 without exposing unrelated
  form internals.
