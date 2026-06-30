# ADR-006 — Global FAB + Report Usability Modal

**Date:** 2026-06-30
**Status:** Accepted

---

## Context

Users (and internal staff) need a low-friction path to report UX issues, bugs, or
suggestions without leaving their current workflow. The report must be available on
every page — including the public B2C shell, the staff shell, and the admin shell —
and must work for anonymous users (not just authenticated ones).

---

## Decision

### Global FAB mounted at `AppComponent` level

The `<app-report-usability-fab>` is placed as a sibling of `<router-outlet>` in
`app.component.html`. This is above every module shell (B2C, Staff, Admin) and
therefore appears on every route without each feature module needing to declare it.

Alternative considered: mounting the FAB inside each shell's layout template. Rejected
because it requires three separate mount points that must stay in sync and cannot serve
anonymous routes that have no shell.

### Body scroll lock — inline, not `AdminModalBackdropDirective`

`AdminModalBackdropDirective` lives in `AdminModule`, so it is unavailable to
`SharedModule` without a circular dependency. The FAB modal therefore applies
`document.body.style.overflow = 'hidden'` on open and restores it on close directly
inside the component. The directive is still used in `UsabilityReportsPageComponent`
(which is inside `AdminModule`) where it is appropriate.

### Modal opens synchronously (no pre-flight HTTP)

The FAB opens the modal immediately on click (flip `isModalOpen = true`). No HTTP call
is made before the modal is visible. This matches the design-system §6 rule and avoids
the blank-modal problem on slow SIT connections (~2 s round-trips).

### Anonymous-capable submit

The service POSTs to `/api/usability-reports` (public, no `/private/` prefix) so
unauthenticated users can file reports. The auth interceptor passes through with no
Bearer header when no token is stored; the backend accepts the request without one.

### SWR admin triage store (`UsabilityReportsStore`)

The store follows the `AdminCollectionStore` pattern introduced in ADR-003: root-scoped
(`providedIn: 'root'`), cache outlives component, `refresh()` revalidates in the
background while the cached list stays visible. `ngOnInit` subscribes to `data$` first,
then calls `store.refresh()` — this order guarantees the component sees the cached
value synchronously if it already exists, and then receives the fresh value when the
background fetch completes.

`store.mutate` is called with a **transform function** `(current) => new value`, never
with a partial object, matching the `AdminCollectionStore` contract.

### Error code mapping from backend

Error handling reads `err?.error?.errorCode` (the `ApiErrorResponse.errorCode` field —
a stable UPPER_SNAKE string). It never reads `err.message` (which is localized by the
browser or the global error interceptor and therefore unstable). Each known code maps to
a specific i18n key under `USABILITY_REPORT.ERROR.*`; any unknown code falls through to
`USABILITY_REPORT.ERROR.GENERIC`.

---

## Consequences

- Every new page / shell automatically gets the FAB at zero integration cost.
- The FAB z-index (900) sits below admin modals (~1200) and SweetAlert2 (1400).
- The modal backdrop z-index (1350) sits above admin modals but below SweetAlert2 — so
  the success alert appears above the modal backdrop when a report is submitted.
- If the FAB needs to be hidden on specific routes (e.g., a full-screen payment step),
  the component can subscribe to `Router.events` and toggle `hidden` — this is deferred
  until a concrete need arises.
