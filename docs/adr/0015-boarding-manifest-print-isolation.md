# ADR 0015 — Boarding manifest print isolation (CDK Portal teleport-to-body)

**Date:** 2026-07-11
**Status:** Accepted
**Branch:** `ao/obrs-100-manifest-export`

## Context

OBRS-100 adds a Print action to the shared `BoardingListComponent`
(`shared/components/boarding-list/`, dual-mounted per ADR 0014 — driver route
`/staff/boarding/:scheduleId` and the Sell flow's Tab-3 walk-in panel). Both
mounts sit inside `.admin-shell.theme-staff` (`staff-layout.component.html`:
sidebar + topbar), and the Sell-tab mount additionally has a trip-browser
sidebar + checkout column as siblings. Calling `window.print()` naively would
print the entire shell, not just the manifest.

## Decision 1: CDK Portal teleport-to-body, not a shell-scoped
`visibility:hidden` + reveal-one-marker rule

The classic print-isolation trick —

```scss
@media print {
  .admin-shell.theme-staff * { visibility: hidden; }
  .admin-shell.theme-staff .print-area,
  .admin-shell.theme-staff .print-area * { visibility: visible; }
  .admin-shell.theme-staff .print-area { position: absolute; inset: 0; }
}
```

— was the first-pass design and was rejected on review (Scrutinize) for two
concrete reasons:

1. **The reveal selector can't reach every relevant node.** Any `position`,
   `overflow`, or `transform` on an ancestor (the Sell mount's `p-tabView`/grid
   layout) clips or offsets an absolutely-positioned reveal — the print area
   would render, but potentially cropped or mispositioned, depending on which
   host mounted it.
2. **Body-appended overlays aren't inside `.admin-shell` at all.**
   `p-menu[appendTo="body"]` (used by `app-export-button` itself, among
   others) and SweetAlert2's `.swal2-container` render as direct children of
   `document.body`, outside `.admin-shell` — a `.admin-shell.theme-staff * {
   visibility: hidden }` rule never touches them, so a stray open menu/alert
   would print unhidden over or alongside the manifest.

**The fix:** a CDK `DomPortalOutlet` + `TemplatePortal` (`@angular/cdk`
~18.2.14 is already a dependency; grep confirmed **zero** existing Portal
usage anywhere in `src/` before this card — this is the first) teleports a
dedicated `<ng-template #printTemplate>` to a `<div
class="boarding-manifest-print-portal">` appended directly to
`document.body`. The print DOM's only ancestor is now `<body>`, regardless of
which host (driver page or Sell Tab-3) triggered it — no shell chrome,
`p-tabView`, or grid ancestor is in the way.

```scss
.boarding-manifest-print-portal { display: none; }
@media print {
  body > *:not(.boarding-manifest-print-portal) { display: none !important; }
  .boarding-manifest-print-portal { display: block !important; }
}
```

This hides **every other** direct child of `body` when printing — including
any stray `p-menu`/SweetAlert2 overlay — and reveals only the portal. It lives
in `admin-theme.scss` (global), not a component style, because it governs
`document.body`'s direct children, which sit outside any component's view.

### Why the portal content still picks up the component's SCSS

`TemplatePortal(this.printTemplate, this.viewContainerRef)` stamps the
embedded view using `BoardingListComponent`'s own `ViewContainerRef`. Angular
applies its emulated-encapsulation attribute (`_ngcontent-xxx`) to the
resulting DOM nodes at creation time — that attribute travels with the node
when `DomPortalOutlet` later moves it into a `document.body` child; it does
not depend on the node's position in the tree. `boarding-list.component.scss`
rules (`.boarding-manifest-print`, `.boarding-manifest-print-meta`,
`.boarding-manifest-print-table`) keep applying after the teleport.

## Decision 2: teardown is idempotent and `ngOnDestroy`-bound, not
`afterprint`-only

`printManifest()` registers a `window.addEventListener('afterprint', ...)` to
tear the portal down once the browser's print dialog/preview closes. Relying
on `afterprint` alone was flagged on review: if the operator navigates away
(or the component is otherwise destroyed) while the print dialog/preview is
still open, `afterprint` never fires and the portal host leaks as an orphaned
`document.body` node.

`disposePrintPortal()` is therefore:

- **Idempotent** — guarded by `if (!this.printPortalHost) return;`, so it's
  safe to call multiple times (from `afterprint`, from the top of a
  subsequent `printManifest()` call, and from `ngOnDestroy`).
- **Called from `ngOnDestroy`** in addition to the `afterprint` listener —
  whichever fires first wins; the other becomes a no-op.

## Decision 3: the trip header is self-fetched by `BoardingListComponent`,
not threaded through the hosts

The print manifest's header (Route / Departure / Vehicle / Driver / Seats
sold / Boarded) needs data neither host fully has today in a shape the shared
component could just receive: `WalkInTripDto` (Sell Tab-3) has
`driverName`/`licensePlate`/`departureDateTime` but not the route name (that
lives two hops up, on `SellPageComponent.routeGroups`/`selectedRouteSlug`),
and the driver route wrapper (`BoardingListPageComponent`) holds none of it.
Threading a `tripHeader` `@Input()` through both hosts would (a) break ADR
0014's `[scheduleId]`-only contract and (b) produce two different
completeness levels for the same shared component's header depending on
which host populated it.

