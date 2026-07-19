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

## Addendum (OBRS-370, 2026-07-15) — owner is a SCREEN-ONLY tier

`UsabilityReportsPageComponent` now also role-gates its triage controls: role
OWNER can view the list/detail and move a report forward through the
non-terminal statuses (`in_review`, `accepted`), but the backend 403s a
non-admin on the terminal decisions (`resolved`/`rejected` — terminal, email
the reporter) and on the Jira key. The FE mirrors that so owner never sees a
control that would 403:

- `isAdmin` is sourced from `authService.getRoles().includes('admin')` — the
  **raw** held role, not `hasAnyRole(['admin'])`. Under this FE's area-based
  access model (`AuthService.ROLE_GRANTS`), owner is an all-access superset
  that satisfies `hasAnyRole(['admin'])` too, so that check cannot distinguish
  a real admin from an owner here. This mirrors the same raw-role precedent in
  `boarding-entry-page.component.ts` / `parcel-delivery-schedule-page.component.ts`.
- The decision-only dropdown (`detailStatusOptions`) builds from
  `DETAIL_STATUS_VALUES` (`accepted`/`resolved`/`rejected`) for admin, or the
  new `OWNER_DETAIL_STATUS_VALUES` (`in_review`/`accepted`) for a non-admin.
- The Jira key display row is now additionally gated on `isAdmin`.
- `seedStatus()` no longer pre-seeds a value that isn't in the current
  role's `detailStatusOptions` — an owner opening a report an admin already
  resolved/rejected must not land with that terminal value silently selected
  (Save enabled) behind a dropdown that no longer lists it.

## Addendum (OBRS-378, 2026-07-16) — role-split default tab + a second socket trigger

OBRS-378 adds a `dismissed` status (a non-terminal screen-out decision, no
email) and role-splits the default list view: owner defaults to the `new` tab
(awaiting screening), admin defaults to `accepted` (owner-vetted) — both can
still switch to any tab. This touches the badge in three ways; ADR-0011's core
decision **holds**: there is still exactly one fetch path, the existing
`merge(...)`/`switchMap` in `AdminLayoutComponent.watchNewReportCount()` — no
second fetch path was added.

- **The badge is now parameterized by `badgeStatus`.** `AdminLayoutComponent`
  computes `badgeStatus: UsabilityReportStatus = this.authService.getRoles()
  .includes('admin') ? 'accepted' : 'new'` — the **raw** held role, same
  precedent as `UsabilityReportsPageComponent.isAdmin` above (see ADR-0012 for
  the raw-role rationale; not duplicated here). `newReportCount` is renamed to
  `badgeCount`. All three writers into `badgeCount` are gated/selected by
  `badgeStatus`:
  1. the poll/NavigationEnd/refreshRequested$ `switchMap` now calls
     `getUsabilityReportCountByStatus(this.badgeStatus)` (replacing the old
     hardcoded-`status:'new'` `getNewUsabilityReportCount()`);
  2. `UsabilityReportBadgeRefreshService.adjustBy()` is now status-tagged
     (`{status, delta}` — `BadgeCountAdjustment`) and the layout **ignores a
     delta whose status doesn't match its own `badgeStatus`** — this is the
     fix for a real bug: without the gate, an admin's badge (showing
     `accepted`) would have been wrongly decremented by another surface's
     `adjustBy('new', -1)` (e.g. the 'new'-tab auto-promote);
  3. the socket message payload gained a second count — `{ newReportCount,
     acceptedReportCount }` (matching the backend's
     `UsabilityReportCountBroadcast` record) — and the stream is renamed
     `count$` → `counts$`, emitting the whole message so the layout selects
     the field for `badgeStatus` itself (keeping the role decision in one
     file). This is backward-compatible on the wire: the pre-OBRS-378 FE only
     ever read `newReportCount`, and the backend still always sends it.
- **A second socket trigger, same channel.** The backend now also broadcasts
  on this same `/topic/admin/usability-report-count` destination when a
  report's status **changes** (not just on create) — e.g. an owner dismissing
  a report or an admin accepting one. No new destination, no new subscribe
  call; `BadgeSocketService` is unchanged in shape, only its payload/stream
  grew a field and a name.
- **The aria-label branches on `badgeStatus`.** `admin-layout.component.html`
  uses `NEW_BADGE_ARIA` when `badgeStatus === 'new'`, the new
  `ACCEPTED_BADGE_ARIA` when `'accepted'` — fixing an a11y bug where an
  admin's `accepted` count would otherwise have been announced as "new".
- **The page-level producers** (`UsabilityReportsPageComponent`'s auto-promote
  and its revert) now call `adjustBy('new', ...)` explicitly instead of the
  old untagged `adjustBy(delta)` — the badge these correspond to is always the
  `new`-tab count regardless of which role is currently viewing the page.

## Addendum (OBRS-527, 2026-07-19) — `owner_accepted` splits `accepted`; ADR-0011's core decision still holds

`accepted` was one status encoding two workflow stages ("owner screened it
through" and "platform took it on"). Both roles could set it, so an admin
accepting a report pushed it into the **admin's own** badge queue — a
meaningless self-loop. OBRS-527 splits the states: `new` → `in_review` →
`owner_accepted` (owner-screened, **admin's new badge**) → `accepted`
(platform-adopted, **nobody's badge**) → terminal. Every mechanism this ADR
describes is **unchanged in shape** — still one fetch path, one
`adjustBy`/`countAdjustments$` gate, one socket destination — only the
**status value each of them is parameterized by** moves from `accepted` to
`owner_accepted`:

- `AdminLayoutComponent.badgeStatus` is now `this.authService.getRoles()
  .includes('admin') ? 'owner_accepted' : 'new'` (was `'accepted'`) — same raw-role
  expression, same rationale, just a different target status.
- `saveStatus()` (`usability-reports-page.component.ts`) gains the delta calls
  the OBRS-378 addendum above didn't need: `adjustBy('owner_accepted', ±1)`
  when a save moves a report into/out of `owner_accepted`, with the mirror
  revert in the error handler — the same `adjustBy`/`trigger()` pairing
  `autoPromoteToInReview` already established, applied to the new stage.
  `onPickerConfirm` (mark-as-duplicate) and `unmarkDuplicate` gained their own
  `badgeRefreshService` calls for the first time (previously neither touched
  it at all) — see the SA spec's status-write-family table for the exact
  per-path duties.
- The socket payload field is **renamed**, not added: `acceptedReportCount` →
  `ownerAcceptedReportCount` (`BadgeSocketService.UsabilityReportCountMessage`,
  `admin-layout.component.ts` line ~333, read with a `?? 0` fallback for a
  version-skewed backend). `accepted` never had a badge meaning worth keeping
  a stale field name for — see `docs/api/websocket.md` (backend) for the wire
  contract.
- `ACCEPTED_BADGE_ARIA` (the i18n key) is **unchanged** — its copy ("…awaiting
  action") already described the admin's inbound queue generically enough to
  keep serving `owner_accepted`; only the `admin-layout.component.html`
  condition selecting it moved from `badgeStatus === 'accepted'` to
  `badgeStatus === 'owner_accepted'`.
- `UsabilityReportsPageComponent`'s decision dropdown is now **source-aware**
  (`detailStatusValuesFor()`, `usability-reports-page.mappers.ts`) rather than
  a fixed per-role list — see `docs/design-system.md` §2.4's `.is-owner-accepted`
  row and the SA spec for the full transition-matrix rationale (PO-2: every
  transition into/out of `accepted` is admin-only, closing the owner's
  screen-only tier at exactly the boundary this ADR's OBRS-370 addendum first
  established).
