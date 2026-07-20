# ADR 0027 — Searchable station dropdown extends the bespoke `app-dropdown-group-obrs` CVA (not a `p-dropdown [filter]` migration)

**Date:** 2026-07-20
**Status:** Accepted
**Branch:** `ao/obrs-562-searchable-station-dropdown`

## Context

OBRS-562 adds a search/filter row to `DropdownGroupObrsComponent`
(`src/app/shared/components/dropdown-group-obrs/`, selector
`app-dropdown-group-obrs`) so the origin/destination station pickers on the 3
booking pages (`home-booking`, `schedule-booking-filter`, `parcel-trip-form`)
become searchable instead of scroll-only. This is the repo's **first**
customer-side filterable dropdown.

A searchable stop picker already exists in this codebase, for staff:
`.claude/agent-office/memory/archive/2026-06-24-sit-staff-searchable-stop-dropdowns.md`
built `/staff/sell`'s stop picker on PrimeNG `p-dropdown [filter]="true"
filterBy="label"`, bound via reactive-form `formControlName` + `optionValue`
on the station's `slug`, and explicitly deferred "unifying stop pickers" to a
future card — this one.

## Decision: extend `DropdownGroupObrsComponent` with an opt-in `@Input() searchable`, not migrate to `p-dropdown [filter]`

`p-dropdown [filter]` was **not** reused here because the contract is
materially different, for the same reasons the staff-sell card's own writeup
already gives (still true, re-verified against current source in this pass):

1. **Different binding contract.** `app-dropdown-group-obrs` is a
   `ControlValueAccessor` wired via `[value]` / `(currentValue)` at all 6
   station-picker call sites — not a reactive-form `formControlName` +
   `optionValue` slug binding the way `/staff/sell`'s picker is wired.
   Porting 6 instances across 3 modules to `p-dropdown` would mean rewriting
   every call site's binding shape, not just adding a filter.
2. **Its own multi-shape localization fallback chain.** `getValue()`
   (`.component.ts`) already resolves a station's display label through up to
   four fallbacks (`display` translations → `translations` → `label`/`name`/
   `slug`/`code`) — this logic has no PrimeNG equivalent and would need to be
   re-derived as a custom `itemTemplate` inside `p-dropdown` regardless of
   which control renders the list.
3. **Its own bespoke pill/border visual**, already matched to the 3 booking
   pages' visual design (`isBorder`, `dropdown-toggle-border`, etc.) —
   swapping to PrimeNG's own dropdown chrome would be a visual regression to
   fix on 6 instances, not a behavior change.
4. **Grouped-options branch is dead code today** (see below) — a rewrite onto
   `p-dropdown` would need to either drop or reimplement that branch for no
   functional gain, since it never renders with the real `GET /api/stops`
   response shape.

Porting 6 station-picker instances to `p-dropdown` is a strictly **larger,
riskier** change than adding one opt-in `@Input()` to the existing component.
The `/staff/sell` card made the same call in the opposite direction — reaching
for `p-dropdown` there rather than adapting this component — for the same
underlying reason: **the value contract didn't match**, not that `p-dropdown
[filter]` is somehow unavailable or inferior in general.

This follows `docs/design-system.md` §10's standing rule: extend a shared
component with an optional, false-default `@Input()` so every existing call
site stays byte-identical, rather than forking a second component or
mutating the shared contract (the seat-component multi-select `@Input()` is
the canonical precedent cited there).

## Consequences

- **`@Input() searchable: boolean = false`** — opt-in, not always-on. 6 of the
  7 real `app-dropdown-group-obrs` instances (every station picker; not
  `parcel-trip-form`'s `scheduleId` picker) set `[searchable]="true"`; every
  other consumer, and this one instance, render byte-identical to before this
  card.
- **The filter predicate applies to the flat option branch only.**
  `GET /api/stops` → `StationApi[]` (`shared/interfaces/station.interface.ts`)
  has no `stations` field, so `isGroupedOptions()` is always `false` at
  runtime — the grouped `ProvinceStation`-shaped branch is dead code with
  today's data. It is left untouched, unfiltered, and untested; a future card
  that ever feeds this component from the province-grouped endpoint would
  need to revisit the filter predicate for that branch then, not now.
- **Search keys are precomputed, not derived in a template getter.** The
  component runs default (not `OnPush`) change detection, and `getValue()`'s
  fallback chain is expensive enough that re-running it as a template getter
  per option per CD tick (plus allocating a fresh array every tick, breaking
  `*ngFor` identity) was rejected. A `Map<option, searchKey>` is rebuilt once
  in `ngOnChanges` (when `options` changes) and once more on
  `translate.onLangChange` — the active language can change while a station
  list is already cached, and a stale precomputed key would otherwise search
  against the wrong language's text silently.
- **Bootstrap's own `shown.bs.dropdown` / `hidden.bs.dropdown` events, fired
  on the toggle button, now drive `isDropdownOpen` exclusively.** The
  component's previous custom outside-click listener (`Renderer2.listen`
  wired inside `toggleDropdown()`) is deleted — it was a second, competing
  source of truth that could desync from the real Bootstrap panel state (an
  Escape-close left `isDropdownOpen` stuck `true`, and its own document
  listener leaked on that path). Net line reduction, not just an addition.
- **No `p-dropdown`/PrimeNG dependency added to this component.** Bundle cost
  stays at zero marginal PrimeNG for this feature.

## Alternatives considered

- **Migrate all 6 station-picker instances to PrimeNG `p-dropdown [filter]`.**
  Rejected — see Decision above; the binding-contract rewrite alone touches 3
  feature modules for a change whose actual requirement is "add a search box
  to an existing list."
- **Fork a second component (`app-dropdown-group-obrs-searchable`).**
  Rejected per `docs/design-system.md` §10 — an opt-in `@Input()` keeps one
  component, one bug-fix surface, and every non-station call site untouched.
- **Always render the search row (no `searchable` flag).** Rejected — the PO
  ruling (`UX-OBRS-562-searchable-station-dropdown.md` §1) requires the
  `parcel-trip-form` schedule picker to stay exactly as it is today; an
  always-on row would change that instance's behavior with no product
  justification.