Instead, `BoardingListComponent.ngOnChanges` calls a new private
`loadTripHeader(scheduleId)`, which calls a new
**`StaffApiService.getScheduleById(id)`** — deliberately **not**
`AdminApiService.getScheduleById()` (which `walk-in-center-panel.component.ts`
already calls for its edit-mode fetch, so the endpoint/precedent exists), to
avoid a `shared/` component taking a runtime dependency on an
admin-domain-named service. `AdminScheduleDto` is imported into
`staff-api.service.ts` as `import type` only — same precedent as the existing
`DriverDto` type-only import from `admin-api.service.ts`. Both hosts keep
**exactly today's contract**, `[scheduleId]` only.

The fetch is stale-guarded (`headerRequestScheduleId`) so a fast re-bind (the
Sell Tab-3 host changes `[scheduleId]` when the salesperson picks a different
trip) can't let a slower, earlier response clobber the header for the
schedule now showing. On any failure — most notably a driver 403'd off a
schedule they don't own — `tripHeader` is set to `null` and the template
falls back to `'-'` per field; Seats-sold/Boarded (derived from `items`,
already held) render regardless, and export is unaffected (separate
endpoint). The header is supplementary; nothing about print or export is
gated on it succeeding.

## Considered alternatives

- **Keep the `visibility:hidden` + reveal-marker approach, but also hide
  body-appended overlays by class** — rejected: still fragile under
  ancestor `position`/`overflow`/`transform`, and would need to enumerate
  every current and future body-appended overlay by name. The portal
  approach hides "everything that isn't the portal," which is correct by
  construction and needs no such list.
- **Thread `tripHeader` through both hosts as an `@Input()`** — rejected per
  Decision 3: breaks ADR 0014, and the Sell-tab host can't build a complete
  header without a second cross-component fetch of its own.
- **Reuse `AdminApiService.getScheduleById()` directly from
  `BoardingListComponent`** — rejected: would give a `shared/` component a
  runtime dependency on an admin-domain-named service; `getScheduleById` was
  instead added to `StaffApiService`, which `BoardingListComponent` already
  depends on.

## Consequences

- This is the app's first CDK Portal usage. Any future "print only this one
  element of a chromed page" feature should reuse this same
  `DomPortalOutlet` + `TemplatePortal` + `.boarding-manifest-print-portal`-
  style marker-class idiom rather than reinventing a `visibility:hidden`
  reveal rule.
- `StaffApiService.getScheduleById()` is now a second call site for
  `GET /api/private/schedules/{id}`, alongside
  `AdminApiService.getScheduleById()`. Both hit the same backend endpoint;
  this is an intentional, documented duplication to preserve the
  `shared/` → admin-domain-service decoupling, not an oversight.
