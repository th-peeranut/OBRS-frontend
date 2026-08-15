# ADR 0039 — Gate the paid Google Maps load behind an explicit user request

**Date:** 2026-08-15
**Status:** Accepted
**Branch:** `ao/obrs-1211-gate-home-map`

## Context

Measured on SIT 2026-08-15 via Playwright `page.on('request')`: opening `/home`
fires `maps.googleapis.com/maps/api/js` on **every visit**, before the visitor
touches anything — 4 requests on desktop (1440×900), 3 on mobile (390×844).
`<app-route-map-panel>` is the sole call site in the whole repo that loads
Maps JS (`route-map-panel.component.ts:87`, confirmed by grep). It is mounted
unconditionally today, both in `route-map-home.component.html`'s desktop
centre column and in its mobile map tab — so every single page view pays for
a paid, rate-limited third-party script whether or not the visitor ever looks
at the map. The booking form itself (station pickers, dates, search) needs
none of this: `RouteMapService.getActiveRoutes()` /
`getPickupDropoffCached()` are separate calls from the Maps JS bootstrap and
stay untouched by this change (`home-booking.component.ts`'s own
`loadRouteSegments()`/`loadProvinceStops()` calls are unaffected).

## Decision

Add a `mapRevealed` flag to `RouteMapHomeComponent`, `false` until a user asks
to see the map. `<app-route-map-panel>` is wrapped in `@if (mapRevealed)` at
both of its two template sites (desktop centre column, mobile map tab); no
other part of `route-map-home.component.html` is gated — stop lists, travel
summary, direction chips and detail cards render exactly as before (AC#3).
Three paths set `mapRevealed = true`:

1. The desktop/mobile placeholder's own "View map" button (`revealMap()`).
2. The "not sure where to board?" link on the booking card above
   (`home-booking.component.ts`'s new `mapHintRequested` output →
   `HomeComponent.onMapHintRequested()` → `routeMapHomeRef.revealMap()`).
3. Tapping the mobile map tab directly (`onTabsValueChange(1)`).

## Why Angular `@if` instead of PrimeNG's `[lazy]` on `p-tabpanel`

`p-tabpanel`'s `[lazy]` input defers *rendering* until the tab is first
activated, but it does that by tab visit, not by user intent — the FIRST
visit to the tab still mounts the child and fires the Maps JS request. On
desktop the map sits in its own permanently-visible column, not behind any
tab at all, so `[lazy]` has nothing to attach to there — the desktop AC (no
request until the user acts) cannot be met by a tab-lazy prop, only by a
condition the component itself controls. Using the same `@if (mapRevealed)`
mechanism on both breakpoints also means one flag, one component field, and
one comment explaining it — not "an Angular condition on desktop, a PrimeNG
prop on mobile" that a future reader has to know are answering the same
question two different ways.

## Why tapping the mobile map tab counts as a request

The mobile map TAB is functionally identical to the desktop "View map"
button and the booking-card hint link: in every case, the user has taken an
action that can only mean "show me the map" — nothing else lives on that
tab. Requiring a SECOND tap (open the tab, then press a placeholder button
inside it) would be gating for the sake of gating: the tap into the tab is
already unambiguous intent, and on that path the placeholder is never seen —
`onTabsValueChange`'s reveal and the tab switch commit in the same synchronous
handler.

The mobile tab still carries the placeholder anyway, because that path is not
the only way in. A viewport resize from desktop to mobile re-renders the mobile
branch with `activeTabIndex` already `1` — which meant DROP-OFF on the strip the
user was just looking at and means MAP on this one — while `mapRevealed` is
still false. Without the placeholder that resize ends on an empty tab with
nothing to press, which is the shape of OBRS-1085 (a blank map surface the user
cannot recover from) rather than a saving. Pinned by
`route-map-home.component.spec.ts` — "mobile map tab reached by a
desktop->mobile resize still offers a way to load the map". The desktop
`activeTabIndex` strip (0=pickup, 1=dropoff) carries no such meaning — its
tab `1` is drop-off, not map — so `revealMap()` and `onTabsValueChange()` are
both guarded by `!this.isDesktop` to keep the two meanings from crossing.

## Rule for future cards — do not undo this

⛔ **OBRS-1214** (raising "use my location" to the desktop pickup tab, per its
own card) must not cause Google Maps to load on a bare `/home` visit again.
"Use my location" is meaningful only once the map — and therefore
`route-map-panel`'s Geolocation/marker code — exists on screen; if that
control is promoted to a location where it can be reached before
`mapRevealed` is true, it must set `mapRevealed = true` itself before doing
anything else, the same way the three paths above do. It must NOT read
`navigator.geolocation` or touch the map panel while `mapRevealed` is still
false, and it must not reach for `[lazy]` or any other per-visit trigger that
fires on tab arrival rather than on the user's own action. Any change that
makes Maps JS request-count go from 0 to >0 on a fresh `/home` load with no
click undoes this card and must not ship.

That rule is no longer prose only. `e2e/tests/route-map.spec.ts` Criterion 6
now asserts `.route-map-placeholder` has count **0** before any click and only
then clicks `.map-placeholder-cta` — the panel, and with it the sole Maps JS
call site, must be absent on arrival. A card that mounts the panel on load
turns that count assertion red in the gate lane rather than shipping quietly.

## Consequences

- `/home`'s first paint no longer contacts `maps.googleapis.com` — reduces
  paid API calls for every visitor who never opens the map, and removes a
  render-blocking-adjacent third-party script from the common path.
- `RouteMapHomeComponent` gains one boolean field and two small methods
  (`revealMap()`, `onTabsValueChange()`); no new component, service, or NgRx
  slice.
- The mobile `<p-tabs>` binding changed from `[(value)]` two-way binding to
  `[value]` + `(valueChange)` — required so tab arrival can be observed and
  conditionally trigger a reveal; `activeTabIndex` itself is unchanged in
  shape or meaning.
- `route-map-panel.component.*` is untouched — the gate lives entirely in the
  parent that mounts it.
