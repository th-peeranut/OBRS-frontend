# 23. Weekly vehicle inspection: phone-first sticky-bar form pattern + switchable pending-window filter

Date: 2026-07-18
Status: Accepted
Card: OBRS-312

## Context

Two new surfaces, both consuming a locked backend contract:

1. `/staff/inspection` — a driver-facing, 23-item weekly checklist. The driver fills
   it in standing next to the van on a phone (375–414px), so the page must survive
   scrolling 23 rows without losing the vehicle/odometer context or the submit action.
2. A third "Inspections" tab on `/admin/vehicles`, reusing OBRS-209's `focusedVehicle`
   mechanic — read-only history + detail modal.

Neither surface had a direct precedent in this codebase:

- No existing staff/admin page uses a **sticky top strip + sticky bottom action bar**
  around a scrollable list of `FormArray` rows on a phone-first layout — every
  existing admin table assumes desktop-first with the primary action in a
  non-sticky page header.
- The pending-review indicator (`pendingMaintenance`) has no natural "closes"
  event: a rejected defect (owner judged it not worth repairing) writes nothing on
  the backend, so it stays `true` forever, identically to a genuinely ignored one.

## Decisions

### 1. Sticky top strip + sticky bottom bar (new pattern, `InspectionPageComponent`)

`position: sticky` (not `fixed`, so it participates in the shell's own scroll
container rather than needing a portal) on two elements: a strip holding
the vehicle dropdown / odometer input / progress pill, and a `bottom: 0` bar holding
the single primary Submit button. Both keep `z-index` above the row list and use
`--admin-surface-card` (the card token, not `--admin-surface`, the page-bg token —
otherwise the strip/bar would blend into the page background instead of reading as
chrome). Each row gets `scroll-margin-top` matching the top strip's height so
`scrollIntoView()` (used by the incomplete-row highlight) doesn't tuck the target
row under the sticky strip.

Reuse this pattern for the next phone-first data-entry form with a long scrollable
list and one persistent primary action, instead of a non-sticky header or a modal
wizard.

**Owner review correction — the top strip's `top` cannot be a hardcoded `0`.**
A real phone-375 "keyboard open" screenshot showed the top strip entirely
invisible: the shared staff-shell topbar (`.admin-topbar`, admin-theme.scss)
is ALSO `position: sticky; top: 0`, with a higher z-index (20 vs. this strip's
5). Two siblings both targeting `top: 0` is the classic stacked-sticky bug —
CSS sticky positioning has no awareness of a sticky sibling's height, so once
scrolled far enough both simultaneously pin to viewport y:0 and overlap; the
topbar's higher z-index then paints over the strip, hiding it completely. This
is worst on a short viewport (an on-screen keyboard), because the topbar's
title/subtitle wrap to MORE lines there (a taller topbar, sometimes 150-200px)
with very little vertical room left to reveal anything below it. Confirmed via
a real scroll test (not just a `fullPage` screenshot, which never actually
scrolls and so never exercises `position: sticky` at all): with a real
`scrollTo()` past both elements' natural flow position, at a squeezed
375×300 viewport, the strip's `getBoundingClientRect().top` read `0`,
exactly overlapping the topbar's `[0, 161]` box.

