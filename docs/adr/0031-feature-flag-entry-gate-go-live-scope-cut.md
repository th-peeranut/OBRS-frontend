# 0031 — Feature-flag entry gate for go-live scope cut (OBRS-622)

## Status
Accepted

## Context

OBRS-622 needed to pull two shipped, working features out of the go-live
surface without deleting or destabilizing them:

1. **Online consigned parcel booking** (customer-facing) — `/parcel-booking`
   and `/my-parcels`.
2. **GPS fleet live map** (staff) — the `fleet-map` staff route and its nav
   link.

Both must come back after go-live with **no commit revert** — a single value
flip per feature — because the code, tests, and backend endpoints all stay
correct and maintained; only the go-live *scope* excludes them. `/track-parcel`
(public tracking) and the staff walk-in parcel intake under `/staff/parcels/*`
(schedule → receive → waybill → verify → deliveries) must keep working exactly
as before — they are not in scope for this cut.

## Decision

Add one `features` block to `environment.base.ts`'s `environmentBase`:

```ts
features: {
  onlineParcelBooking: false, // gates /parcel-booking + /my-parcels routes + navbar My Parcels link
  fleetMap: false,            // gates the staff fleet-map route + its nav link
},
```

Every `environment.*.ts` (`environment.ts`, `.sit.ts`, `.prod.ts`, `.e2e.ts`,
the gitignored `.local`/`.prod.local` templates) spreads `...environmentBase`
and does not declare its own `features` shape, so this one block is the
**single point of truth** for every build config. Re-enabling a feature after
go-live is one line changed in `environment.base.ts` — no code path is
removed or restored, so there is nothing to "un-revert" and no risk of the
revert missing a hunk.

A functional route guard, `featureEnabledGuard(feature)` in
`src/app/shared/guards/feature-flag.guard.ts`, reads the flag at
`canActivate` time and either allows the route or redirects to home (`'/'`,
via `router.parseUrl('/')` — Home lives at the root route, not `/404`, so a
flagged-off route reads as "not here" rather than "broken"). It is applied
**after** `AuthGuard` in each route's `canActivate` array, so authentication
and role checks still run first; the feature gate is the last check, not a
replacement for any of them.

Nav visibility is gated separately, at render time, from the same flag:
- `NavbarComponent.isOnlineParcelBookingEnabled` (read once from
  `environment.features.onlineParcelBooking`) hides both My Parcels links
  (desktop profile dropdown, mobile menu) via `*ngIf`.
- `StaffLayoutComponent.buildNavItems()` only pushes the `fleet-map` nav item
  when `environment.features.fleetMap` is true.

Hiding the nav link and gating the route are deliberately two separate checks
on the same flag, not one mechanism doing both — the guard is the actual
security/reachability boundary (a typed-in URL still redirects), the nav
`*ngIf` is a UX nicety on top of it (no point advertising a link that would
immediately bounce).

## Why compile-time env flag, not a runtime toggle

- **Reversibility only needs to be a deploy-time decision.** Nothing about
  this scope cut requires flipping the feature live in production without a
  redeploy (e.g. an incident kill-switch, an A/B test) — that would justify a
  DB-backed or remote-config toggle instead. Go-live scope is decided once,
  ahead of a release, and every environment already gets its own build
  (`sit`, `prod`, `ci-smoke`), so a compile-time flag costs nothing extra to
  wire per environment.
- **A compile-time flag also strips the code from the reachable path for
  free in a way a runtime flag cannot** — `false` is `false` for every user,
  every request, with no network round-trip, no cache, no "toggle service
  down" failure mode to design around. For a scope cut (not a kill-switch)
  that is a strictly simpler and more reliable primitive.
- **Matches the existing shape of `mapsApiKey`/`maptilerKey`** — this repo
  already treats "does the environment have what this feature needs"
  entirely as `environment.*.ts` plumbing (see `docs/design-system.md` §12,
  the Leaflet+MapTiler entry). `features.*` is the same idiom applied to a
  deliberate on/off decision instead of a missing credential.

## Why a separate guard from the area-based access model

`featureEnabledGuard` is intentionally **not** folded into `AuthGuard` or
`AuthService` (`ROLE_GRANTS`, `PORTAL_ONLY_ROLES`, `canAccessCustomerArea`,
`getHomeRoute`). Those answer "who is this user and which portal/area may
they be in" — a identity/authorization question. This flag answers "is this
feature live at all right now" — an orthogonal, deployment-scoped question
that applies identically regardless of who the user is. Keeping them separate
means:

- The access-model ADR/CI gate (which locks `auth.service.ts`/`auth.guard.ts`
  behavior) is untouched by this change and cannot false-fire on it.
  `featureEnabledGuard` lives in `src/app/shared/guards/`, imports nothing
  from `auth.service.ts`, and is appended to `canActivate` arrays — it never
  edits an existing guard's logic.
- A future feature flag never has to reason about roles, and a future
  role/access change never has to reason about feature flags. Composing two
  single-purpose guards in an array (`[AuthGuard, featureEnabledGuard(...)]`)
  keeps both concerns testable and revertible independently.

## Consequences

- Re-enabling either feature post-go-live is a one-line change in
  `environment.base.ts` (or a per-environment override, if a future need
  ever requires divergence — none exists today).
- `nav-reachability.spec.ts`'s orphan sweep needed one documented exemption:
  while `environment.features.fleetMap` is `false`, the `fleet-map` route is
  *intentionally* unreachable from the nav (that's the gate working), so it's
  excluded from the "every routed page must be reachable" assertion only for
  that state — the exemption clears itself the moment the flag flips back on.
- No i18n keys were added: both gates are silent (a redirect, an absent nav
  link) rather than user-facing copy.
- `/track-parcel` and the staff walk-in parcel intake routes
  (`/staff/parcels/*`) are untouched — no guard added, no behavior changed.

## Cross-reference
OBRS-622.
