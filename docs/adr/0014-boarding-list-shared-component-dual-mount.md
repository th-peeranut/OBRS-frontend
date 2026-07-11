# OBRS-130: `BoardingListComponent` as a self-sufficient, dual-mounted shared component

## Context

OBRS-96 built the manual boarding-scan box + manifest table as one page
component, `BoardingListPageComponent`, routed at `/staff/boarding/:scheduleId`
for a driver's own schedule. OBRS-130 needed the identical manifest — scan
box, table, boarded/status columns, and the new Board/Un-board actions — to
also appear **inside the Sell flow's Tab-3** (`walk-in-center-panel.component`,
scoped to whatever trip the salesperson currently has selected), without
duplicating the markup or the store/API wiring a second time.

## Decision 1: extract a shared, self-sufficient component — not a dumb
presentational one

`BoardingListComponent` (`shared/components/boarding-list/`) owns its own
`BoardingListStore` and calls `StaffApiService` directly, rather than
following the usual "dumb component, smart page" split (`CLAUDE.md` §3). Its
public contract is exactly one input: `[scheduleId]: number`. Both mounts —
the driver route wrapper and the Sell Tab-3 panel — only ever need to know
"which schedule," never how the manifest is fetched, cached, or mutated. A
presentational-only component would have pushed the store injection, the
scan/board/unboard handlers, and the optimistic-update logic into *both*
hosts, doubling the exact code this extraction was meant to remove.

## Decision 2: component-scoped store (`providers: [BoardingListStore]`), and
`BoardingListStore` is no longer `providedIn: 'root'`

Every other `AdminCollectionStore` subclass in this codebase is
`providedIn: 'root'` — a deliberate choice (see
`docs/adr/0013-dashboard-rebase-on-admin-collection-store.md`) so re-entering
an admin page replays a stale-while-revalidate cache instead of re-fetching.
`BoardingListStore` breaks that pattern on purpose: the driver route and the
Sell Tab-3 panel are **two independent scheduleIds** that can be live at
different times in the same session (a salesperson could, in principle, have
the driver route open in one tab and the Sell panel in another). A
root-scoped singleton would let one mount's cached manifest leak into the
other's `scheduleId`, or clobber it via `mutate()`/optimistic updates meant
for a different trip. Declaring
`providers: [BoardingListStore]` on `BoardingListComponent` (with the class
itself changed to bare `@Injectable()`, no `providedIn`) gives every mount —
and every re-mount, since Angular has no `RouteReuseStrategy` here — a fresh,
isolated store instance.

**Trade-off accepted**: this forfeits the cross-navigation SWR replay the
`root`-scoped stores get (leaving the driver route and coming back re-fetches
instead of showing a cached value instantly). This is the correct trade for
*live boarding data* — a manifest that's gone stale between visits (another
staff member boarded/un-boarded passengers in the meantime) is actively wrong
to show from cache, unlike an admin dashboard KPI that can tolerate a few
seconds of staleness.

## Decision 3: single-owner re-bind — only `ngOnChanges` calls
`store.setScheduleId()`

Both hosts pass `[scheduleId]` and nothing else; neither calls
`store.setScheduleId()` or `store.refresh()` itself. `BoardingListComponent`
implements `ngOnChanges` (not `ngOnInit`) to react to the input:

```ts
ngOnChanges(changes: SimpleChanges): void {
  if (changes['scheduleId']) {
    this.store.setScheduleId(this.scheduleId);
    void this.store.refresh();
  }
}
```

Angular guarantees `ngOnChanges` fires (including on the very first binding)
before `ngOnInit`, so a single `ngOnChanges` implementation covers both "just
mounted" and "the Sell panel's selected trip changed while this tab stayed
open" (the existing `store.setScheduleId()` clear-on-change guard already
handles the latter). If the host called `setScheduleId()` in *its own*
`ngOnInit` as well, the component would fetch twice on mount — this is why the
contract explicitly forbids it (see the class-level doc comment on both
`BoardingListPageComponent` and `BoardingListComponent`).

## Decision 4: the driver route keeps a thin wrapper, not a route-level
`resolve` or a direct component swap

`BoardingListPageComponent` still exists, still owns the route
(`/staff/boarding/:scheduleId`), and still reads `scheduleId` from
`route.snapshot.paramMap` — but it does nothing else. This keeps the routing
contract (path, guard, `data.titleKey`/`subtitleKey` for the shell topbar —
design-system §7) entirely on the page component, where the rest of the
staff module's routes already declare it, rather than teaching the shared
component about `ActivatedRoute` (which the Sell Tab-3 mount has no business
depending on).

## Decision 5: un-board is hidden, not disabled, for a driver

`canUnboard = authService.hasAnyRole(['salesperson'])` is computed once in
the constructor and gates the Un-board button's `*ngIf` (not `[disabled]`),
mirroring `ExportButtonComponent.canExport`. A driver physically cannot see
the control at all — matching the existing precedent that a role-gated
action is invisible to a role that can never use it, not present-but-greyed.
Admin satisfies this via the existing `ROLE_GRANTS` hierarchy expansion in
`AuthService.hasAnyRole()`, unchanged.

## Considered alternatives

- **Keep two copies of the scan box + table** (one per host) — rejected: this
  is the exact duplication OBRS-130 was asked to eliminate, and any future
  change (a new column, a new action) would need to land twice and drift.
- **A dumb/presentational `BoardingListComponent`** that receives `items`,
  `isLoading`, etc. as `@Input()`s and emits `(board)`/`(unboard)` — rejected:
  it would just move the store/API wiring duplication into both hosts instead
  of removing it, and the two hosts (a routed page vs. a tab inside a
  larger sell-desk component) have no natural shared parent to own that state.
- **Keep `BoardingListStore` `providedIn: 'root'`** — rejected per Decision 2:
  a shared singleton across two independently-scoped mounts risks one
  mount's optimistic mutation or stale cache bleeding into the other's
  schedule.
- **Have both hosts call `store.setScheduleId()`** (once in the host's
  `ngOnInit`, once implicitly via the shared component) — rejected per
  Decision 3: guaranteed double-fetch on every mount.

## Addendum (OBRS-256): the print-only trip header is promoted to an
on-screen strip, and drives a count-lock

The `tripHeader` self-fetch (`loadTripHeader()`, OBRS-100) was print-only
until now. OBRS-256 additionally renders it as an on-screen
`.boarding-trip-header` strip carrying a departed/arrived status pill and the
forward-only transition control (`PATCH /schedules/{id}/status`,
`scheduled→departed→arrived`, OBRS-200 backend). No new fetch was added —
`statusCode` is derived from the same response via the existing
`parseAdminStatus()` helper (shared with the admin schedules table).

Once a schedule reaches `arrived`, the manifest's boarding controls (scan
input/button, per-row Board/Un-board) freeze client-side via a single
`isScheduleArrived` getter (`tripHeader?.statusCode === 'arrived'`, strict
equality only) — both as `[disabled]` bindings and as an early-return guard
inside `board()`/`unboard()`/`validateScan()`, so a stale render can't fire a
request the backend would reject with `BOARDING_ROUND_ARRIVED` (409) anyway.
The whole header strip (and therefore the transition button) is gated on
`*ngIf="tripHeader"`, matching the existing print template's silent-degrade
contract — a failed self-fetch hides the strip rather than showing a
mis-tinted default status.
