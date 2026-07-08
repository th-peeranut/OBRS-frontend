# ADR 0001 — Export button component

**Date:** 2026-07-08
**Status:** Accepted
**Branch:** `ao/export-system`

## Context

OBRS-101 introduces a generic backend export endpoint
(`GET /api/private/exports/{datasetKey}?format=csv|xlsx&<filters>`) that any
admin/staff list screen can call to download the current view as CSV or
Excel. This ADR covers the thin, reusable frontend surface that consumer
screens plug into: `ExportService` (`src/app/services/export/export.service.ts`)
and `ExportButtonComponent`
(`src/app/shared/components/export-button/`). Screen-level wiring (which
dataset key, which filters) is left to each consumer card — this ADR is
about the shared primitive only.

## Decisions

### 1. `p-menu[popup]`, not `p-splitButton`

The format picker (CSV vs. Excel) is a two-item popup menu triggered by a
button. PrimeNG's `p-splitButton` looks like the obvious fit (a primary
action plus a dropdown of secondary ones), but it is **not used anywhere in
this codebase** — the existing trigger-popup pattern for exactly this shape
(a button that opens a small command list) is `p-menu[popup]="true"` with a
template-ref `#menu` and `(click)="menu.toggle($event)"`, established in
`walk-in-trip-browser.component.html` for trip row actions. Reusing it means:

- No new PrimeNG sub-component idiom to learn/maintain alongside the one
  already in use for the same interaction shape.
- `appendTo="body"` behavior (needed when the trigger sits inside a
  scroll/overflow container, e.g. a table toolbar) is already proven for
  `p-menu` in this app; it isn't for `p-splitButton`.
- The button itself stays a plain `admin-btn` we fully control (icon +
  label + chevron, loading-state swap) rather than being owned by a
  compound PrimeNG widget with its own internal button markup.

### 2. Hidden, not disabled, when the role is missing

`ExportButtonComponent` wraps its entire template in
`*ngIf="canExport"` (`canExport = authService.hasAnyRole([requiredRole])`)
rather than rendering a disabled button with a tooltip. This matches the
existing precedent in `staff-layout.component.ts` / `navbar.component.ts`,
where role-gated nav items and actions are removed from the DOM outright,
not greyed out. Rationale carried over from that precedent:

- A disabled button invites "why can't I click this?" support tickets;
  omitting it entirely reads as "this isn't part of your workflow," which is
  correct — most viewers of a given screen never have export permission for
  every dataset.
- No focus-trap/tooltip affordance has to be built and localized just to
  explain a permission gap.
- `AuthService.hasAnyRole` already expands the role hierarchy (admin >
  owner > salesperson > driver > customer) and treats `admin` as the
  existing wildcard, so `requiredRole` never needs special-casing here —
  the component asks one question and gets the right answer for every
  shell.

### 3. No success toast

On success the component silently returns to idle. The browser's own
download UI (progress in the downloads tray/bar) *is* the confirmation; a
`AlertService.success()` toast on top would be a second, redundant
"success" signal arriving after the file is already on disk, and risks
overlapping/covering the browser's native download indicator right after
the click. Errors still surface through `AlertService.error()` because
there the browser gives the user no signal at all — silence would look like
nothing happened. A `COMMON.EXPORT.SUCCESS` key is reserved in all three
locale files for a future surface (e.g. a large/slow export moved to a
background job) that does need an explicit completion toast, but it is not
wired to the default synchronous flow.

## Consequences

- Any future export trigger elsewhere in the app should reuse
  `app-export-button` rather than hand-rolling another menu/button
  combination — see the "Export trigger" pattern added to
  `docs/design-system.md` §3.
- `ExportService.export()` sets `SKIP_GLOBAL_ERROR_ALERT` because the error
  body arrives as a `Blob` (responseType `'blob'` applies to the error path
  too) — the global `errorInterceptor` cannot read a Blob body, so the
  service reads it as text and parses `{ errorCode }` itself. Consumers
  branch on `errorCode` only, never a localized message (design-system.md
  §9).
- `ExportButtonComponent` carries no `@Output()`s and no NgRx — it is fully
  self-sufficient given `datasetKey` / `requiredRole` / `params`. If a
  future consumer needs to react to export completion (e.g. refresh a
  "last exported at" timestamp), that will need a new `@Output()` added as
  an optional addition, not a fork of this component (design-system.md
  §10).
