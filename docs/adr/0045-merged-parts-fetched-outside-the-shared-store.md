# Merged-away parts/labour rows are fetched OUTSIDE `MaintenancePartsStore`, never through it (OBRS-1634)

## Context

`MaintenancePartsStore` (OBRS-1613) caches one superset of the parts/labour registry —
`getMaintenanceParts(null, includeInactive: true)` — and is `providedIn: 'root'`, so it is
shared, unmodified, by **5** call sites:

| call site | what it does with `data$` |
| --- | --- |
| `MaintenancePartsPageComponent` (`/admin/maintenance-parts`) | the registry screen itself — shows both active and retired rows |
| `ExpensePartPickerComponent` / `ExpensesPageComponent` | a bill-line part/labour picker, filtered to `part.active` |
| `ExpenseBatchPageComponent` | the batch-expense part/labour picker, filtered to `part.active` |
| `DriverCashRepairForm` | the driver-cash repair-form picker, filtered to `part.active` |
| `DriverSettlementPageComponent` | the driver-settlement repair line picker, filtered to `part.active` |

The store's own javadoc already states the pattern this ADR extends: "one fetch of the superset,
filtered per consumer" — retired rows are always in the cache, and each picker's own `.active`
filter is what keeps a retired entry out of a bill line.

OBRS-1634 (AC8) needs the registry screen to also show merged-away rows (`mergedIntoId !== null`)
so the owner can see what has been folded away and reopen it. The backend's `includeMerged=true`
query param is exactly the same shape as `includeInactive` — it stops the default
`merged_into_id IS NULL` filter, returning the superset instead of the subset.

## Decision

**Do not add `includeMerged` to `MaintenancePartsStore.fetch()`.** The registry page fetches the
merged-away rows through a second, direct `AdminApiService.getMaintenanceParts(null, true, true)`
call it owns itself (`refreshMergedParts()` in `MaintenancePartsPageComponent`), keeps them in a
private `mergedParts` field never exposed to the store, and folds them into the on-screen list
only when the owner turns on "Show merged-away entries" (`showMerged`).

`MaintenancePartsStore` itself is untouched: every existing consumer keeps seeing exactly the same
superset it always has, filtered to `.active` the same way it always has.

## Why not extend the shared store

The 4 picker call sites above filter **only** on `part.active` — none of them know the
`mergedIntoId` field exists, because until this card no row ever carried a non-null one. If
`MaintenancePartsStore.fetch()` started asking for `includeMerged=true`, every one of those
pickers would start offering a merged-away row as a normal, selectable entry the moment the owner
performed their first merge — the exact defect merging exists to prevent (a bill keyed against a
name that the owner has already said is a duplicate of another one).

Fixing that by adding `!part.mergedIntoId` to all 4 filters was considered and rejected:

- It is the piecemeal-guard shape DEV-GOTCHAS.md warns about — four independent call sites each
  growing their own extra clause is four places a fifth future picker can forget to copy.
- It buys nothing: none of those 4 screens has any use for a merged-away row. The store fetching
  data none of its majority consumers want, so that ONE consumer can filter it back out, is
  strictly worse than the one consumer that wants it fetching it itself.

## Consequences

- **One extra network call**, made only by the registry screen, only on that screen's own
  `ngOnInit` and after a merge/unmerge succeeds. The dataset is small (tens of rows, per the
  card's own sizing note on `MaintenancePartsStore`), so this is not a caching concern the way the
  main registry fetch is.
- **`mergedParts` is not stale-while-revalidate cached** the way the store's data is — re-entering
  the page re-fetches it. Accepted: this is a supplementary, occasional-use view (seeing what has
  been merged away), not the primary list the store exists to make instant on repeat visits.
- **The winner's display name for a merged-away row is resolved from `allParts`** (the store's own
  plain superset), never from the merged fetch — a merge target can never itself be merged (no
  chains), so it is always present there.
- If a 6th consumer of `MaintenancePartsStore` is ever added, it inherits the same "never sees a
  merged row" guarantee for free, with nothing to remember to copy.

## Considered alternatives

- **Add `includeMerged` to `MaintenancePartsStore.fetch()` and filter it out in the 4 pickers** —
  rejected above (piecemeal, and the majority consumer pays for data it never wants).
- **A second root-scoped store (`MergedMaintenancePartsStore`)** — rejected as over-engineering for
  one consumer: `AdminCollectionStore`'s value is amortizing a fetch across screens that
  independently navigate to and from a page; nothing else in the app needs this list, so a second
  cache class buys nothing a private field on the one page that needs it does not already have.
