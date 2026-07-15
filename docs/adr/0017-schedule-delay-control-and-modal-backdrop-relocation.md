# ADR 0017 — Schedule delay control: inline dialog in `shared/`, `AdminModalBackdropDirective` relocation, `--admin-delayed-*` token

**Date:** 2026-07-13
**Status:** Accepted
**Branch:** `ao/obrs-272-trip-delay-notify`

## Context

OBRS-272 adds a staff-only "Mark delayed"/"Update ETA" control to the shared
`BoardingListComponent` (`src/app/shared/components/boarding-list/`), which is
dual-mounted `[scheduleId]`-only by `sell-page` (Tab 3) and
`staff-schedules-page` (ADR 0014). The control needs:

1. A dialog (date/time ETA + optional reason) — following the codebase's
   universal admin-modal pattern (`*ngIf`-gated `.admin-modal-backdrop` /
   `.admin-modal`, component-local state, no separate component, no NgRx —
   mirrors OBRS-256's `onScheduleStatusAction()`).
2. A new "delayed" indicator pill, DERIVED off `delayedDepartureDateTime`
   (never a status code — `status` stays `scheduled`).

Every existing `.admin-modal-backdrop` dialog in the app is owned by a
component declared in `AdminModule` (lazy-loaded), which relies on
`[adminModalBackdrop]` — `AdminModalBackdropDirective` — declared in that same
module. `BoardingListComponent` is declared in `SharedModule` instead (it must
be reachable from both the staff and (via Tab 3) effectively the same shell
without a feature-module dependency). `SharedModule` cannot import
`AdminModule` to reach the directive: `AdminModule` already imports
`SharedModule` (for `BoardingListComponent` itself, among others), so the
reverse import would be a module cycle.

## Decision 1: relocate `AdminModalBackdropDirective` into `SharedModule`

Moved `AdminModalBackdropDirective` from
`src/app/modules/admin/components/admin-modal-backdrop.directive.ts` to
`src/app/shared/directives/admin-modal-backdrop.directive.ts`, and its
declaration from `AdminModule` to `SharedModule` (declared **and** exported).
`AdminModule.declarations` had the directive **removed** in the same change —
Angular forbids declaring a directive in two `NgModule`s.

Why this is safe and the simpler of the two options the UX spec offered
(the alternative was routing through `AdminSharedModule`, the existing thin
module shared by `AdminModule`/`StaffModule` for `AdminDropdownComponent`/
`AdminRefreshHintComponent`):

- The directive is **generic** — backdrop/Escape/focus-trap/scroll-lock/aria —
  nothing admin-specific lives in it. It never imported anything from
  `modules/admin/`.
- Both `AdminModule` and `StaffModule` already import `SharedModule` (for
  `BoardingListComponent`, `NavbarComponent`, etc.), so every existing admin
  modal (`schedules-page`, `vehicle-form-modal`, `user-delete-modal`, …)
  keeps resolving `[adminModalBackdrop]` unchanged — verified by the 6
  existing component specs that construct the directive directly (import
  path updated, behavior untouched) and by `ng build`.
- Routing through `AdminSharedModule` instead would also have been
  cycle-free, but adds an extra module hop for a control that isn't
  admin-specific; putting a generic UI primitive in `SharedModule` (which
  already owns `BoardingListComponent`, the only consumer that actually
  needed the reach) is the more direct fix.

`CalendarModule` (PrimeNG) is now also imported by `SharedModule` — it wasn't
before, and `BoardingListComponent`'s new dialog uses `p-calendar` for the
date/time fields. `AdminModule`/`StaffModule` already imported it directly for
their own templates; this addition is scoped to `SharedModule`'s own need.

## Decision 2: the dialog is inline `*ngIf` markup in `boarding-list.component.html`, not a new component

Every other admin dialog in the codebase is a `*ngIf`-gated block with
component-local `FormGroup` + boolean-flag state (no `NgModel`-driven separate
component, no store slice) — see `schedules-page.component.html`'s two modals,
`vehicle-form-modal`, `route-form-modal`, etc. The delay dialog follows this
exactly: `isDelayFormOpen` / `delayForm: FormGroup` / `isSubmittingDelay` live
directly on `BoardingListComponent`, and `StaffApiService.delaySchedule()` is
called directly (mirrors OBRS-256's `onScheduleStatusAction()` — no NgRx
action/effect/reducer/selector for a single-schedule, component-scoped PATCH).
Splitting this into a separate component would introduce a fourth dialog
pattern for zero benefit — the existing "each dialog is inline" convention
already fits a `shared/`-hosted component just as well as an `AdminModule`
one.

## Decision 3: `--admin-delayed-bg` / `--admin-delayed-text` (violet), not a reuse of an existing status token

"Delayed" is a schedule-level state that coexists with `scheduled` (the
backend never changes `status`), so it needs a color distinct from the
existing on-screen status pill (`scheduled` = `.is-neutral` grey, `departed` =
`.is-info` blue-grey, `arrived` = `.is-success` blue). `.is-warning` (orange)
was ruled out — it's reserved (§11: the admin shell's resolved `--accent*` is
always orange in `theme-admin`, so `.is-warning` already collides there).
Added a new pair (`#ede9fe` bg / `#4c1d95` text, light bg + dark text, **no**
one-sided dark-mode override — same self-contained-chip reasoning as
`.is-accepted`) rather than reusing any existing role. Contrast verified via
the WCAG relative-luminance formula: bg/text ≈ 9.2:1 (comfortably above the
4.5:1 AA floor); the violet hue is visually distinct from the grey/blue-grey/
blue pills it sits beside regardless of which shell accent (`theme-staff`
teal-green, `theme-admin` orange) is active. See design-system.md §2.4/§12.

## Decision 4: "delayed" stays a derived UI state, never a `parseAdminStatus` branch

`AdminScheduleDto`/`BoardingManifestHeader` gained
`delayedDepartureDateTime`/`delayReason` as sibling fields to `status`, not a
new status value. `BoardingListComponent.isScheduleDelayed` is a plain
`tripHeader?.delayedDepartureDateTime != null` check — a new branch alongside
(not inside) the existing `scheduleStatusPillClass`/`scheduleStatusPillIcon`/
`scheduleStatusPillLabelKey` switch statements. This matches the backend
contract (`PATCH .../delay`'s response `status` is always `"scheduled"`) and
keeps `parseAdminStatus()` — the one shared status parser used by every other
admin status-driven view — untouched.

## Consequences

- `AdminModule.declarations` shrank by one; `SharedModule.declarations`/
  `exports` grew by one directive + `CalendarModule` import. No other
  `AdminModule` consumer changed behavior.
- 6 existing spec files (`vehicle-delete-modal`, `user-delete-modal`,
  `user-unlock-modal`, `role-delete-modal`, `promotion-deactivate-modal`,
  `usability-reports-page`) updated their `AdminModalBackdropDirective` import
  path only — no behavioral change.
- A future `shared/`-hosted component that needs an admin-style modal reuses
  `SharedModule`'s `[adminModalBackdrop]` directly; a future admin-only
  control keeps using it exactly as before (still resolves via
  `AdminModule → SharedModule`).
