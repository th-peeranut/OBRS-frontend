# ADR 0006 — Home page direction selector

**Date:** 2026-06-30
**Status:** Accepted
**Branch:** `ao/home-direction-selector`

## Context

The `/home` page previously hard-wired to a single route (`chonburi_bangkok` from
`environment.homeRouteSlug`). Adding a second active route (`bangkok_chonburi`)
required a UI control so travellers can switch directions without leaving the page.

## Decision

Use PrimeNG `p-selectButton` (single-select) for the two-direction control,
placed inside `RouteMapHomeComponent` above the route panels/map.

Key design choices:

1. **Component-local state only** — no NgRx slice. The direction selection is
   ephemeral UI state with no cross-page sharing requirement.

2. **`[allowEmpty]="false"`** — prevents deselection to `null` when the active
   button is clicked again, which would trigger a spurious blank refetch.

3. **`getActiveRoutes()` on `RouteMapService`** — a new method that returns
   `Observable<RouteListItem[]>` with only active routes. `getFirstActiveRouteSlug()`
   is refactored to delegate to it, eliminating the duplicated HTTP + active-filter
   logic.

4. **Two distinct retry targets** — `loadDirections()` handles the routes-list
   fetch; `loadPickupDropoff(slug)` handles the per-route stop data. A private
   `errorRetryTarget` field tracks which flow errored so `onRetry()` in the
   template calls the correct method.

5. **Default anchored to `environment.homeRouteSlug`** — `setDefaultRoute()` checks
   that the env slug is present in the fetched active list before using it; falls
   back to `routes[0]` otherwise. This prevents backend list-ordering from silently
   changing the default.

6. **Live re-localization** — the component subscribes to
   `translateService.onLangChange` (with `takeUntil(destroy$)`) and rebuilds
   `directionOptions` labels on each language switch. Labels are derived from
   `route.translations[currentLang]?.label ?? route.translations['en']?.label ?? route.slug`,
   which handles the absent `zh` translation gracefully.

7. **All four selection fields reset on switch** — `selectedPickupSlug`,
   `selectedDropoffSlug`, `selectedPickupStop`, `selectedDropoffStop` all become
   `null` so that stale selections from the previous direction are cleared before
   the new pickup/dropoff fetch resolves.

## Consequences

- `RouteListItem` interface in `route-map.interface.ts` now explicitly declares
  `id`, `translations` (typed as
  `Partial<Record<'en'|'th'|'zh', { label: string; description?: string|null }>>`),
  `createdAt?`, `updatedAt?`, and no longer carries a catch-all index signature.
  Any call-site that relied on the index signature must be updated.

- `HomeModule` imports `SelectButtonModule` (PrimeNG). `FormsModule` is already
  re-exported by `SharedModule` — no duplicate import needed.

- The `i18n` key `HOME.ROUTE_MAP.DIRECTION_GROUP_LABEL` is required in all three
  locale files (`en.json`, `th.json`, `zh.json`).
