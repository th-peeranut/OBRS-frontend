# ADR 0021 — Duplicate-picker modal owns its own backdrop (not nested)

**Date:** 2026-07-16
**Status:** Accepted
**Branch:** `ao/obrs-376-admin-mark-duplicate`

## Context

OBRS-376 adds admin mark/un-mark-as-duplicate to `UsabilityReportsPageComponent`.
Marking is triggered from **two** places: a table row action (no other modal
open) and a secondary button inside the existing detail modal. Either way it
opens `UsabilityReportDuplicatePickerComponent`, a dumb candidate-search modal
(new component, `usability-reports/usability-report-duplicate-picker/`).

The page already has one modal-over-modal precedent: the image lightbox opens
above the detail modal (design-system.md §6). That precedent works by nesting
the lightbox's markup *inside* the detail modal's `.admin-modal-backdrop` div
and giving the lightbox no `adminModalBackdrop` directive of its own — ESC is
handled once, by the detail modal's directive, whose `(dismiss)` handler
(`onDetailBackdropDismiss()`) checks "is the lightbox open?" and closes that
layer instead of the detail modal underneath.

That precedent doesn't transfer directly here: the picker must also work
**standalone**, opened from a row with no detail modal mounted at all, so it
cannot rely on being nested inside a modal that might not exist.

## Decision

`UsabilityReportDuplicatePickerComponent` owns its **own** `.admin-modal-backdrop`
+ `adminModalBackdrop` directive instance (same shape as
`VehicleDeleteModalComponent` and the other presentational confirm-modals),
rendered as a **top-level sibling** in the page template — not nested inside
the detail modal's backdrop element. This makes it work identically whether
opened from a row or from the detail modal's secondary button.

The trade-off: `adminModalBackdrop`'s Escape listener is bound to
`document:keydown.escape`, so when the picker is open **while the detail
modal is also mounted**, both directive instances receive the same Escape
keypress and both `dismiss` handlers fire. To keep Escape closing only the
topmost layer, `onDetailBackdropDismiss()` gained a picker-open guard as its
**first** check (ahead of the existing lightbox check):

```ts
protected onDetailBackdropDismiss(): void {
  if (this.isPickerOpen) {
    return; // the picker's own directive instance handles its own dismiss
  }
  if (this.lightboxImageUrl) {
    this.closeLightbox();
    return;
  }
  this.closeDetail();
}
```

Backdrop-click needs no equivalent guard: both backdrops are `position: fixed;
inset: 0` full-viewport overlays, and the picker's (`.ur-duplicate-picker-backdrop`,
`z-index: 1250`) always paints above the detail modal's (`z-index: 1200`), so a
click anywhere outside the picker's inner `.admin-modal` always lands on the
picker's own backdrop element — the detail modal's backdrop-click handler
never sees it.

## Consequences

- The picker is fully self-contained (own directive, own dismiss handling) and
  reusable from any future entry point without needing to know whether a
  parent modal happens to be open.
- `onDetailBackdropDismiss()` carries one extra branch; the ordering (picker →
  lightbox → detail) documents the actual stacking priority in one place.
- Precedent for the **next** modal-over-modal on this page that must also
  support a standalone entry point: give it its own `adminModalBackdrop`
  instance and add a same-shaped guard to `onDetailBackdropDismiss()`, rather
  than trying to force it into the lightbox's nested-no-own-directive shape.
