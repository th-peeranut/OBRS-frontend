# ADR 0018 — Notification bell/inbox: `p-overlayPanel` rich-content popup, root-service state (not NgRx)

**Date:** 2026-07-14
**Status:** Accepted
**Branch:** `ao/obrs-317-notification-inbox`

## Context

OBRS-317 adds a poll-based in-app notification inbox (Phase 1) for the
owner/admin/staff back-office: a bell + unread badge in the admin/staff
topbar, opening a popup that lists the current user's most recent
notifications with click-to-read and "mark all read". The backend contract
is role-agnostic under `/api/private/notifications` (unread-count, paged
list, mark-one, mark-all).

Two design questions needed a precedent-setting answer: what popup control
hosts the (stateful, scrollable, actionable) list, and where the
cross-cutting unread-count/list state lives.

## Decision 1: `p-overlayPanel`, not `p-menu[popup]`

The codebase's one existing trigger-popup precedent is
`ExportButtonComponent` (`docs/adr/0001-export-button-component.md`), which
uses `p-menu[popup]` with a `MenuItem[]` array (label + command per item).
That shape doesn't fit here: a notification row needs a message, an absolute
timestamp, a read/unread visual state, and its own click handler that
triggers an optimistic service call — none of which is expressible as a
`MenuItem`. Forcing this into `p-menu` would mean encoding row markup into
`MenuItem.label` (losing structure) or fighting the component's built-in
item-click/keyboard-nav behavior.

`p-overlayPanel` instead hosts **arbitrary projected content** — here, the
existing dumb `AppNotificationInboxPanelComponent`, itself composed of
`AppNotificationInboxRowComponent` rows — while keeping the same
trigger-button-toggles-a-floating-panel interaction model as the `p-menu`
precedent (`(click)="overlayPanel.toggle($event)"`, `appendTo="body"`). This
is the **first** `p-overlayPanel` usage in the codebase; it is the correct
tool specifically when the popup's content is a stateful, scrollable list
rather than a flat command menu — reuse it for the next such need instead of
stretching `p-menu` or introducing a third popup primitive. See
design-system.md §3 (new row) and §12 (pattern log entry).

## Decision 2: root RxJS-subject service (`NotificationInboxService`), not NgRx

NgRx (Store/Effects/Selectors) in this codebase is scoped to the
customer-facing booking modules (home, schedule-booking, e-ticket,
my-bookings, passenger-info — see `CLAUDE.md` §3's module map). The
admin/staff back-office instead uses `providedIn: 'root'` services holding
plain `BehaviorSubject`s for cross-cutting concerns that outlive a single
page — the precedents are `UsabilityReportBadgeRefreshService` (a same-page
refresh trigger), `BadgeSocketService` (a STOMP-pushed count), and
`AdminCollectionStore<T>` (a stale-while-revalidate page cache). Introducing
an NgRx slice for one topbar bell would be the first NgRx touchpoint inside
`modules/admin`/`modules/staff`, breaking that boundary for a feature with no
booking-flow relationship — a strictly worse fit than extending the existing
root-service convention already used for every other back-office
cross-cutting signal.

`NotificationInboxService` (`src/app/shared/services/notification-inbox.service.ts`)
follows that convention directly:
- `unreadCount$` / `items$` / `totalElements$` / `loading$` / `error$` are
  `BehaviorSubject`s, mirroring `BadgeSocketService.count$`.
- `startPolling()` is an idempotent-start guard, mirroring
  `BadgeSocketService.connect()` (`if (this.client?.active) return;`).
- State clears on logout via `authService.authStatus$`, mirroring
  `AdminCollectionStore`'s constructor-time subscription (`if
  (!isAuthenticated) { this.clear(); }`), plus an explicit
  `stopPolling()` call from each layout's `ngOnDestroy`/`onLogout` — belt and
  suspenders, matching `AdminLayoutComponent`'s explicit
  `badgeSocketService.disconnect()` teardown alongside `BadgeSocketService`'s
  own lifecycle.
- Optimistic mark-one/mark-all with rollback-on-failure is the same shape as
  `UsabilityReportBadgeRefreshService.adjustBy()`'s instant local nudge, just
  carried inside this service instead of a second cross-service signal.

## Consequences

- `SharedModule` gained `OverlayPanelModule` (new PrimeNG import) and three
  new declarations: `NotificationBellComponent` (exported — mounted in both
  `admin-layout.component.html` and `staff-layout.component.html`),
  `NotificationInboxPanelComponent`, `NotificationInboxRowComponent` (both
  internal to the bell's own template, not exported).
- `NotificationApiService` (`src/app/services/notifications/`) is a new,
  separate HTTP service — deliberately not folded into the admin-scoped
  `AdminApiService`, since `/api/private/notifications` must also serve
  staff (salesperson/driver), who cannot use `AdminApiService`'s admin-only
  routes.
- A future back-office feature needing a stateful popup reuses
  `p-overlayPanel` (Decision 1); a future cross-cutting back-office signal
  reuses the root-BehaviorSubject-service shape (Decision 2) rather than
  introducing NgRx into `modules/admin`/`modules/staff`.
