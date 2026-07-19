# ADR 0999 — Inspection-items admin: move-button reorder + icon-only Retire/Restore

**Date:** 2026-07-19
**Status:** Accepted
**Branch:** `ao/obrs-509-inspection-items-admin`

> **Number is a placeholder.** `0999-` was assigned deliberately unpicked — the
> coordinator reconciles ADR numbering against `origin/dev` at merge time,
> since sibling sessions land ADRs concurrently. Rename at merge, don't
> renumber now.

## Context

OBRS-509 adds `/admin/inspection-items`, an owner-facing CRUD + reorder + 3-locale
label editor for the vehicle-inspection checklist master list (SPEC-OBRS-509,
UX-OBRS-509 rev 3). Two decisions on this page introduce patterns not yet in
`docs/design-system.md`:

1. **How to let the owner reorder ~23 rows.**
2. **How to represent "this item is off" without a delete button** (AC#4: no
   hard delete anywhere in this feature, ever).

Both went through revisions during UX Scrutinize (documented in full inside
`UX-OBRS-509-inspection-items-admin.md` §0/§3.2/§4.2) — this ADR records the
final, landed decisions and why the earlier drafts were rejected, so the next
admin page that needs either doesn't repeat the same reasoning error.

## Decision 1 — move-up / move-down / move-to-top / move-to-bottom buttons, not drag-and-drop

No `cdkDrag`/`p-orderList`/`pReorderableRow` exists anywhere in this codebase
(grep-verified) — drag-and-drop would be a wholly new interaction pattern with
no local precedent, no established drag-handle/ghost/drop-indicator visual
language, and a real scrolling-vs-dragging gesture conflict on a ~23-row list
that overflows one viewport on a phone/tablet. Four icon buttons per row
(`arrow_upward` / `arrow_downward` / `keyboard_double_arrow_up` /
`keyboard_double_arrow_down`) give the owner both a one-step nudge and a
one-click jump to either end, and are natively focusable/operable — "the
accessible path" isn't a second affordance layered on top, it's the only
mechanism, so there's nothing extra to design or forget.

**Network model:** immediate `PUT /reorder` per click, no debounce, no
button-disabling, reconciled by a monotonic per-request sequence number
(`latestReorderSeq`) — a superseded *response* is dropped unread by the
handler that receives it (`if (seq !== this.latestReorderSeq) return;`).
A trailing background `store.refresh()` after the *winning* success closes a
separate hazard the sequence guard alone can't: an earlier-issued request
that still commits on the server *after* a later one, despite its response
losing the client-side race. `reorderPending` additionally gates the page's
`store.data$` subscription — while a reorder is outstanding, no unrelated
background emission (e.g. another action's trailing `refresh()`) may replace
`rows`; only the winning reorder success/error handlers may, and both flip
`reorderPending` to `false` immediately before triggering the emission they
intend to accept.

An earlier draft of this design used a debounced, single-flight queue
mirroring `AdminCollectionStore`'s internal `rerunRequested`/`inFlight`
fields. It was rejected (UX spec §3.2.2, Scrutinize R1): a pending debounced
write torn down by `takeUntil(destroy$)` on navigation silently drops the
write with no error (this app has no `RouteReuseStrategy`, so navigating away
mid-edit is the *normal* case); the mirrored fields are `private` on the real
store and expose nothing a page can actually hook into; and freezing move
buttons for the debounce+flight window directly fought the "the UI never
lags behind a click" goal the immediate-apply-then-PUT design achieves for
free.

## Decision 2 — `.admin-icon-btn` Retire/Restore, no color, no chip on active rows

Turning an item off is a named, confirm-gated **action** (`aria-label`
"Retire") rather than a state you flip — a plain `.admin-icon-btn` swapping
`visibility_off` (active row) / `visibility` (retired row) glyph, identical in
every other respect to the Edit button beside it. Active rows show **no**
status chip at all (absence means normal); only a retired row renders
`.admin-status.is-neutral`.

This is the **third** design for this control, and the first two are worth
recording so a future page doesn't re-derive either rejected reasoning:

1. **`p-inputSwitch`** (original SA-spec-adjacent draft) — rejected because
   its only dark-mode rule anywhere in this codebase is scoped to
   `.npref-row` (notification preferences, *outside* `.admin-shell`); this
   page would have put 23 unstyled switches on the dark admin shell, the
   same reasoning error that produced OBRS-312's ~46 solid-white boxes.
2. **`.admin-btn.admin-btn-small.admin-btn-danger` (Retire) / plain
   `.admin-btn.admin-btn-small` (Restore)**, reasoned from `boarding-list`'s
   already-shipped Board/Un-board pair — rejected for the **identical**
   underlying reason one level down: `--admin-danger-bg`/`-text`/`-border`
   and `--admin-success-bg`/`-text` are declared once, in the light `:root`
   only, with **zero** `.is-dark` override anywhere in `src/` (verified by
   grep). "Composes an existing token, no new hex" describes the CSS's
   *shape*; it doesn't describe its *rendered effect* in dark mode.
   `boarding-list`'s own Un-board button carries this same latent defect
   today — it is not proof the combination is dark-safe, only that nobody
   has looked at it on a dark shell yet.

`.admin-icon-btn` is the one control here that is *measured*, not just
*reasoned*, dark-safe: a real `.is-dark .admin-icon-btn` override exists at
`admin-theme.scss:621-623` (base rule `:607-619`), so Edit/Retire/Restore are
one single already-verified control, not three each needing their own
dark-mode argument.

Turning an item back **on** (Restore) is not confirm-gated — reactivating
isn't the action a user needs protecting from, and reversibility is the whole
point of retire-not-delete (SPEC §5.1/§5.2).

## Consequences

- No new `--admin-*` token, no new `.is-dark` rule, and no new chip class was
  added for this feature — every control cited above already exists and is
  already dark-verified.
- The next admin page needing a reorderable list should reuse the move-button
  + sequence-counter shape here rather than reaching for `cdkDrag`/
  `p-orderList` as a first instinct — there is still no drag precedent in this
  codebase, and the accessibility/scroll-conflict argument above applies
  equally to any similarly-sized admin table.
- The next admin page needing an "off but not deleted" row action should
  reuse `.admin-icon-btn` + `AlertService.confirm()` (destructive direction
  only) rather than `p-inputSwitch` or a color-modified `.admin-btn` variant,
  unless and until `docs/design-system.md` documents a genuinely dark-safe
  danger/success token pair (tracked as OBRS-520, out of scope here).
- Locking-spec candidates recorded in the UX spec (§11) for this page:
  reorder swap + dense-renumber + disabled-at-the-edges + out-of-order-response
  guard; a DOM assertion that no delete-shaped control exists anywhere in the
  rendered template (AC#4).
