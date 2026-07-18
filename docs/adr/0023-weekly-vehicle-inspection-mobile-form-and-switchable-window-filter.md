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
container rather than needing a portal) on two elements: a `top: 0` strip holding
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

### 2. The verdict toggle is the one net-new visual — themed via fixed status tokens

`p-selectButton`'s 2-segment OK/Needs-repair toggle is styled against the EXISTING
`--admin-success-*`/`--admin-danger-*` tokens (§2.4 of the design system), never the
runtime `--accent*` — the staff shell's `--accent*` resolves to teal-green, which
would make "selected" read as brand color rather than a verdict. `[allowEmpty]="true"`
is set **explicitly** even though it's PrimeNG's default (the well-known
`p-selectButton` gotcha is the opposite case — a *required* selection needing
`[allowEmpty]="false"`); here the field is genuinely optional until submit-time
validation, so the default is correct and the explicit binding documents that this
was a decision, not an oversight.

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

- The sticky-bar pattern and the fixed-status-token verdict toggle are logged in
  `docs/design-system.md` §12 ("New pattern log") so the next phone-first staff form
  reuses them instead of re-deriving.
- `pendingMaintenance`'s switchable-filter contract is now written down once; a
  future card narrowing it to a hard-bound query would silently reintroduce the
  rejected/ignored ambiguity this ADR exists to prevent.
- `inspection-week.ts` has no dependency on a new package — if a later card needs
  general ISO-week arithmetic beyond "how many weeks ago", promote `dayjs`'s
  `isoWeek` plugin then (with the usual dependency-approval step) rather than
  growing this file ad hoc.
