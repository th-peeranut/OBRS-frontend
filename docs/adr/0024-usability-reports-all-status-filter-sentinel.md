# ADR 0024 — "All statuses" filter uses a real `'all'` option, not the retired empty-placeholder sentinel

**Date:** 2026-07-19
**Status:** Accepted
**Branch:** `ao/obrs-524-usability-status-filter`

## Context

OBRS-524 adds an "all statuses" view to the admin Usability Reports table
filter (`app-admin-dropdown` above the table). This is the **second** time
this exact filter has grown a "see everything" mode — the first time, an
earlier revision used an empty `[placeholder]` header on the dropdown: a
selectable row whose value was `''`, and `UsabilityReportsStore.setStatus('')`
sent no `?status=` to the server.

OBRS-378 deliberately **removed** that mode (see the removal comment
still present at `usability-reports-page.component.html:18-23`), because it
violated `docs/design-system.md` §3.1: a placeholder header renders a
selectable empty row, which is the exact anti-pattern §3.1 exists to forbid
(a control whose resting/reachable state shows no concrete value). The
dropdown was changed to always hold a concrete role-default status
(`selectedStatusFilter: UsabilityReportStatus`), with no `[placeholder]`
binding at all.

The system owner has now asked for the "see everything" capability back
(SIT feedback: clicking through 7 statuses one at a time to get a combined
view is unworkable). Re-adding it the same way OBRS-378 removed would
reintroduce the exact defect that removal fixed.

## Decision

"All statuses" is a **real, concrete option** — value `'all'` — sitting in
`STATUS_FILTER_VALUES` (`usability-reports-page.mappers.ts`) exactly like
`'new'`, `'accepted'`, `'duplicate'`, etc. It is never a placeholder:

- `selectedStatusFilter` is typed `StatusFilterValue = UsabilityReportStatus
  | 'all'` — `'all'` is a legitimate, always-present member of the type, not
  a fallback/empty case.
- The dropdown still has no `[placeholder]` binding. Its visible label always
  comes from whichever option is currently selected (the dropdown's own
  `selectedLabel`), including when that option is "All statuses"
  (`ADMIN.USABILITY_REPORTS.STATUS.all`).
- The default on page load is **unchanged** — still role-based (`admin` ->
  `'accepted'`, otherwise `'new'`, `ngOnInit`). `'all'` is an added *choice*
  the admin must actively pick, never a new default.

Only the **service/store layer** — `UsabilityReportsStore.fetch()` — knows
that `'all'` has no corresponding backend slug, and collapses it back to
"omit `?status=`" at the one point that talks to the wire:

```ts
const statusParam = this.status && this.status !== 'all' ? this.status : undefined;
```

This was verified against the live backend before shipping, not assumed:
`UsabilityReportService.listReports` (`OBRS-backend`) runs `findAll(pageable)`
with **no** predicate when `status` is null/blank — an ordinary, unfiltered
`SELECT`, so omitting the param really does return every status, including
`duplicate` and `dismissed` (neither of which is anywhere near "the
default"/most-visited tab, so there was a real risk the backend's omit-filter
behavior silently excluded them the way an ORM default-scope sometimes does).

## Why this is safe where the old shape wasn't

The old `''`-placeholder mode conflated two different things into one value:
"no selection has been made yet" (a placeholder's whole reason to exist) and
"the admin wants to see every status" (a deliberate, informed choice). Because
placeholders are inherently reachable by *not choosing anything*, that
conflation is exactly what let an unfiltered fetch happen by omission rather
than intent, and is what made the row itself a design-system violation.

`'all'` cannot be reached that way. It requires the same explicit click as
picking `'dismissed'` or `'resolved'` — there is no "nothing selected" state
for it to hide behind. The dropdown's design-system §3.1 property (visible
label always comes from a selected option, never a placeholder) is therefore
preserved, not re-violated; only the *set of things that can be selected*
grew by one.

## Consequences

- `usability-reports.store.ts` keeps a narrow, still-unused `''` internal
  sentinel (pre-`setStatus`-ever-called state) distinct from `'all'` — they
  happen to produce the same wire behavior today, but are kept as separate
  values so a future caller can tell "never asked" apart from "asked for
  everything" if that distinction ever matters.
- `applyRowStatus()`'s "did this status change move the row out of the active
  tab?" check (`leavesTab`) now also special-cases `'all'`: under `'all'`,
  every status is in view, so a status change can never move a row out of
  what's shown — it is always relabeled in place, never removed.
- `sortForStatus('all')` falls back to newest-first (the same default every
  other non-FIFO tab uses) — there is no single "actively worked" queue to
  order oldest-first when every status is mixed together.
- Precedent for the next admin list page that wants an "all" filter tab:
  give it a real, concrete `'all'` option in its value list, and let only the
  store/service layer translate it to "omit the filter param" — never reuse
  an empty string or a dropdown placeholder for the same purpose.
