# ADR 0023 — "My Reports" customer page: new page family, cross-shell badge reuse, and incremental load-more

**Date:** 2026-07-17
**Status:** Accepted
**Branch:** `ao/obrs-433-my-reports`

## Context

OBRS-433 gives a logged-in reporter a `/my-reports` page: a list of their own
usability reports, a detail view (including the admin's triage note), an edit
form (category/description/images) while `status === 'new'`, and a follow-up
composer usable in any status. The admin's existing inline detail modal
(`usability-reports-page.component.html`) also gains a read-only follow-up
timeline fed by the same backend field.

Three things about this feature don't fit an existing pattern outright and
needed an explicit decision (design-system §12):

1. **A brand-new customer-shell page family** (`modules/my-reports/`) — the
   nearest precedents are `my-bookings` (NgRx-backed) and `account` (plain
   component, no store). Neither is a drop-in fit: the data is a paginated,
   cacheable collection (closer to an admin list) but the shell/chrome is
   customer-facing (closer to `account`/`my-bookings`).
2. **Reusing `.admin-status.is-*` chips on a customer-shell page with no
   `.admin-shell` ancestor** — the `--admin-*-bg`/`-text` custom properties
   those classes read only exist inside `.admin-shell`.
3. **Pagination shape** — every existing paginated list in this codebase
   (all 8 admin pages) uses `app-admin-paginator`, a page-number control.
   That's an admin-density pattern; a reporter's own report list is low-volume
   and casual, not a back-office table.

## Decisions

### 1. `AdminCollectionStore` reused as the store base, `providedIn: 'root'`, module-local mappers

`MyReportsStore` extends `AdminCollectionStore<MyUsabilityReportPage>`
**in place** — imported directly from `modules/admin/shared/admin-collection-store`,
exactly as `shared/components/boarding-list/boarding-list.store.ts` (a
customer/staff-shared component) already does. The base class is generic
stale-while-revalidate caching with no admin-specific behavior baked in, so
reusing it here is the same "don't fork a shared abstraction for a new
consumer" call as `boarding-list.store.ts` made first. It is **not**
relocated or renamed — `modules/admin/shared/` stays its home; a second
subclass living in a different module is exactly what the class was
generalized for.

The list/detail/follow-up shapes get a **fresh** `my-reports.mappers.ts`
rather than importing `usability-reports-page.mappers.ts`. That file is
module-local inside the lazy `AdminModule` and its `UsabilityReportSummary.id`
is `string` — the OBRS-376-documented latent bug (a `BIGSERIAL` id that
actually serializes as a JSON number). `MyUsabilityReportSummary`/
`MyUsabilityReportDetail`/`UsabilityReportFollowUp` type `id: number`
correctly from the start (see DEV-GOTCHAS: "An FE field typed wrong survives
until the first type-specific method call") since this is new code with no
existing call site depending on the wrong type.

### 2. Cross-shell status chips: re-declare the token VALUES at the page's `:host`

Same idiom as `ParcelTrackingPageComponent` (OBRS-305, design-system §12):
`MyReportsComponent`'s own `:host` / `:host-context(body.is-dark)` re-declares
the 7 `--admin-*-bg`/`-text` custom-property values already bound to those
roles in `admin-theme.scss` (design-system §2.4) — no new hex. Because CSS
custom properties inherit down the real DOM tree regardless of Angular's
emulated view encapsulation, `MyReportDetailModalComponent` (a DOM descendant
of `MyReportsComponent`'s template) needs **no copy of its own** — it just
reads the inherited custom properties when it renders `.admin-status.is-*`
markup. Only the *page* component declares the values; every descendant that
renders a status chip is free.

### 3. Pagination: incremental "Load more", not `app-admin-paginator`

The reporter's own list is low-volume (a handful to a few dozen reports per
person) and the interaction is "keep scanning down", not "jump to page 7" —
a page-number control adds chrome (footer, range text, page-jump) this screen
doesn't need. `MyReportsStore.loadMore()` fetches the next server page and
**appends** it to the cached content (never replaces) via `AdminCollectionStore.mutate()`
— a small subclass-only addition, not a base-class change (the base's
`refresh()`/`fetch()` cycle still always *replaces*, which is what a fresh
page mount wants: `refresh()` on `ngOnInit()` intentionally collapses back to
the newest 20 rows on every re-entry, matching the stale-while-revalidate
one-page-at-a-time semantics every other `AdminCollectionStore` subclass
already has).

This is the first "Load more" button in the codebase — no prior card/list
screen needed it. It's the `.btn-secondary` recipe already established by
`my-bookings`/`account` (`$brand-customer-strong`, outlined), not a new
button role, so no new design-system row was needed beyond noting the
pattern here for the next incremental-list screen to reuse.

**Consequence this locks in:** a component must never call
`MyReportsStore.refresh()` to "reconcile" after a mutation (e.g. after a
successful edit save) — doing so would silently discard every row loaded via
`loadMore()` in the current session. `MyReportsComponent.onReportUpdated()`
instead patches the single affected row via `store.mutate()`, matching the
locked UX spec's "emits reportUpdated so the card updates without full
reload."

## Consequences

- The next customer-shell page needing a paginated, cacheable list (not a
  back-office table) can reuse `AdminCollectionStore` + the "Load more"
  `.btn-secondary` recipe instead of reaching for `app-admin-paginator` or
  reinventing a NgRx slice.
- The next customer-shell surface needing an admin/staff status chip look
  reuses the `:host`-re-declaration idiom (and, per this ADR, only needs to
  declare it once at the page root — descendants inherit for free).
- `UsabilityReportImagePickerComponent` and `UsabilityReportFollowUpTimelineComponent`
  (new `shared/components/`) are reused byte-identical by both the customer
  detail modal and the admin inline detail modal — see their own doc comments
  for the extend-not-fork rationale (design-system §10).