Fix: `InspectionPageComponent.measureTopOffset()` reads
`document.querySelector('.admin-topbar').getBoundingClientRect().height` (a
DOM read reaching OUTSIDE this component's own template on purpose — the
topbar is a shell-level sibling, not an ancestor within this component) and
binds the result as the strip's `top` via `[style.top.px]`, which wins over
the SCSS `top: 0` fallback (inline style beats an external stylesheet rule).
Recomputed in `ngAfterViewInit` (deferred a tick, since the topbar's
translated title may render a beat late), on `window:resize` (100ms
debounced), and on `translate.onLangChange` (wrapping changes with the
language). Each row's `scroll-margin-top` is bound the same way
(`topOffsetPx` + the strip's own measured height + a gap), so the
incomplete-row highlight still clears both sticky elements correctly.

This is deliberately NOT a shared-shell change — `.admin-topbar`'s own
sticky/z-index rules are untouched; only this page reads its height and
reacts. Reuse this "measure the shared shell topbar's live height, don't
assume the SCSS `min-height`" technique for the next sticky page-local
element stacked directly under the shell topbar.

**Owner review correction — the sticky bottom bar must clear the global FAB.**
`ReportUsabilityFabComponent`'s "Report Issue" FAB
(`position: fixed; bottom: 24px; right: 24px; z-index: 900`) sat on top of
the right end of the Submit bar in both a desktop and a phone-375
screenshot — a tap-target collision with the page's primary action. Fixed
entirely on this page's side (the FAB is a shared, app-wide component and is
untouched): `.inspection-bottom-bar` reserves right-side padding (two
breakpoint values mirroring the FAB's OWN 576px breakpoint, where it
collapses from a labeled pill to a 48×48 circle) so the Submit button's box
never extends into the FAB's footprint. Reuse this "reserve space, don't
touch the shared FAB" approach for the next page with a bottom-anchored
primary action.

### 2. The verdict toggle is the one net-new visual — plain `.admin-btn`, not PrimeNG

**Superseded design, corrected post-owner-review (real dark-mode screenshot).**
The first implementation used PrimeNG's raw `p-selectButton`, themed via
`::ng-deep .p-highlight:nth-child(1)/(2)` for the SELECTED state only.
PrimeNG's own `.p-button` base has no dark-mode-aware background anywhere in
this codebase, so every UNSELECTED segment rendered as a solid white block on
the dark card — with 23 rows, a driver opening the form at night saw a wall
of ~46 white boxes. The `::ng-deep` selectors were also DOM-order-dependent
and would have broken silently on a PrimeNG upgrade.

Fixed by dropping raw PrimeNG here entirely: the template renders two plain
`.admin-btn` elements (`.inspection-verdict-btn`) instead of `<p-selectButton>`
— the SAME shared primitive `boarding-list.component.scss`'s Board/Un-board
action already relies on for correct theming. `.admin-btn`'s
`background: var(--admin-surface-card)` / `color: var(--admin-text)` are
already dark-aware (admin-theme.scss), so the unselected state themes for
free with zero component-scoped rules. Selection state is now driven by a
component method (`selectVerdict(rowIndex, verdict)`) rather than a
`ControlValueAccessor`-bound `formControlName` — it sets the verdict
`FormControl` directly and, critically, **no-ops when the tapped segment is
already selected** (`if (control.value === verdict) return;`). This is the
same protection PrimeNG's `[allowEmpty]="false"` was providing (a first pass
had used `p-selectButton` with `[allowEmpty]="true"`, later corrected to
`false` — see the git history on this ADR — because combined with the
clear-on-switch-away rule in `buildItemGroup()`'s verdict `valueChanges`
handler, a re-tap-to-deselect would silently wipe a just-typed defect note);
the hand-rolled version gets the same guarantee without depending on a
PrimeNG input flag at all. Rows still start with no segment selected (that's
the FormControl's initial `null` value, design-system §3.1 — nothing to do
with `allowEmpty`), and `needs_repair` → `ok` still legitimately clears the
note as designed. Locked by specs asserting: no `p-selectbutton` element
exists in the rendered DOM, a repeated tap on the selected segment leaves the
note untouched, and a genuine transition to a different segment still clears
it.

