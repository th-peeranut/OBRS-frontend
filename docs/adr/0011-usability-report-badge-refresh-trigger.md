# ADR 0011 — Usability report badge refresh trigger

**Date:** 2026-07-09
**Status:** Accepted
**Branch:** `ao/usability-triage-ux`

## Context

OBRS-174 adds a silent auto-promote (`new` → `in_review`) when an admin opens a
usability report, and makes a successful decision save close the detail modal.
Both events change a report's status and should be reflected in the admin
sidebar's "new" count badge (`AdminLayoutComponent.newReportCount`,
`admin-layout.component.ts`) without waiting for the existing 60s poll or the
next `NavigationEnd` (opening/saving a report detail is an in-page action, not
a navigation).

`AdminLayoutComponent.watchNewReportCount()` already merges a 60s `timer` with
router `NavigationEnd` events into one `switchMap` that re-fetches the count.
`UsabilityReportsPageComponent` and `AdminLayoutComponent` are siblings with no
existing communication channel — the page has no reference to the layout, and
the layout has no reference to the page.

## Decision

Add a minimal `UsabilityReportBadgeRefreshService`
(`src/app/shared/services/usability-report-badge-refresh.service.ts`,
`providedIn: 'root'`): a single `Subject<void>` exposed as `refreshRequested$`
plus a `trigger()` method. `UsabilityReportsPageComponent` calls `trigger()`
after a successful auto-promote and after a successful decision save.
`AdminLayoutComponent.watchNewReportCount()` adds `refreshRequested$` as a
third source into its existing `merge(...)`, so a trigger re-runs the same
`switchMap`/`getNewUsabilityReportCount()` fetch the poll and navigation
sources already use — no new fetch path, no duplicated error handling.

This is intentionally **not** a general notification/event bus. A central
notification-domain refactor (customer in-app/push notifications, a shared
event store) was scoped and explicitly **deferred** for cost — see the
agent-office memory `notification-domain-deferred.md`. Introducing a general
bus here would be solving a bigger, deferred problem to fix one badge. The
service is scoped to exactly this one cross-component signal; if a second,
unrelated badge/counter later needs the same same-page-refresh shape, that is
the trigger to generalize (rename/broaden this service, or revisit the
deferred notification domain), not before.

## Consequences

- `AdminLayoutComponent` and `UsabilityReportsPageComponent` gain one
  constructor dependency each on `UsabilityReportBadgeRefreshService`. Both are
  `providedIn: 'root'` singletons, so no module wiring changes.
- No behavior change to the poll/navigation refresh paths — the service only
  adds a third way to trigger the same existing fetch.
- If another admin screen later needs an immediate same-page badge refresh, it
  can call `.trigger()` on the same shared service rather than growing a new
  ad-hoc channel.