The SELECTED state is styled against the EXISTING `--admin-success-*`/
`--admin-danger-*` tokens (§2.4 of the design system) in light mode, never the
runtime `--accent*` (the staff shell's `--accent*` resolves to teal-green,
which would read "selected" as brand color rather than a verdict). In dark
mode the pair is **inverted** (`:host-context(.admin-shell.is-dark)`): the
`-text` token becomes the background, the `-bg` token becomes the foreground.
`--admin-success-*`/`--admin-danger-*` deliberately have NO dark-mode override
at the token level (admin-theme.scss's `.is-accepted` comment: these are
designed as a self-contained small CHIP — light pastel bg + dark text stays
legible at badge size in either theme). At FULL-BUTTON size that reasoning
doesn't hold — a bright pastel block next to a now-correctly-dark unselected
button reads as a light-mode leftover, not a selected state. Inverting the
existing pair (rather than inventing a new hex, forbidden per design-system
§2.2, or adding a dark override to the shared token file, which would recolor
every OTHER consumer of these tokens as a side effect of an inspection-only
card) keeps the exact same contrast ratio — already the established
AA-passing combination, since contrast is symmetric under an fg/bg swap —
while reading as a genuine dark-mode-appropriate filled button instead of a
stark pastel block.

### 3. `VehicleInspectionHistoryStore` is component-scoped, mirroring `VehicleMaintenanceStore` exactly

Same reasoning, verbatim: `AppVehicleInspectionPanelComponent` mounts fresh per
focused vehicle (`providers: [VehicleInspectionHistoryStore]`), and a root-scoped
singleton would flash the previously-focused vehicle's cached history into the
newly-focused vehicle's panel before the background revalidate lands. The three
driver-facing stores (`VehicleInspectionItemsStore`, `InspectableVehiclesStore`,
`MyInspectionsStore`) ARE root-scoped, like `DriverSchedulesStore` — none of them
are keyed by a per-mount id.

### 4. The owner history's pending-window filter is a switchable client-side filter, never a hard query bound

Default view = current + previous Bangkok ISO week (`isWithinRecentIsoWeeksBangkok`,
`weeksBack=1`); a "Show all" toggle removes the window entirely. This is
deliberate, not a placeholder for a future server-side date-range param: a
**rejected** defect (owner decided it isn't worth repairing) writes nothing, so
`pendingMaintenance` stays `true` forever — identically to a genuinely **ignored**
one. The 2-week default lets a rejected defect age out of the everyday view, while
"Show all" still surfaces an ignored one. A hard-bound query (`?within=2weeks`)
would make the ignored case disappear exactly like the rejected case — indistinguishable,
which defeats the entire point of the indicator. Any future surface built on
`pendingMaintenance` must keep this same switchable-not-bound shape.

### 5. New `shared/lib` utilities, both DRY-checked against the existing catalog before writing

- `vehicle-inspection-error.ts` follows `change-seat-error.ts`'s exact
  `extractXErrorCode`/`mapXErrorCode(code, fallbackTier)` shape — reuses
  `extractApiErrorCode()` (ADR-0022) and `classifyHttpFallback()` rather than
  re-deriving either.
- `inspection-week.ts` is a new ISO-week (Monday–Sunday, Bangkok) helper —
  checked against `display-date-time.ts`'s `bangkokParts()` (same
  `Intl.DateTimeFormat` fixed-timezone technique, since Thailand has no DST) and
  against `dayjs`'s available plugins (no `isoWeek` plugin is installed, and
  adding one needs prior approval per `CLAUDE.md` — "No new `package.json`
  dependencies"), so this is native `Date`/`Intl` math, not a dayjs plugin.

## Consequences

- The sticky-bar pattern (including the topbar-offset measurement and the FAB
  clearance padding) and the plain-`.admin-btn` verdict toggle are logged in
  `docs/design-system.md` §12 ("New pattern log") so the next phone-first staff form
  reuses them instead of re-deriving.
- `pendingMaintenance`'s switchable-filter contract is now written down once; a
  future card narrowing it to a hard-bound query would silently reintroduce the
  rejected/ignored ambiguity this ADR exists to prevent.
- `inspection-week.ts` has no dependency on a new package — if a later card needs
  general ISO-week arithmetic beyond "how many weeks ago", promote `dayjs`'s
  `isoWeek` plugin then (with the usual dependency-approval step) rather than
  growing this file ad hoc.
