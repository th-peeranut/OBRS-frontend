# Agent Memory — Scrutinize notes for developers

## 2026-07-15 — SELF-FIXED: OBRS-370 duplicated HTML comment (copy-paste artifact)

In `usability-reports-page.component.html` the OBRS-370 Jira-key-visibility
comment block was pasted twice, back-to-back, above the
`*ngIf="detailReport.jiraIssueKey && isAdmin"` row. Harmless at runtime but a
copy-paste smell. Removed the duplicate (kept one). Lesson: when adding an
explanatory comment above a gated element, paste once — re-check the diff for
an accidental double-insert before submitting.

## 2026-07-14 — FIXED: OBRS-361 live defect — second selectButton field silently dropped on submit

QA reproduced (3x, one-way ASSIGNED booking) that setting BOTH `seatPreference`
("Window") AND `seatRequirement` ("Wheelchair accessible") on the same passenger
card kept only the FIRST-clicked field in the actual `POST /api/private/bookings`
body — the second silently came back `null`, even though both buttons still showed
`p-highlight`-selected in the DOM at submit time. Single-field cases (either alone)
were fine; the OBRS-362 badges were unaffected.

**Root cause (confirmed via debug-mantra trace + an A/B test revert, not guessed):**
`setPassengerData()` — called every time the `passengerInfo` store slice emits,
which since OBRS-361 now includes the NEW debounced live-sync round trip
(`passengerData.valueChanges` → 300ms debounce → dispatch → store →
`selectPassengerInfo` → `setPassengerData()`), not just the old rare initial-load /
OPEN-seating +/- cases — unconditionally did `while (passengerData.length)
{ removeAt(0) }` then rebuilt every group with `createPassengerGroup()` + `push()`,
i.e. destroyed and recreated every `FormControl` on EVERY round trip. Angular's
`formControlName`/`formGroupName` directives bind to a control instance once, at
directive init, and do **not** rebind just because `*ngFor` (with
`trackBy: trackByIndex`) reuses the same DOM node for a replaced control at the
same index. So: click Window (t=0) → 300ms later the debounced round trip
REBUILDS the FormArray (new control instances, values reaffirmed from what was
known at t=0 — just Window) → click Wheelchair sometime after that → the
`p-selectButton`'s CVA is STILL wired to the OLD (now-detached, pre-rebuild)
`seatRequirement` control, so the click updates a control nothing reads anymore.
The button's own local highlight state still looks right (driven by the CVA's
cached value), but `getRawValue()` on the CURRENT live FormArray — which
`buildPassengerInfoPayload()`/the submit path actually reads — never sees it.

**Fix** (`passenger-info-form.component.ts`, `setPassengerData()`): patch existing
groups IN PLACE (`this.passengerData.at(index).patchValue(...)`) when the
passenger COUNT is unchanged — the common case for a live field edit — instead of
destroying/recreating every control. Only the genuine count DELTA is
added/removed (`push`/`removeAt` trimmed to the difference). This means a control
the user is actively bound to is never swapped out from under them mid-interaction,
regardless of click timing relative to the debounce window.

**Test that catches it** (`passenger-info-form.component.spec.ts`, inside the
"OPEN-seating rendering, OBRS-323" describe): *"OBRS-361 defect repro: setting BOTH
fields survives the debounced store round-trip into the submit payload, all the way
through the lowercase payload boundary"* — drives the REAL form via two real DOM
clicks (Window, then Wheelchair) with `fakeAsync`/`tick(300)` letting a REAL
debounced store round trip run in between (the exact QA timing), using MockStore
with a `spyOn(store, 'dispatch').and.callFake(...)` that manually completes the
round trip exactly as `PassengerInfoEffect.setPassengerInfo$` does (a synchronous
pass-through — MockStore doesn't run real reducers/effects). Verified via an
explicit A/B revert: reverted `setPassengerData()` to the pre-fix
destroy-and-rebuild version, reran — the test FAILED with
`seatRequirement: null` (the exact reported symptom, second-clicked field lost);
restored the fix, reran — passes. Also asserts the payload survives the lowercase
boundary via the real `PassengerInfoComponent.buildPassengersPayload()`.

**Unrelated drift noticed mid-session**: `passenger-info.component.ts`'s own
pre-existing private `normalizeSeatNumber()` (booking-payload seat-number
stripping) got consolidated onto the shared `shared/lib/seat-label.ts` util
(`normalizeSeatNumber as stripSeatDigits`) — flagged in the original OBRS-361/362
report as a follow-up not done at the time; it landed here (via linter/tooling,
not a deliberate edit this session) and is functionally equivalent + covered by
the existing passing `passenger-info.component.spec.ts` suite (9/9), so kept as-is
rather than reverted.

**Full suite**: `ng test --watch=false --browsers=ChromeHeadless` → 2249/2249
SUCCESS (2248 prior + the 1 new defect-repro test).

---

## 2026-07-14 — IMPLEMENTED: OBRS-361 + OBRS-362 advanced-booking passenger preferences

**Worktree:** `OBRS-frontend-wt-obrs-361-362-booking-prefs` (branch `ao/obrs-361-362-booking-prefs`).
Note for whoever reads this next: this entry's own UX spec was NOT actually present
in this file when the frontend session started (grepped for `OBRS-361`/`OBRS-362`/
`wheelchair`/`seatPreference` — zero matches; the file's most recent entry was
2026-07-13 OBRS-283, several cards behind). The full spec was carried in the task
brief instead (component-by-component, i18n table, the 2 scrutinize blockers) — the
implementer built directly from that, cross-checked against the real component code.
Flagging the gap so a future session knows this file's "UX designer left the spec
here" convention had a miss on this card.

**Built exactly per the task brief. Summary of what landed:**

- **Inputs (OBRS-361):** `passenger-info-form.component.ts` — added
  `seatPreference: [null]` / `seatRequirement: [null]` to `createPassengerGroup()`
  (never pre-seeded, design-system §3.1). Two `p-selectButton` groups (window/aisle,
  wheelchair/extra_legroom), `[allowEmpty]="true"`, custom `pTemplate="item"` for
  icon+i18n-key rendering, each wrapped `role="group"` + `[attr.aria-label]` —
  verbatim recipe from `route-map-home.component.html`. `SelectButtonModule`/
  `ReactiveFormsModule` already flow in via `SharedModule` → `PassengerInfoModule`,
  no module change needed.
- **Visibility:** `showSeatPreferenceFields(index, outboundOpen, returnOpen, isReturn)`
  — hides when every leg is OPEN (same semantics as `allLegsOpenSeating$`, computed
  from a new `passengerPrefsContext$` combineLatest of the 3 EXISTING per-leg
  observables, never re-derives `seatingMode`), else hides once every ASSIGNED leg
  relevant to the passenger has a seat. One-way ignores `passengerSeatReturn`; mixed
  round-trip ignores the OPEN leg's always-empty seat. Full enumeration table locked
  in `passenger-info-form.component.spec.ts`.
- **Scrutinize blocker #1 (loop-safe live sync):** new `passengerData.valueChanges`
  subscription in `ngOnInit`, `filter(() => !this.isPatchingFromStore)` placed
  **BEFORE** `debounceTime(300)` — load-bearing ordering. The store→
  `setPassengerData()` rebuild sets/clears the flag synchronously well under 300ms,
  so a guard checked only AFTER the debounce window would already see it cleared and
  dispatch again (the exact feedback loop the blocker warned about). Filtering
  pre-debounce discards every rebuild-driven emission at the moment it fires.
  Verified with a `fakeAsync`/`tick` spec: a burst of keystrokes settles to exactly
  ONE dispatch after 300ms of quiet, and a `setPassengerData()` rebuild alone never
  dispatches.
- **Scrutinize blocker #2 (AC-361.5):** `PassengerInfoComponent.buildPassengersPayload()`
  gained a 3rd `isLegOpen` param (default `false`, so the 2 pre-existing bare-2-arg
  call sites in `passenger-info.component.spec.ts` are untouched). The two real call
  sites in `buildBookingPayload()` pass `departureSchedule?.seatingMode === 'OPEN'` /
  `arrivalSchedule?.seatingMode === 'OPEN'` — gated on the LEG's seatingMode, not
  seat-number presence, so a mixed round trip sends prefs on the ASSIGNED leg only.
  Values are lowercased at this exact boundary (`'WINDOW'` → `'window'`, etc.) — the
  FE enum stays uppercase everywhere else.
- **Badges (OBRS-362):** new `src/app/shared/lib/seat-label.ts` (`normalizeSeatNumber`)
  — deleted the private duplicate in `passenger-seat-van.component.ts` (repointed
  `isSeatAvailable`), `passenger-seat-bus` (had none) now imports the same util, and
  the fetch/merge layer in `passenger-info-form.component.ts` uses it too. Both
  `passenger-seat-van`/`-bus` gained `@Input() seatAttributes: Record<string,
  ('WHEELCHAIR'|'EXTRA_LEGROOM')[]> | null = null` (same null-default precedent as
  `seatOwners`/`seatGenders`, OBRS-242) + `attributesFor()`/`hasWheelchairBadge()`/
  `hasExtraLegroomBadge()`, passed down to `passenger-seat-box` as
  `hasWheelchairBadge`/`hasExtraLegroomBadge` booleans. **Aria-labels are passed as
  pre-translated `@Input() wheelchairBadgeAriaLabel`/`extraLegroomBadgeAriaLabel`
  strings from the form template** (computed once via `| translate`), NOT via a
  `| translate` pipe inside van/bus/box themselves — keeps those 3 components
  TranslateModule-free (no module change, no spec breakage on their existing
  TestBeds, which don't import `TranslateModule`).
- **Badge markup** in `passenger-seat-box`: bottom-left filled circle = wheelchair
  (`accessible` icon), bottom-right = extra-legroom (`airline_seat_legroom_extra`),
  render **UNCONDITIONALLY** (no `!isDisabled` gate, unlike every other marker in
  that template), `role="img"` + the forwarded aria-label. SCSS reuses the
  `.seat-owner-badge` filled-circle recipe (`$brand-customer-strong`/
  `$text-lightblack`, `$radius-pill`) — **gotcha hit while writing the SCSS**: my
  first attempt accidentally closed `.seat-box {` one rule early, landing the new
  badge rules (and a stray extra `}`) outside the parent selector — caught by
  re-reading the file after the edit, fixed by re-nesting before running any build.
  Worth a general reminder: always re-read a `.scss` file after a multi-rule Edit
  that touches brace boundaries.
- **Legend + fetch:** legend block (`.seat-map-legend`) below each leg's seat map in
  `passenger-info-form.component.html`, gated on a new `hasSeatAttributes()` helper
  (`Object.keys(attrs).length > 0` — an empty-but-non-null `{}` from a resolved
  fetch must NOT show the legend, so this can't be a bare `*ngIf="attrs$ | async"`).
  New `ScheduleService.getSeatMap(id)` → `GET /api/schedules/{id}/seats` (public, no
  auth, already documented minus the 2 new booleans — see `docs/handoff.md` Contract
  Requests entry added this session). `seatAttributesOutbound$`/`seatAttributesReturn$`
  built via `switchMap` off `combineLatest(scheduleBooking$, isOpenSeating$)`,
  short-circuit to `of({})` for an OPEN leg or a missing schedule id (never fires the
  HTTP call), `catchError(() => of({}))`, `shareReplay(1)` — non-blocking, no
  `AlertService`, matches the task's explicit "best-effort" framing.
- **Summary:** `PassengerInfoSummaryComponent` gained `passengerInfo$` (bare
  `select(selectPassengerInfo)`, now genuinely live thanks to blocker #1's fix) and a
  new "Passengers" block in the template (name · seat chip(s) · pref chip ·
  requirement chip · a `NO_SEAT` fallback chip when neither leg has one) — reuses
  the `.seat-passenger-chip` pill class NAME from `passenger-info-form.component.scss`,
  redeclared (not shared — Angular view encapsulation scopes styles per component;
  this mirrors the existing `.open-seating-badge`/`.passenget-badge` precedent
  already noted in that file's own comments).
- **i18n:** all 16 keys (8 `FORM.*`, 5 `SEAT_MAP.*`, 3 `SUMMARY.*`) added to en/th/zh
  in one commit via a small Node script (`JSON.parse`→merge→`JSON.stringify(...,null,2)`
  round-trip) — verified the diff touched ONLY the `PASSENGER_INFO` block in each
  file (no incidental reformatting elsewhere) before committing.
- **Contract not yet confirmed:** `seatPreference`/`seatRequirement` (booking
  payload) and `isWheelchairAccessible`/`isExtraLegroom` (`SeatMapRespDto`) are not
  in `docs/api/booking.md`/`scheduling.md` as of this session (grepped, zero
  matches) — built exactly per the task brief's described contract, flagged as a
  Contract Request in `docs/handoff.md` for backend confirmation. Every one of these
  fields is optional/nullable client-side, so a name mismatch degrades silently
  (missing badges / a no-op preference field) rather than breaking booking.

**Tests:** see the frontend implementation report for this session for the exact
`ng test`/`ng build` results. New/changed spec files: `passenger-info-form.component
.spec.ts` (selectButton no-pre-selection + re-click-clears, the full
`showSeatPreferenceFields` enumeration, the `fakeAsync` loop-safe-sync pair),
`passenger-info.component.spec.ts` (AC-361.5 incl. the mixed-round-trip case),
`passenger-seat-box.component.spec.ts` / `passenger-seat-van.component.spec.ts` /
`passenger-seat-bus.component.spec.ts` (badge rendering, both-badges-at-once,
unconditional-even-when-disabled, real-DOM badge-lands-on-the-correct-seat for both
label forms).

---

## 2026-07-13 — UX spec: wire cancel-trip smart button (OBRS-283) — key findings for the implementer

**Worktree:** `OBRS-frontend-wt-obrs-283-trip-cancel-refund-ui` (branch `ao/obrs-283-trip-cancel-refund-ui`).
No code written this pass — UX/UI spec handoff. Not a new screen: one existing delete/cancel
trigger on 3 pages becomes a data-driven branch, reusing each page's own pre-existing confirm-modal
idiom verbatim. Full spec below; load-bearing findings first.

**The 3 pages use TWO different confirm-modal idioms already — do not unify them, reuse each as-is:**
1. `admin/pages/schedules/schedules-page.component.{ts,html}` — `isDeleteModalOpen` flag +
   `adminModalBackdrop` directive + `.admin-modal.admin-modal-confirm`. This shell is **app-level
   themed** in `admin-theme.scss` (`.is-dark .admin-modal` override at line 1159) — **zero new
   component-scoped SCSS needed**, dark-safe already.
2. `staff/pages/staff-schedules/staff-schedules-page.component.{ts,html}` AND
   `staff/pages/sell/sell-page.component.{ts,html}` — both use a raw Bootstrap `.modal d-block`
   with inline `style="background:rgba(0,0,0,0.5)"`, **not** the `.admin-modal` family. Grepped
   `admin-theme.scss`/`dark-theme.scss` for `.modal-content`/`.modal-header`/`.modal-footer` —
   **zero matches**. This raw-Bootstrap shell has **no dark-mode override anywhere in the
   codebase today** — pre-existing debt shared by the sibling Edit-form modal and the current
   hard-delete confirm modal already on both pages. OBRS-283 adds no new SCSS and does not worsen
   this (same shell, new text inside it) — flagged as a follow-up Jira card candidate, out of
   scope here.

**Scoping gotcha caught before spec'ing:** on `admin/schedules-page`, the delete button exists on
BOTH the Schedule-**Set** table (kind `'set'`, the recurring-generator template) and the
Schedule-**Trip** table (kind `'schedule'`, the SA's `ScheduleRespDto`). The SA's `deletable`/
`confirmedBookingCount` fields land only on `ScheduleRespDto` (trips), never on
`AdminScheduleSetDto` (sets — a set has no bookings of its own). **The smart branch applies ONLY
to Trip rows; Set rows keep their existing unconditional hard-delete, untouched.**
`ScheduleRow.deletable`/`.confirmedBookingCount` are optional fields, populated only for
`kind === 'schedule'` rows. Branch condition is **strict `=== false`** (not falsy) so a stale/
pre-deploy cached row without the field falls through to today's safe hard-delete path, never a
false-positive cancel-modal.

**CRITICAL copy fix carried from the SA: "N การจอง" not "N ผู้โดยสาร".** `confirmedBookingCount`/
`affectedBookingCount` count confirmed bookings (legs), not passengers — one booking can hold
multiple seats. Every dialog/toast string below says "การจอง N รายการ" / "N booking(s)", never a
passenger count.

**Trigger element itself is unchanged on all 3 pages** — same delete icon-button (admin/staff-
schedules-page) / same kebab "ลบตาราง" menu item (sell-page), same aria-label/translation key.
Only the click handler becomes a branch (`openDeleteOrCancelModal()`) and the resulting dialog's
title/body carries the real consequence — deliberately consistent across all 3 pages rather than
relabeling the trigger differently per page.

**New `AdminApiService.cancelSchedule(id)` method** (all 3 pages already inject
`AdminApiService` for schedule CRUD) → `POST {baseUrl}/private/schedules/${id}/cancel` →
`Observable<ResponseAPI<{ affectedBookingCount: number }>>`, mirroring the existing
`deleteSchedule(id)` shape one line above it in `admin-api.service.ts`.

**Error branching reuses the established `SCHEDULE_ERROR_*` prefix** (already used for
`SCHEDULE_ERROR_CAPACITY_EXCEEDS_TYPE_MAX`/`_CAPACITY_BELOW_OCCUPIED` in
`walk-in-center-panel.component.ts` and `VEHICLE_UNDER_MAINTENANCE` via `extractScheduleErrorCode`
in `schedules.mappers.ts`) — assumed names `SCHEDULE_ERROR_ALREADY_CANCELLED` (409),
`SCHEDULE_ERROR_ALREADY_DEPARTED` (400), `SCHEDULE_ERROR_NOT_FOUND` (404), **not yet confirmed
against a real backend `deriveErrorCode()` output** — same "built against the locked contract,
flag in `docs/handoff.md` for backend confirmation" pattern used for every other assumed-errorCode
entry in that file (OBRS-96, OBRS-110, OBRS-86). Implementer should add a `docs/handoff.md`
Contract Request entry for these 3 codes if the paired backend worktree hasn't landed them yet.

Full spec (component hierarchy, dialog copy, i18n table) is below this entry / in the parent
agent's transcript.

---

## UX/UI Specification — OBRS-283 wire cancel-trip smart button

### Scope
Not a new screen. One existing trigger + one confirm-dialog shell per page, branched on two new
read-only DTO fields (`deletable: boolean`, `confirmedBookingCount: number`) the backend adds to
`ScheduleRespDto` (admin `AdminScheduleDto`, consumed by `admin/schedules-page` trip rows AND
`staff/staff-schedules-page`) and `WalkInTripRespDto` (`WalkInTripDto`, consumed by `staff/sell-page`).

### Component hierarchy (no new components)
- `SchedulesPageComponent` (admin, smart) — adds `openDeleteOrCancelModal()`, `openCancelModal()`,
  `closeCancelModal()`, `confirmCancel()`; new state `isCancelModalOpen`, `isCancelling`; reuses
  `selectedSchedule`. Trip-row delete button's `(click)` changes from `openDeleteModal(schedule)` to
  `openDeleteOrCancelModal(schedule)`. Set-row delete button is **unchanged** (`openDeleteModal`
  directly, always hard-delete).
- `StaffSchedulesPageComponent` (staff, smart) — same method split: `openDeleteOrCancelModal(row)`,
  `openCancelModal()`, `closeCancelModal()`, `confirmCancel()`; new state `isCancelModalOpen`,
  `isCancelling`; reuses `selectedRow`.
- `SellPageComponent` (staff, smart) — `onDeleteScheduleClicked(event)` (currently opens the hard
  delete modal unconditionally) becomes the branch; new `openCancelSchedule()`,
  `closeScheduleCancel()`, `confirmCancelSchedule()`; new state `isScheduleCancelOpen`,
  `isScheduleCancelling`; reuses `deletingTrip`. `WalkInTripBrowserComponent`'s kebab menu +
  `deleteScheduleClicked` output are **unchanged** — same event, same emit site.

### Branch logic (identical shape on all 3 pages)
```
openDeleteOrCancelModal(row):
  if row.kind === 'schedule' (admin only; staff pages have no 'set' concept) AND row.deletable === false:
    openCancelModal(row)   // NEW soft-cancel + refund flow
  else:
    openDeleteModal(row)   // EXISTING hard-delete flow, unchanged
```

### Data model additions
| Type | New fields |
|---|---|
| `AdminScheduleDto` (`services/admin/admin-api.service.ts`) | `deletable?: boolean; confirmedBookingCount?: number;` |
| `ScheduleRow` (`admin/pages/schedules/schedules.mappers.ts`) | `deletable?: boolean; confirmedBookingCount?: number;` — mapped only in `toGeneratedScheduleRow()` (trip rows), left `undefined` for `toScheduleRow()` (set rows) |
| `ScheduleRow` (`staff/pages/staff-schedules/staff-schedules-page.mappers.ts`) | `deletable?: boolean; confirmedBookingCount?: number;` — mapped in `toRow()` |
| `WalkInTripDto` (`services/staff/staff-api.service.ts`) | `deletable: boolean; confirmedBookingCount: number;` (required — sell-page has no legacy pre-field cached shape to guard) |
| `AdminApiService` | new `cancelSchedule(id: number): Observable<ResponseAPI<{ affectedBookingCount: number }>>` → `POST {baseUrl}/private/schedules/${id}/cancel` |

### Confirm dialog spec (both variants, same shell per page)

**Admin (`schedules-page`) — reuses `.admin-modal.admin-modal-confirm` verbatim:**
```html
<div class="admin-modal-backdrop" *ngIf="isCancelModalOpen" adminModalBackdrop (dismiss)="closeCancelModal()">
  <div class="admin-modal admin-modal-confirm">
    <h4 class="admin-modal-title">{{ 'ADMIN.COMMON.CANCEL_TRIP_CONFIRM_TITLE' | translate }}</h4>
    <p class="admin-modal-subtitle">
      {{ (selectedSchedule?.confirmedBookingCount ?? 0) > 0
          ? ('ADMIN.COMMON.CANCEL_TRIP_REFUND_MESSAGE' | translate:{ count: selectedSchedule?.confirmedBookingCount })
          : ('ADMIN.COMMON.CANCEL_TRIP_NO_REFUND_MESSAGE' | translate) }}
      <strong *ngIf="selectedSchedule">{{ selectedSchedule.tripId }}</strong>
    </p>
    <div class="admin-modal-actions">
      <button type="button" class="admin-btn" (click)="closeCancelModal()">{{ 'ADMIN.COMMON.CANCEL' | translate }}</button>
      <button type="button" class="admin-btn admin-btn-primary" [disabled]="isCancelling" (click)="confirmCancel()">
        {{ isCancelling ? ('ADMIN.COMMON.CANCELLING_TRIP' | translate) : ('ADMIN.COMMON.CANCEL_TRIP_BTN' | translate) }}
      </button>
    </div>
  </div>
</div>
```
Button classing (`admin-btn-primary`, not `admin-btn-danger`) intentionally mirrors the **existing**
hard-delete confirm button on this exact page verbatim — not "fixing" the §4 destructive-role
mismatch as part of this card (pre-existing debt, same class already used one dialog above it).

**Staff (`staff-schedules-page` + `sell-page`) — reuses the raw `.modal d-block` shell verbatim:**
```html
<div class="modal d-block" tabindex="-1" *ngIf="isCancelModalOpen" style="background:rgba(0,0,0,0.5)">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{{ 'ADMIN.MESSAGES.CANCEL_TRIP_CONFIRM_TITLE' | translate }}</h5>
        <button class="btn-close" (click)="closeCancelModal()"></button>
      </div>
      <div class="modal-body">
        <p>{{ (selectedRow?.confirmedBookingCount ?? 0) > 0
              ? ('ADMIN.MESSAGES.CANCEL_TRIP_REFUND_BODY' | translate:{ count: selectedRow?.confirmedBookingCount })
              : ('ADMIN.MESSAGES.CANCEL_TRIP_NO_REFUND_BODY' | translate) }}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" (click)="closeCancelModal()" [disabled]="isCancelling">{{ 'STAFF.SELL.BACK_BTN' | translate }}</button>
        <button class="btn btn-danger" (click)="confirmCancel()" [disabled]="isCancelling">
          <span *ngIf="isCancelling" class="spinner-border spinner-border-sm me-1"></span>
          {{ 'ADMIN.MESSAGES.CANCEL_TRIP_BTN' | translate }}
        </button>
      </div>
    </div>
  </div>
</div>
```
`sell-page`'s variant uses `deletingTrip`/`isScheduleCancelOpen`/`isScheduleCancelling` state names
instead (same markup shape).

Severity/icon: neither shell uses a PrimeNG/SweetAlert icon prop today (both are hand-rolled
title+body dialogs) — no icon added, matching the existing hard-delete confirm precedent on both
idioms exactly (no icon there either).

### User flow
1. Staff/admin clicks the existing delete/cancel trigger on a trip row.
2. If `row.deletable === false` → the cancel-confirm dialog opens (refund or no-refund copy per
   `confirmedBookingCount`). Else → the existing hard-delete confirm dialog opens, unchanged.
3. User confirms → `POST /api/private/schedules/{id}/cancel`. Button shows its `CANCELLING_TRIP`/
   spinner busy state (mirrors `isDeleting`/`isSubmitting` precedent).
4. Success → modal closes, list refreshes (`store.refresh()` / `loadTrips()` per page — mirrors the
   existing `confirmDelete()`/`generateSchedules()` refresh-then-toast pattern), success toast keyed
   off the response's `affectedBookingCount` (`CANCEL_TRIP_SUCCESS_REFUND` if `> 0`, else
   `_NO_REFUND` — avoids a "0 การจอง" toast when nothing was actually refunded).
5. Error → modal closes (matches this page's existing error-handling shape, which already closes
   before toasting), `AlertService.error()` with the `errorCode`-mapped message; `ALREADY_CANCELLED`/
   `NOT_FOUND` additionally trigger a list refresh (the row's `deletable`/status is now stale on the
   client, next paint should show the true state) — `ALREADY_DEPARTED` does not (no state has changed).

### States
- Loading/busy: the confirm button itself (`isCancelling`/`isScheduleCancelling`) — same
  disabled+spinner/label-swap idiom as every sibling `isDeleting`/`isSubmitting` button on these
  pages. No page-level skeleton needed (this is a modal action, not a page load).
- Empty/no-op state: N/A — the dialog is only ever opened with a `selectedSchedule`/`selectedRow`/
  `deletingTrip` already set (optimistic-open precedent, no fetch-gated content in this modal).
- Error: `AlertService.error()` toast, never inline — matches every existing `confirmDelete()`/
  `submitSchedule()` catch block on all 3 pages.

### NgRx changes
None — all 3 pages hold this state as plain component fields (`isCancelModalOpen`, etc.), exactly
mirroring how `isDeleteModalOpen`/`isDeleteModalOpen`/`isScheduleDeleteOpen` already work on their
respective pages today. No store/effect/selector involved for schedules on any of the 3 pages.

### i18n keys to add
Two families, reusing the **exact** existing per-page split (admin's confirm-dialog copy already
lives in `ADMIN.COMMON.*`; both staff pages already share `ADMIN.MESSAGES.*` for the same concept
— see `DELETE_CONFIRM_TITLE` existing today in both namespaces). Success/error toast keys are a
**single shared set** under `ADMIN.MESSAGES.*`, reused verbatim by all 3 pages — mirrors how
`ADMIN.MESSAGES.DELETED`/`DELETE_FAILED` are already shared cross-module today (staff-schedules-page
and sell-page both call `ADMIN.MESSAGES.DELETED` directly, never a staff-local duplicate).

| Key | TH | EN |
|---|---|---|
| `ADMIN.COMMON.CANCEL_TRIP_CONFIRM_TITLE` (admin dialog title) | ยืนยันการยกเลิกทริป | Confirm trip cancellation |
| `ADMIN.COMMON.CANCEL_TRIP_REFUND_MESSAGE` (admin dialog body, refund variant, `{{count}}`) | การจอง {{count}} รายการจะได้รับเงินคืนอัตโนมัติ และผู้โดยสารจะได้รับการแจ้งเตือน หลังจากนั้นทริปนี้จะถูกยกเลิก ต้องการดำเนินการต่อหรือไม่? | {{count}} confirmed booking(s) will be automatically refunded and passengers notified. The trip will then be cancelled. Continue? |
| `ADMIN.COMMON.CANCEL_TRIP_NO_REFUND_MESSAGE` (admin dialog body, no-refund variant) | ทริปนี้ไม่มีการจองที่ยืนยันแล้ว ทริปจะถูกยกเลิก ไม่มีการคืนเงิน ต้องการดำเนินการต่อหรือไม่? | This trip has no confirmed bookings. The trip will be cancelled — no refund will be issued. Continue? |
| `ADMIN.COMMON.CANCEL_TRIP_BTN` (admin confirm button) | ยกเลิกทริป | Cancel trip |
| `ADMIN.COMMON.CANCELLING_TRIP` (admin confirm button busy label) | กำลังยกเลิกทริป... | Cancelling trip... |
| `ADMIN.MESSAGES.CANCEL_TRIP_CONFIRM_TITLE` (staff dialog title, both pages) | ยืนยันการยกเลิกทริป | Confirm trip cancellation |
| `ADMIN.MESSAGES.CANCEL_TRIP_REFUND_BODY` (staff dialog body, refund variant, `{{count}}`) | การจอง {{count}} รายการจะได้รับเงินคืนอัตโนมัติ และผู้โดยสารจะได้รับการแจ้งเตือน หลังจากนั้นทริปนี้จะถูกยกเลิก | {{count}} confirmed booking(s) will be automatically refunded and passengers notified. The trip will then be cancelled. |
| `ADMIN.MESSAGES.CANCEL_TRIP_NO_REFUND_BODY` (staff dialog body, no-refund variant) | ทริปนี้ไม่มีการจองที่ยืนยันแล้ว ทริปจะถูกยกเลิก ไม่มีการคืนเงิน | This trip has no confirmed bookings. The trip will be cancelled — no refund will be issued. |
| `ADMIN.MESSAGES.CANCEL_TRIP_BTN` (staff confirm button) | ยกเลิกทริป | Cancel trip |
| `ADMIN.MESSAGES.CANCEL_TRIP_SUCCESS_REFUND` (shared success toast, `affectedBookingCount > 0`, `{{count}}`) | ยกเลิกทริปสำเร็จ คืนเงินการจอง {{count}} รายการเรียบร้อยแล้ว | Trip cancelled successfully. {{count}} booking(s) refunded. |
| `ADMIN.MESSAGES.CANCEL_TRIP_SUCCESS_NO_REFUND` (shared success toast, `affectedBookingCount === 0`) | ยกเลิกทริปสำเร็จ | Trip cancelled successfully. |
| `ADMIN.MESSAGES.CANCEL_TRIP_ERROR_ALREADY_CANCELLED` (shared error toast, `errorCode SCHEDULE_ERROR_ALREADY_CANCELLED`, 409) | ทริปนี้ถูกยกเลิกไปแล้ว | This trip has already been cancelled. |
| `ADMIN.MESSAGES.CANCEL_TRIP_ERROR_DEPARTED` (shared error toast, `errorCode SCHEDULE_ERROR_ALREADY_DEPARTED`, 400) | ไม่สามารถยกเลิกทริปที่ออกเดินทางไปแล้วได้ | A trip that has already departed cannot be cancelled. |
| `ADMIN.MESSAGES.CANCEL_TRIP_ERROR_NOT_FOUND` (shared error toast, `errorCode SCHEDULE_ERROR_NOT_FOUND`, 404) | ไม่พบทริปนี้ อาจถูกลบไปแล้ว | Trip not found — it may have already been deleted. |
| `ADMIN.MESSAGES.CANCEL_TRIP_FAILED` (shared generic fallback, any other error, mirrors `DELETE_FAILED`) | ไม่สามารถยกเลิกทริปได้ | Unable to cancel the trip. |

**zh.json**: design-system §9 requires all 3 locale files land in the same commit — the implementer
adds a `zh` column for all 15 keys above (not drafted here; th/en only per this task's ask).

**Error-branching implementation note:** mirror `extractScheduleErrorCode()` (already in
`schedules.mappers.ts`, used today for `VEHICLE_UNDER_MAINTENANCE`) — branch on
`error.error.errorCode`, never the localized `message`, per §9.

### Design-system conformance
- **Reused patterns:** the exact pre-existing confirm-modal shell per page (`.admin-modal.admin-modal-confirm`
  on admin; raw Bootstrap `.modal d-block` on both staff pages) — no new dialog component/family (§6).
  Success/error surface through `AlertService.success()`/`.error()`, never `Swal.fire()` directly —
  same as every existing `confirmDelete()` on all 3 pages. Trigger element (icon button / kebab menu
  item) is byte-identical, only its handler branches — no new button, no new icon.
- **New patterns:** none. This card adds zero new controls, zero new CSS, zero new component-scoped
  SCSS — purely new i18n copy plus a data-driven branch in existing methods.
- **Confirm:** no selects involved (no form on this dialog) · exactly one primary/danger action per
  modal, unchanged from the existing hard-delete dialog's button classing on each page (§4) · zero raw
  hex added · single title surface unaffected (this is a modal, not a page) · keys added to `en`/`th`
  now, `zh` owed in the same implementation commit per §9.
- **Dark-mode:** admin variant needs **no new SCSS** — `.admin-modal` is already globally dark-themed.
  Staff variant (`staff-schedules-page`/`sell-page`) reuses a shell with **no existing dark-mode
  coverage anywhere in the codebase** (pre-existing debt, confirmed via grep — not introduced or
  worsened by this card, since no new SCSS is added and the sibling Edit/hard-delete modals on the
  same pages already have this same gap). **Recommend opening a follow-up Jira card** to add
  `:host-context(.is-dark)` (or a global `.modal-content` dark rule in `admin-theme.scss`) for the
  staff module's raw-Bootstrap modals generally — out of scope for OBRS-283 itself.

##UX_COMPLETE##

## 2026-07-11 — UX spec: End-of-day salesperson sales report (OBRS-231) — key findings for the implementer

**Worktree:** `OBRS-frontend-wt-obrs-231-eod-sales-report-fe` (branch `ao/obrs-231-eod-sales-report-fe`).
Frontend-only report page, spec'd as a near 1:1 mirror of `ReportsPageComponent` (OBRS-40) — same
`admin-page-filters` → state-card/empty-note → `admin-card` + `admin-table` skeleton, same
`AdminCollectionStore<T>` SWR-cache pattern via a new `EodSalesReportStore`. No new component split:
`ReportsPageComponent` itself is monolithic (no dumb children), so this page stays monolithic too —
row-expand state (`Set<number>` of expanded `salespersonId`s) lives directly on the page component.

**Two genuinely new patterns flagged for design-system.md §12 (neither existed anywhere in the
codebase — checked via grep before spec'ing):**
1. **Right-aligned money columns** (`.eod-report-money { text-align:right; font-variant-numeric:
   tabular-nums; }`). Reports' own Revenue column is left-aligned like every other column — rejected
   copying that verbatim because this table's whole purpose is cash-drawer reconciliation, where
   columns of numbers need to scan/sum visually, which left-aligned text defeats. New scoped class,
   no new color/token.
2. **Expandable per-row detail (byMethod breakdown).** No accordion-row precedent exists in any admin
   table (checked `route-detail-panel` — only has prev/next chevrons, not a row-expand). Built from
   two already-themed primitives, not a new control: `.admin-icon-btn` + `material-symbols-outlined`
   (`expand_more`/`expand_less`, same chevron-button shape as the pagination controls) toggles a
   sibling `<tr>` with `[attr.colspan]="6"` containing a `flex-wrap` list of method chips on
   `var(--admin-surface-soft)` (same "structural, not data" surface already used for `admin-table
   thead`). Collapsed by default per-row; state does NOT persist across a date change (resets when
   `salespersons` array changes identity).

**Grand-total emphasis deliberately does NOT use `--accent*`.** The admin shell's `--accent*`
resolves to **orange** (`theme-admin`) per the design-system §11 rubric warning — tinting the
grand-total row with accent-soft would visually collide with the table's own `:hover` state (which
already uses `--accent-soft`) and could misread as an interactive/selected row, not a static summary.
Used typography emphasis instead, composed only from existing text tokens: grand-total row gets
`var(--admin-surface-soft)` background (reuse) + `border-top: 2px solid var(--admin-outline)`
(reuse, confirmed defined in both light `#bdc8cf` and dark `#3a444b`); the grand-total Cash cell
specifically gets a new `.eod-report-grand-cash` class (font-weight 800, ~1.15rem, `color:
var(--admin-text)`) — bigger than the per-row `.admin-emphasis` (700 weight, inherited size) so it
reads as *the* number, with zero new hex/color roles.

**Sales-point-stop null handling:** when `salesPointStopLabel` is null, the secondary
`.admin-cell-stack` line is omitted entirely (`*ngIf`), not rendered as an empty/dash line — mirrors
`.admin-cell-stack` precedent in `user-management-page.component.html:90-93` (name +
`.admin-muted` secondary line), which always has a real value; hiding beats a dangling "-" under a
name.

**Method-label i18n reuses the existing dynamic-key idiom** from
`usability-reports-page.component.ts:393-396` (`categoryLabel()`/`statusLabel()`: `` `NAMESPACE.${x.toUpperCase()}` `` via `translate.instant()`), extended with an instant-echo missing-key
guard (`translated === key ? slug : translated`) for forward-compat with a payment method the backend
ships before i18n catches up — same idea, not a new pattern, just adds the fallback the precedent
didn't need.

**Route roles: `requiredRoles: ['admin', 'owner']` is a direct, unremarkable use of
`AuthGuard`'s existing `hasAnyRole(routeRoles)` array contract** (`auth.guard.ts:53-55`) — every
existing admin route only lists `['admin']` today (reports/usability-reports), so this is the first
route to add `'owner'` alongside `'admin'`, but the guard already supports N roles natively; no guard
change needed.

**Default date = today, client-local `yyyy-MM-dd`, same convention `ReportsStore` already uses for
its default 7-day range** (`ReportsStore.toDateInputValue(new Date())`) — the store does NOT attempt
its own Asia/Bangkok conversion client-side; the response's own `timezone` field confirms server-side
bucketing, matching how Reports already defers all TZ math to the backend.

Full spec (routes, DTOs, table/column contract, i18n table) is below this entry / in the parent
agent's transcript.
## 2026-07-11 — Frontend fix: OBRS-238 customer online booking blocked, missing email field on booker-info-form

**Root cause was confirmed before this session started (backend `BookingReqDtoValidator.java:35-39`,
correct, untouched): ONLINE `bookingChannel` requires a non-blank `contact.email`, but
`BookerInfoFormComponent` (customer booker form) had no email input at all, so every customer
online booking sent `contact.email=null` and 400'd. This was blocking ALL customer online
bookings** — a P0-shaped defect despite the small diff.

**Fix, FE-only, 8 files, +101 lines:**
- `booker-info-form.component.ts`: new `email: ['', [Validators.required, Validators.email]]`
  control, same pattern as the existing `phoneNumber` control (required + format validator).
  `buildBookerPayload()` now includes `email: raw.email` in the returned `PassengerInfo`.
- `booker-info-form.component.html`: new email field inserted right after Phone Number (it was
  alone in its `col-12 col-md-6` row, so email is its natural row-mate before the Gender/status
  section) — same label/input/two-error-div markup shape as every sibling field, `type="email"`,
  `autocomplete="email"`.
- `passenger-info.interface.ts`: added optional `email?: string` to `PassengerInfo` (booker-only
  in practice; per-passenger rows never set it).
- `passenger-info.component.ts`: `buildContactPayload()` now sets `email: (booker?.email ??
  '').trim() || null` on the outgoing `contact`. **Load-bearing wiring**: this is the one line
  that gets the value from the form into `BookingPayload.contact.email` on `POST
  /api/private/bookings`. `BookingContact.email?: string | null` already existed in
  `booking.interface.ts` — unused until now (found by grepping for `email` before writing
  anything new, per the DRY gate).
- i18n: `PASSENGER_INFO.FORM.EMAIL` / `EMAIL_PLACEHOLDER` / `EMAIL_REQUIRED` / `EMAIL_INVALID`
  added to en/th/zh (all three, same commit).
- Spec: `validBooker` fixture gained `email`, plus 2 new tests (`returns null when email is
  missing`, `returns null when email format is invalid`) and an assertion in the existing
  "valid form" test that `result?.email` round-trips.

**Deliberately did NOT reuse the staff walk-in-checkout email field verbatim** — that one
(`walk-in-checkout.component.ts`, OBRS-197) is intentionally OPTIONAL
(`[Validators.email]` only, no `required`) because the offline/walk-in channel's proof of
purchase is the printed receipt, not an e-ticket email. The customer/online path is the
opposite: `required` is the whole point of this fix. Same field shape, different validator set
— correctly NOT shared as one component since the two channels have genuinely different
requiredness, not just a cosmetic difference.

**Did NOT add pre-fill from a logged-in customer's account email** — no trivial existing hook
found (`grep` for `currentUser`/`getCurrentUser`/`selectUser` under `modules/passenger-info`
returned nothing), and the task explicitly said keep it simple / don't over-engineer this.
Every sibling booker field (firstName/lastName/phone) also starts blank for a logged-in
customer today, so this isn't a regression — just flagging it as a real "nice-to-have" gap for
whoever picks up a follow-up card.

**Test results:** `ng test --watch=false --browsers=ChromeHeadless` → **1435/1435 SUCCESS**.
`ng build --configuration production` → clean, no new budget warnings (initial chunk 1.51 MB;
the only build-time warning was a pre-existing `.form-floating>~label` selector warning,
unrelated to this change).

**Worktree:** `OBRS-frontend-wt-obrs-238-customer-booking-email` (branch
`sit/obrs-238-customer-booking-email`, off `origin/dev`; had no `node_modules` at session
start — `npm install` (1005 packages) was run first). Commit `42fa0a9`.

## 2026-07-11 — QA RE-RUN: OBRS-100 manifest export + print — PASSED (all previously-blocked items now verified)

SIT login recovered (coordinator confirmed `POST /api/auth/login` → 200). Re-ran only the items
blocked in the prior pass below (Tier 1 #2/#3/#5/#6/#7 + Tier 2) — did NOT repeat unit tests
(1150/1150, unchanged) or the print-isolation regression (already proven via print-media emulation).
Served the worktree at `ng serve --configuration sit --port 4430`, live against SIT.

**#2/#3 Print flow, both mounts — PASSED.** Salesperson (`/staff/boarding/13`, 1 confirmed
passenger) and driver (`/staff/boarding/1`, `driver@system.local`, 8 confirmed passengers) both
render a print preview containing ONLY the manifest — no app chrome at all (confirmed visually,
`21-driver-mount-print-preview.png`). Header shows real data: route slug, Bangkok-localized
departure (`20 ธ.ค. 2026 15:00`), real vehicle plate (`กข 1234`), real driver name (`Mr. Driver
Wheeler`) on schedule 1; on schedule 13 (no vehicle/driver assigned in SIT seed data) those two
fields correctly degrade to `-` while route/departure still populate — genuine per-field grace,
not a full-header failure. **Gotcha caught while testing, not a product bug:** the header self-fetch
(`GET /api/private/schedules/{id}`) takes ~3.2s against live SIT, independent of the boarding-list
fetch that clears the skeleton state — a test script (or an unusually fast human) that clicks Print
immediately after the table skeleton clears can catch `tripHeader` still `null`, showing "-" for
ALL four header fields (looks identical to a real degrade). Confirmed by waiting longer that real
data then populates correctly. Not blocking, but worth a note for whoever writes the Playwright
regression suite for this later: add a short settle wait (or better, an explicit loading indicator
tied to `tripHeader`) before asserting header content.

**#5 Leak check — PASSED.** Printed twice in a row without navigating: exactly 1
`.boarding-manifest-print-portal` node throughout (the `disposePrintPortal()` idempotent-guard at
the top of `printManifest()` works as designed). Navigated away (`/staff/schedules`) while the
portal was still live (simulating "operator closes the tab/navigates with the print
dialog open"): portal count → 0, `body.boarding-manifest-printing` → false immediately after
navigation — `ngOnDestroy`'s `disposePrintPortal()` call covers it, no leak.

**#6 i18n — PASSED.** Toolbar text confirmed in all 3 locales, live in-app switch via the navbar
lang menu (`.navbar-lang-trigger` / `.navbar-lang-item`): TH `พิมพ์` / `ส่งออกข้อมูล`, EN `Print` /
`Export`, ZH `打印` / `导出`. Zero raw `STAFF.BOARDING.PRINT*`/`COMMON.EXPORT*` key leaks in any
locale. Cold load also confirmed (`localStorage.app_language='en'` + reload → toolbar renders in
English immediately, no FOUC of raw keys).

**#7 Theme — PASSED.** Note: the staff/admin shell does NOT use the public `app-theme-toggle`
component — its own toggle lives at `.admin-topbar-actions button.admin-icon-btn`
(`toggleTheme()` in `staff-layout.component.ts`, driven by `.admin-shell.is-dark`). Both Print and
Export buttons theme correctly light↔dark (screenshots `50-theme-dark-toolbar.png` /
`51-theme-light-toolbar.png`) — outlined `.admin-btn` styling holds up in both, no invisible-text
or contrast issues.

**Tier 2 — both PASSED.** Board/unboard regression (OBRS-130, unaffected by the new toolbar):
clicked Board → row flips to "ขึ้นรถแล้ว" (Boarded) with a live timestamp + `บันทึกโดย:
salesperson@system.local` audit line; clicked Unboard → SweetAlert2 confirm → row reverts cleanly
to "ยังไม่ขึ้นรถ" (Not boarded). Empty schedule (found via a direct API scan for `soldPaidCount:0` —
scheduleId 2, route `bangkok_chonburi`, 2026-12-20): on-screen empty state renders, Print still
works with header `Seats sold: 0 / Boarded: 0/0`, zero print-table rows, no `pageerror` — matches
spec exactly.

**Tier 3 (export CSV/XLSX download) — SKIPPED, as pre-authorized.** The backend endpoint isn't
deployed to SIT yet (ships at merge); standing up the BE worktree locally was out of this
time-box. Residual risk is the live wiring only — the export button itself is the same
`app-export-button` proven verbatim by OBRS-101, and the backend has its own unit+IT coverage.
Defer to post-merge SIT smoke.

**Evidence captured** (QA agent's scratchpad, `shots2/` — not committed to either repo):
`10-boarding-tab-toolbar-light.png`, `11-print-preview-manifest.png` (sell-mount AFTER), 
`20-driver-mount-toolbar-light.png`, `21-driver-mount-print-preview.png` (driver-mount AFTER, the
clearest full-data manifest capture), `30-empty-schedule-boarding-tab.png`, `40/41/42-i18n-*.png`,
`50/51-theme-*-toolbar.png`, `60-board-unboard-final.png`.

**Overall verdict: PASSED.** Combined with the prior pass's unit-test (1150/1150) and
print-isolation-regression results, all Tier 1 items now confirmed. Recommend proceeding to merge.

## 2026-07-11 — QA: OBRS-100 manifest export + print — BLOCKED (SIT-wide login outage, not a code defect)

**Verdict: FAILED / BLOCKED** — verify-only pass, no merge performed (per QA scope; this file's
edits and the branch itself are untouched by this QA pass). Root cause of the block is a live SIT
infrastructure outage, confirmed NOT specific to this branch or account.

**What DID verify clean, no issues found:**
1. Full `ng test --watch=false --browsers ChromeHeadless` on the worktree AS-IS (commit `76cedc5`
   + the uncommitted scrutinize self-fix to `boarding-list.component.ts`/`admin-theme.scss`/its
   spec) — **1150/1150 SUCCESS, exit code 0.** Confirms the self-fix landed clean.
2. **The critical regression check (self-fix's whole reason for existing) — verified WITHOUT
   needing login**, via a deliberate workaround: `admin-theme.scss` (which carries the `@media
   print` gate) is imported globally in `src/styles.scss`, so the gate is live on every route
   including public ones. Served the worktree against SIT (`ng serve --configuration sit --port
   4431`, after copying `environment.local.ts` from the main clone — this worktree was missing
   that gitignored file, a one-time local setup gap, not a code issue) and used Playwright's
   `page.emulateMedia({media:'print'})` on `/login`, `/home`, `/register` (all public, no auth).
   Confirmed on all three: `document.body` never carries the `boarding-manifest-printing` marker
   class, and `<app-root>`'s computed `display` stays `inline` (never `none`) under print media —
   i.e. a native Ctrl+P on any ordinary page renders normally, NOT blank. Screenshot evidence:
   `regress-01-print-media-login.png`, `regress-02-print-media-home.png`,
   `regress-02-print-media-register.png` (QA agent's scratchpad, not committed). **This is the
   single most important manual check per the QA brief and it passed.**
3. Supplementary, unauthenticated spot-check on `/login`: dark-theme toggle applies correctly
   (screenshot `theme-dark-login.png`), zero raw `XXX.YYY`-shaped i18n keys leaked in body text.

**What could NOT be verified — blocked, not skipped:** Tier-1 items 2/3/5/6/7 (the actual print
dialog + trip-header content on `/staff/sell` Boarding tab and the driver mount, the print-twice/
navigate-away portal-leak check, i18n of the `STAFF.BOARDING.PRINT*`/`COMMON.EXPORT.*` keys
in-context, and light/dark theming of the toolbar buttons themselves) — ALL require an
authenticated staff/driver session, and **every login attempt against SIT
(`https://sit-obrs-backend.koyeb.app/api/auth/login`) returned a hard 500** (`errorCode:
UNEXPECTED_ERROR`) across repeated attempts (in-browser as `salesperson@system.local`, and via
direct `curl`, and with a second account `customer@system.local` — same 500 for every account,
ruling out a credential/account-specific issue). `GET /api/private/schedules` correctly 401s
(reachable, auth-gated as expected) and the root path 404s normally, so the backend process itself
is up — the failure is scoped specifically to the login/auth path, consistent with the known
`sit-login-500-recovery-order` pattern (DB connection-pool exhaustion; documented fix is restarting
Supabase first, then the Koyeb app). This QA session has no tooling/dashboard access to perform
that infra restart and it would affect every other concurrent SIT-dependent session — flagging for
the user/an ops-authorized session rather than acting on shared infra unilaterally. Tier 2, Tier 3,
and the export-endpoint curl check were not attempted (same login blocker cascades to all of them;
also moot for Tier 3 since it needs a bearer token from the same broken login).

**Re-run recipe once SIT login is healthy again:** the FE worktree serves cleanly against SIT on
an alt port (`ng serve --configuration sit --port <free-port>`, CORS reflects any localhost origin
per `sit-cors-any-localhost-origin` memory) — just needs `src/environments/environment.local.ts`
copied in first (gitignored, missing in this worktree; copy from the main `OBRS-frontend` clone).
Login selectors: `#email` / `#password` / `button.login-btn[type="submit"]` on `/login`.

## 2026-07-11 — IMPLEMENTED: OBRS-100 passenger manifest export + print

Built exactly to the spec below (both entries) — no deviations from the reviewed
design. Summary of what landed, for whoever reviews/QAs this next:

**Export**: `<app-export-button datasetKey="boarding-manifest" requiredRole="driver"
[params]="{ scheduleId: String(scheduleId) }">` added to
`boarding-list.component.html`'s new toolbar row. `protected readonly String = String;`
added to the component so the template can call `String(scheduleId)` (Angular templates
don't resolve bare globals otherwise). Zero changes to `ExportButtonComponent` itself.

**Print**: `printManifest()` on `BoardingListComponent` builds a `TemplatePortal(this
.printTemplate, this.viewContainerRef)` and attaches it via a `DomPortalOutlet` to a
`<div class="boarding-manifest-print-portal">` appended to `document.body`, then
`setTimeout(() => window.print(), 0)`. Teardown (`disposePrintPortal()`) is idempotent
and called from both the `afterprint` listener and `ngOnDestroy` — the scrutinize-flagged
leak case (navigate away mid-print-dialog) is covered. Global CSS in `admin-theme.scss`
(`.boarding-manifest-print-portal { display:none }` + the `@media print` reveal rule) —
exactly the two rules the spec called for. Full rationale in
`docs/adr/0015-boarding-manifest-print-isolation.md`. Also added a short "new pattern"
entry to `docs/design-system.md` §10 per its own §12 rule (CDK Portal is genuinely new
here — first usage in the app).

**Header self-fetch**: `StaffApiService.getScheduleById(id)` added (type-only imports
`AdminScheduleDto` from `admin-api.service.ts`, same precedent as the existing `DriverDto`
import) — a deliberate **second call site** for `GET /api/private/schedules/{id}`
alongside `AdminApiService.getScheduleById()`, to keep `shared/` decoupled from admin-
domain-named services. `BoardingListComponent.loadTripHeader()` is stale-guarded
(`headerRequestScheduleId`) and degrades `tripHeader` to `null` on any failure — the
template falls back to `'-'` per field either way. Route label falls back to
`route?.code ?? route?.slug` (not a locale-resolved translation) — deliberately did
**not** import `getAdminLookupLabel()` from `admin-api.service.ts` even though it exists,
because that would be a *runtime* (value) import into a `shared/` component, which is
exactly the coupling this ADR's Decision 3 avoids. If a translated route name is wanted
later here, it needs its own home (e.g. promoted into `shared/lib/`), not a reach into
`admin-api.service.ts`.

**Constructor change**: `BoardingListComponent` now takes a 6th constructor param,
`ViewContainerRef` (needed for the `TemplatePortal`). Updated the existing
`boarding-list.component.spec.ts`'s `createComponent()` helper (which instantiates the
component directly with `new`, not via TestBed) to pass a stub 6th arg. Added one NEW
`describe` block in that same spec file that — unlike every other block there — renders
the component via `TestBed.createComponent()` with `NO_ERRORS_SCHEMA`, because
`printManifest()`'s CDK Portal round-trip needs a **real** `ViewContainerRef` and a real
`#printTemplate` resolved by Angular's view-init; neither exists on a bare `new
BoardingListComponent(...)`. That suite exercises the actual DOM attach/detach against
real Chrome (Karma), not a mock.

Tests: `ng test` — 1149/1149 passing (up from 1142 pre-change; net +7 after accounting
for the pre-existing suite plus new describe blocks for `boardedCount`, `loadTripHeader`
success/degrade/stale-guard, the print-portal lifecycle, and `StaffApiService
.getScheduleById()`). `ng build --configuration production` — clean, no budget warnings
(initial chunk unchanged at 1.50 MB, right at but not over the 1.5 MB warning threshold —
this addition contributed negligible bytes since it reuses `app-export-button`/`.admin-btn`
verbatim).

**Left for QA / integration**: the backend `/api/private/exports/boarding-manifest`
endpoint was being built in parallel and wasn't live at implementation time — FE was
built and unit-tested strictly against the contract in the card (datasetKey, params
shape, `ResponseAPI` envelope assumptions already proven by the existing
`ExportButtonComponent`/`ExportService`, unchanged here). No live-browser screenshot was
taken for this pass (no full E2E login/backend round-trip attempted) — the two new
buttons reuse only pre-existing, already-themed classes (`.admin-btn`,
`.material-symbols-outlined`) with zero new custom CSS on the buttons themselves, so
light/dark theme risk is low, but QA should still eyeball both mounts
(`/staff/boarding/:scheduleId` and Sell Tab-3) in both themes before sign-off.

## 2026-07-11 — UX spec REVISION: OBRS-100 print isolation + header sourcing (post-Scrutinize)

Scrutinize traced the first-pass spec (below) against the real components and found the
export-button reuse, `requiredRole="driver"` role gate, and i18n plan sound — kept unchanged.
Two architectural pieces got revised; both are corrected in the spec text below this entry, not
duplicated here — summary of *why* each changed, for whoever reads this before the older entry:

1. **Print isolation is no longer a shell-scoped `visibility:hidden` + absolute-reposition
   rule.** It broke for two reasons Scrutinize named: the reveal selector omitted the print
   area's own descendants, and an absolutely-positioned reveal is fragile under the sell mount's
   `p-tabView`/grid ancestors (any `position`/`overflow`/`transform` on an ancestor clips or
   offsets it) — plus body-appended overlays (`p-menu[appendTo="body"]`, SweetAlert2's
   `.swal2-container`) aren't inside `.admin-shell` at all and would bleed through un-hidden.
   **New approach:** CDK Portal (`DomPortalOutlet` + `TemplatePortal`, `@angular/cdk` already a
   dependency at ~18.2.14, confirmed zero existing Portal usage anywhere in `src/` — this is the
   first) teleports a dedicated `ng-template` to a `<div>` appended directly to `document.body`,
   so the print DOM's only ancestor is `<body>` regardless of which mount triggered it. `@media
   print { body > *:not(.boarding-manifest-print-portal) { display:none !important } }` hides
   every other body child (including any stray overlay) and shows only the portal. This is now
   the ADR-0015 pattern.
2. **`tripHeader` is no longer threaded through the hosts as an `@Input()`.** Two problems: it
   breaks `BoardingListComponent`'s documented self-sufficiency contract (ADR 0014: hosts pass
   only `[scheduleId]`), and the sell mount genuinely cannot build a *complete* header —
   `WalkInTripDto` has `driverName`/`licensePlate`/`departureDateTime` but no route name (route is
   a slug two levels up, on `SellPageComponent.routeGroups`/`selectedRouteSlug`) — so the two
   mounts would produce two different completeness levels for the same shared component's header.
   **Fix:** `BoardingListComponent` self-fetches its own header in `ngOnChanges` (alongside the
   existing `store.setScheduleId()`/`refresh()`), via a **new `StaffApiService.getScheduleById()`**
   method — deliberately NOT reusing `AdminApiService.getScheduleById()` (which
   `walk-in-center-panel.component.ts:289` already calls, so the endpoint/precedent exists) to
   avoid a `shared/` component taking a runtime dependency on an admin-domain-named service;
   `BoardingListComponent`'s collaborator set stays exactly what ADR 0014 already documents
   (`StaffApiService`/`AuthService`/`AlertService`/`TranslateService`). Both hosts revert to
   **exactly today's contract**, `[scheduleId]` only — the previously-planned
   `BoardingListPageComponent` extension (calling `getScheduleById` itself) is removed; that fetch
   now lives inside `BoardingListComponent`, so both mounts get it automatically.

Everything else (export param stringification `[params]="{ scheduleId: String(scheduleId) }"`,
the graceful degrade-to-`-` on a header-fetch failure, the driver-auth-on-`getScheduleById` flag
for backend to confirm, the i18n table) is unchanged from the first pass.

## 2026-07-11 — UX spec: passenger manifest export (CSV/XLSX) + print (OBRS-100) — key findings for the implementer

**Worktree:** `OBRS-frontend-wt-obrs-100-manifest-export` (branch `ao/obrs-100-manifest-export`,
off `origin/dev`, 2 commits behind — includes OBRS-130's shared `<app-boarding-list>`). No code
written this pass — UX/UI spec handoff. Full spec is in the OBRS-100 ticket thread / the parent
agent's transcript; load-bearing findings below.

**Export needs ZERO new component — `app-export-button` + `ExportService` already exist and were
built exactly for this (OBRS-101, ADR 0001) but have NO consumer yet** (`grep -rn
"app-export-button" src/app --include=*.html` returned nothing). `datasetKey="boarding-manifest"`,
`requiredRole="driver"` (lowest role in `AuthService.ROLE_GRANTS` that all of
driver/salesperson/owner/admin's expanded grant-sets contain — verified by reading
`hasAnyRole()`), `[params]="{ scheduleId: String(scheduleId) }"` computed as a getter INSIDE
`BoardingListComponent` itself (it already has `@Input() scheduleId`) — so the export half needs
**no new `@Input()` and no host-component changes at all**. `COMMON.EXPORT.*` i18n keys (button
label, CSV/XLSX, error codes incl. a reserved-but-unwired `SUCCESS`) already exist in all 3
locales — reuse verbatim, do not duplicate.

**Print is a genuinely new pattern for this codebase — no `window.print()` call exists anywhere
in `src/`.** The two existing `@media print` rules (`e-ticket.component.scss`,
`e-ticket-card.component.scss`) only resize a logo — `/e-ticket` is a standalone top-level route
with no shell chrome around it, so it never needed content isolation. `<app-boarding-list>`'s two
mounts both sit inside `.admin-shell.theme-staff` (`staff-layout.component.html` — sidebar +
topbar), and the Sell-tab mount additionally has a trip-browser sidebar + checkout column as
siblings — `window.print()` would print all of that unless isolated. Spec'd the classic
"hide the shell, reveal one marker" CSS trick, scoped to `.theme-staff` only so it can't affect a
future admin-shell print feature or `/e-ticket`:
```scss
@media print {
  .admin-shell.theme-staff * { visibility: hidden; }
  .admin-shell.theme-staff .boarding-manifest-print-area,
  .admin-shell.theme-staff .boarding-manifest-print-area * { visibility: visible; }
  .admin-shell.theme-staff .boarding-manifest-print-area { position: absolute; inset: 0; width: 100%; }
}
```
Home for this: `admin-theme.scss` (where `.admin-shell`/theme variants already live), not a
component-scoped style — Angular view encapsulation can't reach the sibling shell chrome from
inside `boarding-list.component.scss`. Recommended writing this up as a new ADR (`docs/adr/0015-
boarding-manifest-print-isolation.md`) since it's the first "print only this one element of a
chromed page" pattern in the app and the next print feature should reuse the marker-class idiom,
not reinvent it.

**Driver-page trip header is a real gap, not a given — flagged explicitly rather than assumed
away.** `BoardingListPageComponent` (the driver-route thin wrapper, ADR 0014 Decision 4: "does
nothing else" but read `scheduleId`) currently holds NO route/vehicle/driver/departure data — the
print trip-header (Route/Departure/Vehicle/Driver/Seats sold/Boarded) needs it. Two existing driver-
accessible endpoints were checked: `StaffApiService.getMySchedules()` (`GET
/private/schedules?assignedToMe=true`, confirmed driver-scoped, used by `driver-schedules-page`)
and `AdminApiService.getScheduleById(id)` (`GET /private/schedules/{id}`, currently only called
from the admin module). Spec calls for extending the driver-page wrapper to call
`getScheduleById(scheduleId)` (id-scoped, matches the "a driver only sees their own schedule"
backend rule already stated for `getBoardingList`) rather than `getMySchedules()` + client-side
find (which would wrongly return nothing for a salesperson/owner/admin who navigates to
`/staff/boarding/:id` directly, since `assignedToMe` is driver-identity-scoped). **This is an
assumption an implementer/backend must confirm**: that `GET /private/schedules/{id}` already
403s a non-owning driver the same way `getBoardingList` does. If it doesn't, print/export must
still not be blocked — spec says degrade gracefully (header fields show `-`, Seats sold/Boarded
still compute correctly from `items` already in the store) rather than gate the buttons on this
fetch succeeding.

**Sell-page (Tab 3) DOES already have everything needed, confirmed by reading state, not
assumed:** `SellPageComponent.routeGroups: WalkInRouteGroupDto[]` + `selectedRouteSlug` give
`routeLabel` (route grouping isn't inside `WalkInTripDto` itself); `selectedTrip: WalkInTripDto`
gives `licensePlate`/`driverName`/`departureDateTime`. Spec threads one new `tripHeader` object
two hops deep (`SellPageComponent` → `WalkInCenterPanelComponent` (new optional `@Input()`) →
`BoardingListComponent` (new optional `@Input()`, null-default per design-system §10)) — same
existing prop-drilling shape this component already uses for `pickupOptions`/`dropoffOptions`
etc., not a new pattern.

**Seats-sold / Boarded counts do NOT belong on the header input** — both are directly derivable
from `items` already inside `BoardingListComponent` (`items.length` = seats sold, since each row
is a sold seat; `items.filter(isBoarded).length` = boarded count). Only
`{routeLabel, departureDateTime, vehicleLabel, driverName}` needs to come from the host.

**i18n:** only 7 new keys needed under `STAFF.BOARDING.*` (`PRINT_BTN` + a `PRINT_HEADER.*`
sub-object: `TITLE`/`ROUTE`/`DEPARTURE`/`VEHICLE`/`DRIVER`/`SEATS_SOLD`) — reuse the existing
`STAFF.BOARDING.BOARDED` key verbatim for the header's "Boarded: n/total" line (same word, same
meaning as the existing status-pill label). All `COMMON.EXPORT.*` keys are reused unchanged. Full
TH/EN/ZH table is in the spec.

**Access-model gate confirmed clean**: this card touches no `ROLE_GRANTS`/`PORTAL_ONLY_ROLES`/
`canAccessCustomerArea`/`getHomeRoute`/`auth.guard.ts` — no access-model ADR needed, per the task
brief.

## 2026-07-10 — QA: OBRS-84 verified login-email change — PASSED (verify only, not merged)

Worktree `wt-obrs-84-email-change` @ `9938fde`. Full report + evidence recipe lives in the backend
worktree's `AGENT_MEMORY.md` (same date) since the live click-through needed both repos running
together. Summary from the FE side:

- `/account` page + `app-change-email-dialog` (`src/app/modules/account/`) render correctly in
  Thai (seeded users' default locale), light AND dark, zero raw i18n-key leaks: empty form,
  wrong-password inline error (session stays authenticated — navbar avatar still shown, no
  logout), same-email inline error, "sent" confirmation state.
- `/change-email/confirm` (`src/app/modules/change-email-confirm/`) all three states captured live
  against a real local backend: `success` (green check, new email shown, redirects to
  `/login?reason=email-changed`), `invalid` (neutral gray info icon — confirmed NOT red, correct
  per the deliberate design choice in the component's own comment), `targetTaken` (red error icon,
  distinct from `invalid`).
- `/login?reason=email-changed&email=...` banner renders and prefills the email field correctly.
- Selector note for future Playwright work on this dialog: it's NOT `getByRole('button', {name:
  /change email/i})` when default locale is Thai — use `.account-card button.btn-primary` /
  `#change-email-current-password` / `#change-email-new-email` /
  `.change-email-modal button[type="submit"]` (real DOM ids from the template, locale-independent).
- Auth bypass for capture: `localStorage` keys `auth_token`/`auth_username`/`auth_roles` (JSON
  array) skip the login UI; `app_admin_theme` = `'light'|'dark'` (class `is-dark` on `body`) drives
  theme. `app_language` did NOT switch the rendered language within this session's time-box despite
  being the same key/pattern that worked in the OBRS-129 QA pass — flagged in the backend note as a
  possible follow-up, not re-investigated here.
- CORS gotcha: local backend `dev` profile is single-origin (`application-dev.yml` hardcodes
  `app.frontend-url: http://localhost:4200`), unlike SIT which wildcards `localhost:*` — serve the
  FE on exactly 4200 when pointing at a local backend, or override `APP_FRONTEND_URL` env on the
  backend to match.

Screenshots are in the QA agent's scratchpad, not committed to either repo.
## 2026-07-10 — Follow-up fold-in: hide checkout / widen center on non-Ticket-Sales tabs (product-owner review)

Small behavior-preserving addition to OBRS-130, folded into the same branch/commit series
after the main boarding-management work above was already implemented and committed. The
boarding manifest was landing in a squeezed `col-xl-5` center column with a dead-space
`col-xl-4` checkout column next to it on the Trip Details/Boarding tabs — reclaimed that
space.

- **`WalkInCenterPanelComponent.activeTabChange` (new `@Output<number>`)** — emits the tab
  index on every `onTabChange()` call, AND once from a new `ngOnInit()` (component didn't
  implement `OnInit` before) so the parent starts at a known index-0 state without waiting
  for a user click.
- **Reset mechanism chosen: sell-page resets `activeTabIndex = 0` itself at every point
  it already resets `selectedTrip`** (`onDateChanged`, `onTripSelected`, the post-sale
  success handler in `onSell`, and the optimistic branch in `confirmDeleteSchedule`) —
  NOT relying on the child re-emitting 0 on remount. Reasoning: `WalkInCenterPanelComponent`
  itself is never destroyed/recreated (only its inner `p-tabView`, which is
  `*ngIf="selectedTrip"`, toggles) — so `ngOnInit` fires exactly once for the component's
  whole lifetime, not on every trip reselection. Coordinating "did the tabview just
  remount" from inside `ngOnChanges` would require inferring PrimeNG's internal
  activeIndex-reset behavior; driving it explicitly from the same call sites that already
  reset every other per-trip UI state (`selectedSeats`, `seatPassengerTypes`,
  `idempotencyKey`) is simpler and matches the existing pattern exactly. The child's
  `ngOnInit` emit is kept too (per the literal spec ask) — harmless no-op since the parent
  already defaults to 0.
- **Deliberately did NOT reset `activeTabIndex`** in `onTripDetailsUpdated()` (the
  `this.selectedTrip = {...this.selectedTrip, ...event.patch}` merge after a Trip-Details
  save) — the user is actively on the Trip Details tab when that fires; resetting would
  bounce them back to Ticket Sales right after their own save, a regression, not a fix.
- **Layout**: center column `col-lg-5 col-md-12` (unchanged breakpoints) with
  `[class.col-xl-5]="activeTabIndex === 0"` / `[class.col-xl-9]="activeTabIndex !== 0"`;
  checkout column gets `*ngIf="activeTabIndex === 0"`. On Ticket Sales (default, index 0)
  the DOM is byte-identical to before this change — same classes, same visibility.
- Tests added: `sell-page.component.spec.ts` (4 new assertions on `activeTabIndex` at the
  same 4 reset call sites) and `walk-in-center-panel.component.spec.ts` (new
  `activeTabChange output` describe: initial emit-once-on-init via a fresh
  `TestBed.createComponent`, and emits-per-`onTabChange()` call).
- `ng test`: 1057 passing (was 1053; +4 new). `ng build --configuration production`:
  initial bundle 1.48 MB (unchanged budget headroom), staff-module lazy chunk +0.5 kB.

## 2026-07-10 — Frontend implementation notes: OBRS-130 staff pre-departure boarding management

Implemented per the UX spec above. A few decisions made while building that the next
reader (Scrutinize/QA) should know:

- **`BoardingListStore` moved**, not just re-decorated: from
  `modules/staff/pages/boarding-list/boarding-list.store.ts` to
  `shared/components/boarding-list/boarding-list.store.ts`. The spec said "put
  `providers: [BoardingListStore]` on this component" but didn't say to relocate the file;
  moved it anyway so the shared component doesn't reach backward into a feature module's
  page folder for its own store — keeps the dependency direction (`modules/*` → `shared/*`,
  never the reverse) intact per `CLAUDE.md` §3's layer rules.
- **Backend contract for `board`/`unboard` + `boardedBy`/`boardedByName` does NOT exist yet**
  in the paired `OBRS-backend-wt-obrs-130-boarding` worktree at time of writing (`TicketController`
  only has `check-in`/`boarding-token`/`boarding-scan`; `BoardingListItemResponse` has no
  `boardedBy`/`boardedByName`). Built against the locked UX spec anyway — same parallel-lane
  pattern as OBRS-96/OBRS-129 (see `docs/handoff.md` Contract Requests, new OBRS-130 entry
  added this pass). **Do not merge to `dev`/`sit` until the backend lands both.**
- **Board-button row action is NOT `.admin-btn-primary`.** Considered it (staff shell is
  themed via `.admin-shell.theme-staff`), but rejected: design-system §4's "one primary
  button per screen" reads oddly if reused N times per row in a table. Used plain
  `.admin-btn.admin-btn-small` instead — this also closes the boarding-list entry in the
  §13 "still open: non-admin `btn-primary`" consolidation-debt list (removed that surface
  from the still-open bullet, added a "closed" note).
- **`getUsername()` self-seeding applies to BOTH optimistic paths** (the Board button AND
  the scan-success handler), not just the Board button as the literal spec wording
  ("the OPTIMISTIC board YOU just clicked") could be read narrowly. Reasoning: a manual
  scan is equally "an action the current operator just performed" — same non-misattribution
  argument applies (only ever seeded onto the one row just acted on, never a pre-existing
  boarded row). Flagging in case Scrutinize reads the spec more narrowly.
- **`checkIn()` fully retired**: method removed from `staff-api.service.ts` (confirmed via
  grep — no other frontend consumer), its spec test replaced with `board()`/`unboard()`
  tests, and the now-dead `STAFF.BOARDING.CHECKED_IN`/`CHECK_IN_BTN`/
  `STAFF.MESSAGES.CHECK_IN_SUCCESS`/`CHECK_IN_FAILED` i18n keys removed from all three
  locale files. The ticket-status `Status` column is unchanged (still reads
  `item.status.label`/`item.status.code === 'checked_in'` inline) — only the *boarding*
  signal moved off status.
- **ADR**: `docs/adr/0014-boarding-list-shared-component-dual-mount.md` covers the
  self-sufficient dual-mount pattern, the store-scoping trade-off (loses cross-nav SWR
  replay, a deliberate trade for live data), the single-owner `ngOnChanges` re-bind
  contract, and the hidden-not-disabled Un-board gating.

## 2026-07-10 — UX spec: staff pre-departure boarding management (OBRS-130) — key findings for the implementer

## 2026-07-10 — UX spec: staff pre-departure boarding management (OBRS-130) — key findings for the implementer

**Worktree:** `OBRS-frontend-wt-obrs-130-boarding` (branch `ao/obrs-130-boarding`, off `dev`).
No code written this pass — this is the UX/UI spec handoff. Full spec is in the OBRS-130
ticket thread / the parent agent's transcript; load-bearing findings below.

**Core extraction: `BoardingListPageComponent`'s current template/logic becomes a new shared
`<app-boarding-list [scheduleId]>` component, mounted in two places — the driver route
(thin wrapper, behavior-identical) and `walk-in-center-panel` Tab 3 (inline, no navigation,
replacing the current hint+link-out at `:200-207`).** `BoardingListStore` should move from
app-root `providedIn: 'root'` to component-level `providers:` on the new shared component so
the driver page instance and a sell-page Tab-3 instance never share one cache (its existing
`setScheduleId()` clear-on-change guard stays, just now scoped per mount instead of per app).

**The key decision: boarding is now status-neutral (`boarded = boardedAt != null`, decoupled
from ticket `status`). Recommended a THIRD column, not a repurposed one** — keep the existing
`Status` column showing the ticket lifecycle badge unchanged, ADD a new `Boarded` column
(icon+text+color chip: `check_circle`/green "Boarded" vs `radio_button_unchecked`/neutral-gray
"Not boarded", plus an audit sub-line "Boarded at HH:mm" when set). Reusing `is-info` for
"not boarded" was rejected — it would sit right next to the Status column's own `is-info`
badge (e.g. "confirmed") with a different meaning, the exact same-color-different-meaning
collision design-system §11 already warns about.

**Two new tokens/classes needed, both flagged as "new pattern — needs design-system.md +
ADR", not built yet:**
1. `.admin-status.is-neutral` + `--admin-neutral-bg`/`--admin-neutral-text` in
   `admin-theme.scss` — model directly on the existing `--admin-inreview-*` pair (self-
   contained light-bg/dark-text, **no** dark-mode text-only override — that exact mistake
   was already made once and reverted, see the OBRS-86 entry below in this file) but pick a
   visually distinct grey from `--admin-inreview-*` so the two neutral-ish chips don't read
   as the same color in adjacent columns.
2. `.admin-btn-danger` (compose the already-tokenized `--admin-danger-text`/
   `--admin-danger-border` — no new hex) for the Un-board button. §4 already names
   "Destructive" as a button role but no class implements it yet; this closes part of the
   §13 debt instead of inventing a one-off scoped style.

**Data gap: the locked `BoardingListItemResponse` contract has NO "who boarded" field.**
The card asks for an audit chip with "boarded time + who boarded." Spec's call: add
`boardedByName?: string` as an additive optional field on `BoardingListItemDto` (mirrors the
existing `boardedAt?: string` precedent from OBRS-96), seed it **optimistically** from
`authService.getUsername()` at the moment of a successful Board click (this session only —
it has nowhere else to come from until the backend adds it), and degrade gracefully to a
time-only chip after a refresh/reload. **Flagged as a backend contract gap for a follow-up
card** (add `boardedBy`/`boardedByName` to the boarding-list response) — do not block this
card on it.

**Board-button eligibility: deliberately did NOT hardcode a client-side status-code
allow-list.** The SA spec only locks the `boarded = boardedAt != null` formula, not the full
ticket-status enum. Board is disabled only when `boardedAt != null` (visibly already
boarded) or a request is in-flight for that row; every other rejection reason
(`TICKET_NOT_CONFIRMED`, `BOARDING_WINDOW_NOT_OPEN`, etc.) surfaces only after an attempt,
via the errorCode-mapped alert — same "status-neutral" philosophy as the boarded formula
itself, just applied to the button's disabled state too.

**Un-board is role-gated HIDDEN (not disabled) via `authService.hasAnyRole(['salesperson'])`**
— same "hidden, not disabled" precedent `app-export-button` already established
(`ExportButtonComponent.ngOnInit`'s `canExport` flag). `admin` inherits `salesperson`'s grant
transitively via `AuthService.ROLE_GRANTS`, so admin sees it too without a separate check.
Un-board requires `AlertService.confirm()` before firing (existing `confirm()` method already
supports this, no new alert-service API needed).

**New error-code helper needed, NOT a reuse of `boarding-scan-error.ts`.** Board/Un-board
share only some of the boarding-scan codes (`ALREADY_BOARDED`, `TICKET_NOT_CONFIRMED`,
`BOARDING_WINDOW_NOT_OPEN`, `TICKET_ERROR_ID_NOT_FOUND`) plus a NEW one scan doesn't have
(`NOT_BOARDED`, for an Un-board race). Spec'd a parallel `boarding-action-error.ts` +
`STAFF.BOARDING.ACTION_ERROR.*` i18n keys rather than overloading `SCAN.ERROR.*` (that
namespace is tied to the scan-box UI surface specifically).

**Multi-select "Board Selected" scoped OUT of v1.** Per-row Board/Un-board is the baseline
(matches how passengers actually arrive — staggered, one at a time). A bulk checkbox+"Board
Selected" toolbar action is real but lower-value for the staggered-arrival case; spec'd it as
an explicit phase-2 note only, not a build requirement.

**Tab-3 empty-state needs NO new copy.** `walk-in-center-panel`'s whole `p-tabView` (all 3
tabs) is already gated behind `*ngIf="selectedTrip"` one level up, with the existing
`STAFF.SELL.CENTER_EMPTY` empty-state covering "no round selected" — Tab 3 itself is never
reachable in that state. The *zero-passengers-in-this-round* empty state inside the shared
component reuses the existing `STAFF.BOARDING.EMPTY_TITLE`/`EMPTY_BODY` keys verbatim.

## 2026-07-10 — Scrutinize self-fix: OBRS-195 post-sale dialog used a non-existent i18n key `COMMON.CLOSE`

`sell-page.component.ts` `offerPrintTicket()` set `cancelButtonText: translate.instant('COMMON.CLOSE')`,
but the `COMMON` namespace only had `THEME_TOGGLE`, `CLEAR`, `EXPORT` — there was no `COMMON.CLOSE`
(only `ADMIN.COMMON.CLOSE`, `MY_BOOKINGS.TICKET_MODAL.CLOSE`, etc.). ngx-translate renders the raw
key string when a key is missing, so the post-sale "Print ticket?" dialog's cancel button would have
literally read "COMMON.CLOSE" in the shipped UI. The unit specs didn't catch it because the mocked
`TranslateService.instant` echoes the key.

Fix (additive, 3 lines): added `"CLOSE"` to the `COMMON` block in `public/i18n/{en,th,zh}.json`
("Close" / "ปิด" / "关闭"). Re-ran `ng test` → 1057 SUCCESS.

Pattern to internalize: when you reference an i18n key from TS, grep the locale JSON for that EXACT
dotted path before shipping — a mocked translate pipe/service will happily pass specs on a missing key.

## 2026-07-10 — QA re-verify: OBRS-129 PASSED — data path confirmed end-to-end at backend `70ff182`

Backend fix (`70ff182`, Instant→OffsetDateTime projection conversion) rebuilt locally on the same
:8000/:4407 setup as the earlier FAILED pass. Re-checked only what the 500 had blocked; role
matrix / error-state handling were already proven and not re-run.

**AC1 (tile parity, FE render):** confirmed. Tiles read `1 / 28.6% / 4 / THB 800.00`, matching
the API response and `/reports/summary` byte-for-byte. Same for `owner@system.local`.

**AC2 (departures table):** 1 row rendered — `ชลบุรี-กรุงเทพฯ` (Chonburi-Bangkok, th label found;
falls back to the English route slug correctly when zh has no translation row — confirmed in the
zh screenshot, not a bug), `10 ก.ค. 2026 15:00` (via `formatDisplayDateTime`, OBRS-178 formatter —
NOT the raw `2026-07-10T15:00:00+07:00` ISO string), `4 / 14`, `28.6%`. `tiles.departuresCount(1)
== 1` row. Per-row occupancy (28.6%) consistent with the tile (only one row, so trivially
sum-equal — matches the backend-side sum-based math already verified).

**AC3 dark-mode DOM probe on the now-reachable DATA surfaces:** `.admin-kpi` computed
`background-color: rgb(29, 34, 38)`, `.admin-table` / table rows `rgba(0,0,0,0)` (transparent,
inherits the dark card background, same shape as the light-mode empty-state card already
checked) — none near-white, no light bleed on any of the newly-reachable surfaces.

**AC4 (basis captions + i18n, no raw-key leak):** confirmed live for en/th/zh (cold `app_language`
localStorage switch + reload) — captions render "by departure date"/"by booking date" (localized:
"ตามวันที่ออกเดินทาง"/"ตามวันที่จอง" in th, "按发车日期"/"按预订日期" in zh) under the correct tiles;
`/ADMIN\.DASHBOARD\./` regex found zero raw-key leaks in the rendered body in any of the 3
languages.

**AC5 (View full reports link):** `.admin-card-head a.admin-btn-small` → `href="/admin/reports"`,
click navigates to `/admin/reports`. (First attempt used an over-broad `hasText: /report/i`
Playwright locator that matched the sidebar's "Usability Reports" nav item instead — a test-script
bug, not a product bug; re-verified with the scoped selector above and it's correct.)

**AC6 (empty state):** not re-forced — today (2026-07-10) has 1 real departure, so the empty
branch isn't reachable live. Already confirmed via `dashboard-page.component.spec.ts`'s
`isEmptyDay`/`contentState` unit tests (`'empty' when departuresCount===0 && bookingCount===0 &&
occupancyRatePct===0`) plus the static template review — no change since the prior FAILED pass.

Fresh screenshots (light/dark, en default; th/zh; owner spot-check) captured after polling for a
real (non-skeleton) tile + a real table row — see QA's transcript for the scratchpad paths.
Verdict: **PASSED**. No frontend changes needed; the prior FAILED pass's frontend-side conclusions
(graceful error handling, correct i18n plumbing) already held and are now moot since the backend
supplies 200s.

## 2026-07-10 — QA: OBRS-129 FAILED (blocked on a backend 500, not a frontend bug)

**Verdict: FAILED**, blocking bug is backend-side (see backend worktree's `AGENT_MEMORY.md` for
the full root cause: `GET /api/private/admin/dashboard/today` 500s via an `Instant→OffsetDateTime`
native-query projection error whenever any departure exists on the given day — i.e. on every real
day, not just an edge case). Live-verified against local FE (:4407) + local backend (:8000, `sit`
profile / real SIT DB) as `admin@system.local`.

**What this DID confirm about the frontend's own code (all good):**
- `dashboard-page.component.html`'s `contentState === 'error'` branch degrades gracefully — no JS
  crash, no console pageerror, a clean centered message replaces the tiles+table entirely, exactly
  per the `dashboard-state-card` design intent (screenshot evidence: `dashboard-light.png` /
  `dashboard-dark.png` in QA's scratchpad, see the QA agent's transcript for paths).
- The error message is correctly localized (`ADMIN.DASHBOARD.LOAD_FAILED` rendered as
  "ไม่สามารถโหลดข้อมูลแดชบอร์ดได้" in Thai, no raw key leaked) — the admin account's
  `preferredLocale` defaulted the UI to Thai on this run.
- Dark mode probe on the one reachable new surface (`.dashboard-state-card`): computed
  `background-color: rgb(29, 34, 38)`, `color: rgb(231, 237, 241)` — dark, no light-bleed.
- Role gate (AC3) verified at the API level: ADMIN/OWNER reach the guarded route (get 500, not
  403 — i.e. auth passes, only the data path is broken); SALESPERSON/DRIVER/CUSTOMER get 403,
  anon gets 401.

**What could NOT be verified this pass (all downstream of the backend bug, nothing here implies a
frontend defect):** tile-parity rendering (AC1), departures table rendering + occupancy column
(AC2), the empty-state note replacing the table (AC5) — never reached because "today" has real
departures and the endpoint always 500s on that path, `.dashboard-basis-caption`/`.admin-kpi`/
`.admin-table` dark-mode probe (never rendered), the "View full reports" link (AC7 — its wrapping
`<section>` is `*ngIf="contentState !== 'error'"`, so it doesn't render in the error state either),
tile-level i18n (en/zh switch of tile labels/captions never got past the error state to check).

Re-run this worktree's own capture/regression once the backend fix lands — nothing here needs
frontend changes.

## 2026-07-10 — Frontend implementation: `/admin/dashboard` rebuild-in-place (OBRS-129)

**Worktree:** `OBRS-frontend-wt-starter-dashboards` (branch `ao/starter-dashboards`, off
`origin/dev` which already has OBRS-40). `ng test`: 996/996 PASS. `ng build --configuration
production`: PASS (1.45 MB initial, under the 1.5 MB budget). `npx tsc --noEmit -p
tsconfig.app.json`: clean.

**Rebuild-in-place, not a new page.** Kept the route (`/admin/dashboard`), sidebar nav item,
topbar title mechanism (`data.titleKey: 'ADMIN.PAGES.DASHBOARD'`, `subtitleKey:
'ADMIN.DASHBOARD.SUBTITLE'` — no in-body `<h3>`), and `pollWhileVisible` auto-refresh
untouched. Only `AdminDashboardStore`'s internals and the page's rendering changed.

**`AdminDashboardStore` re-based onto `AdminCollectionStore<DashboardTodayDto>`, deleting the
old bespoke two-source (`getBookings()` + `getVehicles()`) merge entirely** — same move
`ReportsStore` made for OBRS-40. `fetch()` is one `firstValueFrom(adminApiService
.getDashboardToday())` call; `emptySnapshot()` covers the no-`data` edge. See
`docs/adr/0013-dashboard-rebase-on-admin-collection-store.md` for the full rationale
(business logic — pending-payment/active-vehicle detection, revenue summation — now lives
server-side in the new endpoint instead of being re-derived client-side).

**Backend endpoint does not exist yet — built directly against the contract supplied in the
locked task spec (mirrors `ReportsSummaryDto`'s shape convention), flagged in
`docs/handoff.md`.** Checked the paired backend worktree
(`OBRS-backend-wt-starter-dashboards`): `IMPLEMENTATION_CHECKLIST.md` shows `#44` (OBRS-129)
"claimed"/in-progress but no `Dashboard*` controller/service exists yet, only planning-doc
commits. `../OBRS-backend/docs/api/` has no `dashboard.md`. Filed a Contract Request per
`CLAUDE.md`'s R0/R1 rule — every load will show `ADMIN.DASHBOARD.LOAD_FAILED` until the
backend ships `GET /api/private/admin/dashboard/today`.

**`contentState` has one fewer branch than `ReportsPageComponent`'s.** No date picker on this
page (the endpoint is always "today" in Bangkok time), so no `'invalid'` state —
`'loading' | 'error' | 'empty' | 'data'` only. `isEmptyDay` carries forward the OBRS-40
`e41e88e` divergent-basis reasoning (occupancy keys on departure-date, `bookingCount` keys on
booking-date, so a day can have real occupancy with zero bookings and that is NOT empty) —
renamed for this page but same logic shape as `isEmptyRange`.

**Revenue tile gates on `showRevenue = !!tiles?.revenue` (presence), never a role check** —
same forward-compat pattern as Reports, now literally realized: the interface comment on
`DashboardTilesDto.revenue` says this is for "a future viewer (e.g. salesperson) without
revenue visibility," which is exactly what OBRS-129's own deferred salesperson-access scope
describes.

**Split `loadError` (gated on `!store.hasValue`, drives the full-replace error card) from a
new raw `hasFailed` flag (ungated, drives `app-admin-refresh-hint`'s "failed, showing saved
data" line) — Reports doesn't need this split because it hardcodes `[failed]="false"` on its
refresh-hint and has no such requirement.** The task spec explicitly asked for
`app-admin-refresh-hint` to cover "background-refresh/failed-with-cache," which needs to fire
precisely when there **is** a cache (the opposite gating condition from the error card). The
outer `<section class="admin-page-intro">`'s `*ngIf` combines
`(contentState === 'data' || contentState === 'empty') && (isRefreshing || hasFailed)` so the
hint only ever appears over an already-rendered tiles/table view, never doubled up with the
error-state-card.

**Test gotcha: a naive `dedupes concurrent refreshes ... toHaveBeenCalledTimes(1)` assertion
is WRONG for `AdminCollectionStore` subclasses when the fetch resolves via `firstValueFrom(of(...))`.**
`AdminCollectionStore.refresh()`'s actual contract (see its own doc comment) is "a call that
arrives mid-flight requests one more fetch when the current one finishes" — with an
already-resolved-but-microtask-deferred observable, both the initial fetch AND the
one-rerun fire before `Promise.all([first, second])` settles, so the spy legitimately gets
called twice. Verified via a throwaway Node repro (`rxjs`'s `firstValueFrom(of(x))` still
defers the `await` continuation to a microtask, same as any promise). Rewrote the test to
assert the store resolves cleanly + `hasValue` afterward, not a specific call count — the
exact rerun-count contract is already covered in detail by the base class's own
`admin-collection-store.spec.ts` (using a manually-controlled `deferred<T>()` to actually hold
a fetch "in flight" across the assertion, which `of()` cannot model).

**i18n:** added `ADMIN.DASHBOARD.{TILE.*, BASIS.*, DEPARTURES.*, VIEW_FULL_REPORTS}` (12 keys)
to en/th/zh, changed `SUBTITLE`, deleted the now-dead flat keys
(`TOTAL_BOOKINGS`/`PENDING_PAYMENTS`/`ACTIVE_VEHICLES`/`REVENUE`/`RECENT_BOOKINGS`/`VIEW_ALL`/
`PARTIAL_LOAD_FAILED`/`UPDATING`) after grep-confirming none were referenced outside the
dashboard files being rewritten. Kept `LOAD_FAILED` (reused) and `TITLE` (not in the
task's deletion list, left as harmless unused weight rather than guessing it's safe to
remove).

**Docs:** `README.md` "Admin UI Conventions" gained a "Dashboard (`/admin/dashboard`)"
section (mirrors the existing "Reports" section's structure/tone) explicitly noting this is
now the **second** `.admin-card.admin-kpi` tile-markup consumer the Reports section already
predicted, and that extraction into a shared stat-tile component was deliberately NOT done
here (tracked as debt, out of scope for a task with a fully prescribed file list).
`docs/handoff.md` got a new Contract Request entry (2026-07-10); `docs/adr/0013-...md` covers
the store-rebase decision.
## 2026-07-10 — Frontend implementation: digital e-ticket QR + manual boarding-scan (OBRS-96)

**Worktree:** `OBRS-frontend-wt-obrs-96-eticket-qr` (branch `ao/obrs-96-eticket-qr`, off
`dev`). `ng test`: 1020/1020 PASS. `ng build --configuration production`: PASS (1.47 MB
initial, under the 1.5 MB budget).

**Backend does not exist yet for either endpoint — built against the SA/UX-locked shape,
flagged in `docs/handoff.md`, same pattern as OBRS-109/OBRS-85.** Checked the paired backend
worktree `OBRS-backend-wt-obrs-96-eticket-qr` (same branch name): `git diff dev --stat` shows
only `AGENT_MEMORY.md` + unrelated fixture fixes, no boarding-token/boarding-scan
controller/service/DTO. `IMPLEMENTATION_CHECKLIST.md` confirms `[#52] OBRS-96` is still
🔒 WIP. Filed a Contract Request in `docs/handoff.md` covering both
`GET /api/private/tickets/{id}/boarding-token` and `POST /api/private/tickets/boarding-scan`.
Until the backend lands: every ticket's e-ticket QR shows the `qrUnavailable` placeholder
(404 on every `boarding-token` GET), and the boarding-scan box always shows the `GENERIC`
error — both degrade gracefully, no broken UI.

**Per-ticket QR state lives OUTSIDE the transient `passengers` array — this is the one
non-obvious design point.** `ETicketComponent.mapTicketFields`/`applyApiOverrides` already
re-ran on every `combineLatest` emission before this feature, including a bare locale switch
(`translateService.onLangChange`). If the resolved `qrDataUrl`/`qrUnavailable` lived only on
the `TicketPassenger` row objects, a language toggle would rebuild the array from scratch and
either blank already-fetched QR codes or re-trigger duplicate `boarding-token` GETs per
ticket. Fixed via two component-level, `ticketId`-keyed structures independent of the
`passengers` array's lifetime: `qrStateByTicketId: Map<number,{qrDataUrl,qrUnavailable}>` and
`fetchedTicketIds: Set<number>`. See `docs/adr/0013-per-ticket-qr-eticket-and-boarding-scan.md`
Decision 3 for the full writeup. **Pattern to remember:** whenever a component's field-mapping
function re-runs on a locale/language change (not just on new data), any per-item async state
that must survive that re-run needs to live in a keyed side-map, not embedded in the
regenerated array.

**`forkJoin` isolation gotcha caught while writing the isolation test, not before.** The
initial instinct was `catchError` around the whole `forkJoin(...)` call — that's wrong: it
would make ONE ticket's 409 (`TICKET_NOT_CONFIRMED` on a cancelled/refunded leg) blank every
other ticket's QR, since `forkJoin` never emits if any inner observable errors. Fix: put
`catchError` **inside** each inner `.pipe()`, resolving to a `{ticketId, boardingToken: ''}`
sentinel — every inner observable is then guaranteed to emit, so `forkJoin` always completes
with one result per ticket regardless of how many failed. Also learned while writing the spec
for this: the default `of(null)` boarding-token stub resolves the whole
fetch→apply chain **synchronously** (the empty-token branch in `applyBoardingTokenResults`
never hits an `await`), so a test asserting `component.passengers` right after calling
`applyApiOverrides()` already sees the resolved (`qrUnavailable: true`) state, not a pending
one — don't assume an async-looking method leaves state untouched by the time the next
synchronous line runs; check whether every branch actually awaits something.

**Boarding-scan `SKIP_AUTH_LOGOUT` is intentionally asymmetric between the two new calls** —
the customer-side `TicketService.getBoardingToken()` does NOT set it (a 401 there is the
customer's own expired session and should force-logout normally), but
`StaffApiService.boardingScan()` DOES set it, mirroring `booking.service.ts`/
`promotion.service.ts`'s defense-in-depth against OBRS-187. Don't copy one call's
`SKIP_AUTH_LOGOUT` choice onto the other without re-checking who's making the call and what a
stray 401 there should mean.

**Boarding-scan error UI reuses `.admin-status`/`.admin-field`/`.admin-btn-primary` — no new
control types.** The 7 documented `errorCode`s (`INVALID_TICKET_TOKEN`, `EXPIRED_TICKET_TOKEN`,
`WRONG_SCHEDULE_TICKET`, `BOARDING_WINDOW_NOT_OPEN`, `TICKET_NOT_CONFIRMED`, `ALREADY_BOARDED`,
`TICKET_ERROR_ID_NOT_FOUND`) plus `GENERIC` each map to a distinct i18n key + severity
(`danger`/`warning`) + Material Symbol icon in `shared/lib/boarding-scan-error.ts` (mirrors
`reschedule-error.ts`). `TICKET_ERROR_ID_NOT_FOUND` is kept exactly as specified — did NOT
"clean up" to `TICKET_NOT_FOUND`, since it must match the backend's stable code verbatim.

**`BoardingListItemDto.boardedAt?: string`** is a new, additive, optional field — every
existing call site (the pre-existing `checkIn()` button flow) is untouched; only the new
`reflectBoardedInList()` (fired after a successful `boardingScan()`) sets it via
`store.mutate()`, the same optimistic-update pattern the existing `checkIn()` method already
uses.

## 2026-07-09 — Scrutinize self-fix: OBRS-176 admin cross-area access

**Worktree:** `OBRS-frontend-wt-admin-cross-area-access` (branch `ao/admin-cross-area-access`).

**Fixed one stale comment the widening left behind.** `staff-layout.component.ts:22-25`
still read "only the owner reaches both portals, so this is effectively an 'owner is here'
check." After OBRS-176 admin is also a cross-portal superset, so admin reaches both portals
too — the comment was factually wrong (the exact "leftover text claiming admin is confined"
class of defect). The `isAdmin = hasAnyRole(['admin'])` gate was already correct (true for
both owner and admin, false for plain salesperson/driver); only the prose was wrong. Rewrote
it to "both owner and admin hold cross-portal access (OBRS-176) ... an 'owner/admin is here'
check." Comment-only, no behavior change.

**Pattern for next time:** when you widen `ROLE_GRANTS`, grep the whole `src/` tree for prose
that asserts the OLD confinement (`only the owner`, `admin.*confin`, `both portals`,
`cannot enter`), not just the file you edited. The sibling `admin-layout.component.ts` comment
was updated in the same PR but this staff-side twin was missed.
## 2026-07-09 — Frontend implementation: usability report detail triage-UX refinement (OBRS-174)

**Worktree:** `OBRS-frontend-wt-usability-triage-ux` (branch `ao/usability-triage-ux`, off
`origin/dev`). Refines the existing admin Usability Reports detail modal from OBRS-77/82/86/106/108/115.

**Un-aliased `detailStatusOptions` from `statusFilterOptions`.** `buildStatusOptions()`
previously set `this.detailStatusOptions = this.statusFilterOptions` (all 5 statuses,
including `new`/`in_review`) — a decision-only dropdown should never let an admin "select"
a triage state as if it were an outcome. Now built from its own `detailStatusValues =
['accepted','resolved','rejected']`. The table filter above the table is untouched (still
all 5 — an admin does want to filter by `new`/`in_review` there).

**Added `seedStatus()` gate so the dropdown starts empty (design-system §3.1) unless the
report already carries a terminal decision.** All three places that seeded
`selectedDetailStatus` (cache-hit branch, optimistic-open, fetch-resolve pristine patch) now
route through `seedStatus(status)`, which returns `''` for anything not in
`accepted|resolved|rejected`. `new`/`in_review` reports now correctly leave Save disabled
until the admin actively picks an outcome — previously a `new` report seeded
`selectedDetailStatus = 'new'`, which is not even a selectable dropdown option once #1 above
un-aliased the options, so Save would have silently rendered with an invalid/blank selection
without this seeding fix.

**Silent auto-promote (`new` → `in_review`) is a SEPARATE code path from `saveStatus()` —
do not be tempted to unify them.** `openDetail()` calls a private `autoPromoteToInReview(id)`
when the just-opened row's status is `'new'`. It calls the same
`adminApiService.updateUsabilityReportStatus(id, 'in_review', null)` endpoint but has its
own `subscribe({next, error})` with NO `alertService` calls in either branch — success
silently updates the store row + `detailCache` entry (so it can't re-fire this session) and
triggers the badge refresh; error is fully swallowed (covers the expected 400
`report.invalid-transition` when another admin's session already advanced the row between
this admin's list fetch and opening it). It must never block or close the modal — the modal
render is driven entirely by the (separate) detail GET subscription, not by this promote
call. Gate is strictly `summary?.status === 'new'` read from the row already in `allReports`
— it does not fire from the cache-hit branch (a cache hit means this report's full detail
was already fetched once this session, so it has either already been promoted or the admin
already made a decision).

**`saveStatus()`'s success branch now also calls `closeDetail()`** (after the existing
`detailCache.delete`/`alertService.success`/`store.refresh()`) — a saved decision is a
completed action, so the modal dismisses back to the table. The error branch is untouched;
the modal stays open on failure so the admin can retry without re-opening.

**Badge refresh: added `UsabilityReportBadgeRefreshService`** (`shared/services/`,
`providedIn: 'root'`, a single `Subject<void>` + `trigger()`) rather than wiring the page
directly to the layout (siblings, no existing channel). `AdminLayoutComponent
.watchNewReportCount()`'s existing `merge(timer(...), router.events...)` gained this as a
third source — same fetch, same error handling, no new code path. See
`docs/adr/0011-usability-report-badge-refresh-trigger.md` for why this is scoped narrowly
(not a general notification bus — that refactor is deliberately DEFERRED, see
`notification-domain-deferred.md` in agent-office memory).

**Test gotcha: an existing OBRS-86 spec (`sends the triage note in the PUT payload...`)
asserted `toHaveBeenCalledOnceWith` on `updateUsabilityReportStatus`.** Since every fixture
in this spec file opens a `status: 'new'` report, and opening now always fires the
auto-promote call on that same spy, the assertion legitimately needed to change from "called
once" to "assert on `calls.mostRecent().args`" — this is a real behavior change (the spy now
does get called twice: once for the silent promote, once for the explicit save), not a test
weakening. Also added a default `adminApiServiceSpy.updateUsabilityReportStatus.and
.returnValue(of({code:200,...}))` in the shared `beforeEach` so every existing fixture (most
of which open a `new`-status report and therefore now trigger the auto-promote) has a sane
default response without each test needing to opt in.

**i18n:** changed `ADMIN.USABILITY_REPORTS.STATUS.SAVE` value only (same key) in en/th/zh —
`"Save Status"/"บันทึกสถานะ"/"保存状态"` → `"Save"/"บันทึก"/"保存"` (shorter label now that the
button sits next to the status dropdown, whose own `LABEL` key already reads "Status").

**Test results:** `ng test --watch=false --browsers ChromeHeadless` — see run output in the
implementation report. `ng build --configuration production` — see run output.
## 2026-07-09 — Frontend implementation: `/admin/reports` MVP (OBRS-40)

**Worktree:** `OBRS-frontend-wt-reporting-summaries` (branch `ao/reporting-summaries`).
`ng test`: 882/882 PASS. `ng build --configuration production`: PASS (1.45 MB initial,
under the 1.5 MB budget). Diff vs branch HEAD is scope-only (7 files modified, 2 new:
`reports-summary.interface.ts` + the `pages/reports/` folder).

**PO simplification applied — the whole ADR-0011 guard-relaxation was dropped, and I found
(and reverted) a prior partial attempt at it already sitting in the worktree.** On starting,
`README.md` had an uncommitted diff describing a salesperson cross-portal-access ADR, and
`docs/adr/0011-admin-stat-tile-and-reports-cross-portal-access.md` existed as an untracked
file proposing: relax the top-level `/admin` guard to `['admin','salesperson']`, then
re-tighten every *other* existing child route with its own `canActivate`, plus a
`StaffLayoutComponent` "Reports" shortcut and `isSalesperson` nav filtering. The task
explicitly superseded this (salesperson access deferred to OBRS-129) — I ran
`git checkout -- README.md` and deleted the ADR file before starting, so no trace of the
dropped approach reached this commit. **Lesson: when a task says "apply these
simplifications (they remove work done for an earlier version of this spec)," check the
worktree for uncommitted/untracked leftovers from that earlier version before writing new
code — don't just diff your own additions against a clean baseline.**

**Inlined the KPI tiles — did not extract `AdminStatTileComponent`.** Copy-pasted
`dashboard-page.component.html`'s `.admin-card.admin-kpi` markup (icon/big-number/skeleton)
directly into `reports-page.component.html`, per the "smallest diff" instruction. Revenue
tile uses `.admin-kpi-icon.is-success` (same visual role as the dashboard's Revenue tile).

**Revenue gating is presence-based, not role-based — verified both the store and the
component read it that way.** `ReportsTilesDto.revenue?` and `ReportsDailyRowDto.revenue?`
are optional; `ReportsPageComponent.showRevenue = !!tiles?.revenue` gates both the tile
(`*ngIf="showRevenue"`) and the table column. No `AuthService`/role check anywhere in this
page — forward-compatible with OBRS-129 without a frontend change when the server starts
omitting `revenue` for a salesperson viewer.

**`ReportsStore` is the first range-parameterized `AdminCollectionStore` subclass — kept as
a single root-scoped cache, not one per range.** `setRange(from, to)` mutates the store's
own `fromDate`/`toDate` fields then calls `refresh()`; `fetch()` always reads the current
range. This preserves the SWR contract (re-entering `/admin/reports` shows the
last-fetched range immediately) without needing a cache keyed by range, since only one
range is ever being viewed. Default range is last 7 days inclusive of today, computed via
local (not UTC) date math — matches `schedules-page.component.ts`'s own
`toDateInputValue`/date-filter convention, not `toISOString()` (which would shift a day near
a local-midnight boundary in certain timezones — caught this while writing the store spec's
"defaults to last 7 days" test, which originally used `toISOString()` and would have been
flaky).

**Server 400 backstop needed a way to surface `errorCode` without changing the shared
`AdminCollectionStore` base class.** The base class's `error$` is a bare boolean (by design
— it's shared by every admin store and none of the others need more). Added a
store-local `lastErrorCode` getter to `ReportsStore` only: `fetch()` catches the raw error,
extracts `error.error.errorCode` into a private field, then re-throws so the base class's
existing error-swallowing/cache-retention behavior is unchanged. The page reads
`store.lastErrorCode` inside its own `error$` subscription to pick between
`RANGE_INVALID`/`RANGE_TOO_LARGE`/generic `LOAD_FAILED` — matches design-system §9 (branch
on `errorCode`, never the localized `message`) without touching a class every other admin
page depends on.

**Client guard runs before every dispatch, blocks on `from > to` or a >366-day span, and
does NOT call `store.setRange()` when it fires** — regression-tested directly (two specs
assert `store.setRange` was never called after an invalid range change). The empty-range
(all-zero 200) case is intentionally NOT routed through the error path at all — it's a
`isEmptyRange` getter checked independently of `rangeError`/`loadError`, rendering a
friendly `ADMIN.REPORTS.EMPTY_RANGE` note alongside the normal (zeroed) tiles/table.

## 2026-07-08 — Frontend implementation: promo code system (OBRS-109 / #37)

**Worktree:** `OBRS-frontend-wt-promo-codes` (branch `ao/promo-codes`, off `dev`, on top of
#36's shipped round-trip admin page). Implements the UX spec below end to end. `ng test`:
675/675 PASS. `ng build --configuration production`: PASS (1.42 MB initial, under budget).

**Backend does not exist yet for either half of this feature — built against the SA/UX-locked
shape, flagged in `docs/handoff.md`, same pattern as OBRS-85.** Checked
`OBRS-backend-wt-promo-codes`: still at `origin/dev` HEAD, no promo-code commits. Neither
`POST /api/private/promotions/validate` nor the general `/api/private/admin/promotions`
CRUD exist. Filed one consolidated Contract Request covering both. Until the backend lands:
the customer promo field will show a generic apply-failed error on every attempt, and the
admin list/CRUD calls will 404 (skeleton/error states render gracefully, no crash).

**Split of responsibility between `PromoCodeFieldComponent` and `PassengerInfoSummaryComponent`
was a judgment call — the field does NOT render Subtotal/Discount/Total.** The UX spec bundles
"collapse to a chip + show Subtotal/Promo discount/Total" as one bullet, but the required i18n
keys (`REVIEW_SCHEDULE_BOOKING.TOTAL.SUBTOTAL`/`PROMO_DISCOUNT`) live in the *summary's own*
existing i18n namespace, not a `PROMO_CODE.*` one — strong signal the breakdown belongs to the
consuming summary component, which already owns the "Total" row. Went with:
`PromoCodeFieldComponent` = input/apply/chip/inline-error only (generic, portable, its own
`PROMO_CODE.*` keys); `PassengerInfoSummaryComponent` owns swapping its existing plain "Total"
row for Subtotal/Discount/Total once `(applied)` fires. Keeps the shared component reusable
without dragging a page-specific i18n namespace into `shared/components/`.

**Preview→submit race handled via a ViewChild chain, not a shared store.** `PromoCodeFieldComponent`
exposes `applyExternalError(errorCode)` (reverts to input state, keeps the typed code visible,
shows the mapped error, re-emits `(removed)`). `PassengerInfoSummaryComponent.revertPromoWithError()`
forwards to it via `@ViewChild`. `PassengerInfoComponent.handleBookingCreationError()` calls that
via its own `@ViewChild(PassengerInfoSummaryComponent)` — same hand-off pattern already used for
the passenger/booker form ViewChildren in this component, just one level deeper.

**`createBooking`'s new `suppressGlobalErrorAlert` param opts out of the error alert ONLY, not the
loading dialog.** `booking.service.ts` builds a context with just `SKIP_GLOBAL_ERROR_ALERT` (a new
private `silentErrorContext()`, separate from the existing `silentContext()` used by cancel/list
calls which also skips the loading alert) — the spec only asked to suppress the *error* alert for
this call. `PassengerInfoComponent.handleBookingCreationError()` then branches on
`error.error.errorCode`: a `PROMO_CODE_*` code reverts the field inline (no alert at all); any other
error manually calls `alertService.error(...)` with a new `PASSENGER_INFO.ALERT.CREATE_FAILED` key,
replicating what the (now-opted-out) global interceptor would have shown. The no-promo-code path is
byte-identical to before (`suppressGlobalErrorAlert` defaults `false`).

**Two `admin-btn-primary` buttons now coexist on one page (Save on `RoundTripPromotionCardComponent`,
Add Promotion Code on the list below) — a deliberate reading of design-system §4, not an oversight.**
The UX spec explicitly labels the new Add button "(primary)" while also requiring the round-trip
card's existing Save button preserved verbatim. Treated as two independently-scoped cards (each
with its own bounded action), analogous to how `vehicles-page` already has one primary "+Add" for
the table plus a separate primary "Save" inside its own modal — just both visible on-screen
simultaneously here instead of one being inside a modal. Flagging for Scrutinize/UX in case the
rule is meant to bind at the page level, not the card level.

**`RoundTripPromotionCardComponent` is a verbatim extraction — `RoundTripPromotionStore` and its
partial-PATCH/pristine-patch contract are untouched.** Moved `promotions-page.component.{ts,html,scss,spec.ts}`
to `round-trip-promotion-card/round-trip-promotion-card.component.*` unchanged except the class/selector
name and import path depth (+1 level). `PromotionsPageComponent` is a new file: hosts the card at the
top, then a `PromotionsListStore extends AdminCollectionStore<PromotionRespDto[]>` (sibling to
`VehiclesStore`) backing a list + create/edit modal (optimistic open, pristine-only late-patch from
`GET /{id}`, `PUT /{id}` full-replace) + soft-delete confirm modal, modeled on `vehicles-page`'s
skeleton. A row with `slug === 'round_trip'` renders "Managed above" instead of Edit/Delete icons —
one edit surface per entity, no risk of two forms fighting over PATCH-partial vs PUT-full-replace.

**Soft-delete keeps the row, just flips `status` to `'inactive'` locally (optimistic) — does not
filter it out of the list**, unlike `vehicles-page`'s hard-delete `confirmDelete()` which does
`list.filter(...)`. This was the one place I deliberately did NOT copy the vehicles skeleton
verbatim, per the UX spec's explicit "becomes Inactive, not removed" copy requirement.

**`discountType`/`status`/`autoApply` dropdowns start empty on create, pre-fill on edit — the
create-modal pre-seed anti-pattern in `vehicles-page.component.ts::openCreateModal()`
(`vehicleType: this.vehicleTypeOptions[0]?.code ?? ''`) was NOT copied here.** That pre-seed looks
like a live violation of design-system §3.1 despite the doc citing the Vehicle Type bug as the
motivating example — flagging for Scrutinize/tech-lead rather than silently fixing an unrelated
page in this PR.

## 2026-07-08 — UX spec: promo code system (OBRS-109) — key findings for the implementer

**Worktree:** `OBRS-frontend-wt-promo-codes` (branch `ao/promo-codes`, off `dev`, includes
#36's shipped `/admin/promotions` singleton page + payment-summary discount line). No
code written this pass — this is the UX/UI spec handoff. Full spec is in the OBRS-109
ticket thread; load-bearing findings below.

**Key decision — customer promo entry is INSTANT PREVIEW, not apply-at-submit — and it
needs a new backend endpoint.** The locked backend only validates/applies a
`promotionCode` inside `POST /api/private/bookings` (no preview exists). I'm
recommending backend add a small stateless `POST /api/private/promotions/validate
{code, amount}` (reuses the same validation logic, persists nothing, no usage
increment) so the customer can see "Code XYZ applied: -50 THB" before committing to the
booking — standard checkout expectation, and avoids a submit → reject → retype loop
where the "Next" button doubles as "create the whole booking." Tradeoff stated in the
spec: apply-at-submit needs zero new backend but gives worse UX (blind submit, and a
wrong code fails the entire booking-creation call, not just the coupon). If backend
cannot add the endpoint in this increment, fall back to (a) apply-at-submit with the
same entry field/errorCode-mapping, just remove the live preview call and forward
`promotionCode` straight into `buildBookingPayload()`.

**Placement: `passenger-info-summary` sidebar, not `review-schedule-booking` or
`payment`.** Traced the flow like OBRS-85 did: `review-schedule-booking-total` and
`passenger-info-summary` both compute totals client-side from the same selectors: only
`passenger-info-summary` sits directly above the "Next" button that actually calls
`createBooking()` (in `passenger-info.component.ts::onSubmitPassengerInfo`) — the
natural "review order + apply code + place order" moment. This is a **deliberate,
scoped reversal of OBRS-85 Finding 1** ("review/passenger-info structurally cannot show
a real discount") — that finding was about the *auto-apply round-trip* discount, which
still has no preview path and still only surfaces on `payment-summary` post-booking,
unchanged. The new validate endpoint only covers the *manually typed* code, so
`passenger-info-summary` can show a real, server-validated (not client-guessed) preview
for that case only.

**`payment-summary.component.html` line 84's `PAYMENT.SUMMARY.DISCOUNT_ROUND_TRIP` label
needs a generic replacement.** Post-#37 the discount snapshot on a booking can come from
either the round-trip auto-apply OR a manually typed code — the backend gives no
`discountSource` field to distinguish them, so a round-trip-specific label is now
wrong half the time. Spec adds a generic `PAYMENT.SUMMARY.DISCOUNT` key and repoints
that one template binding; leaves `DISCOUNT_ROUND_TRIP` in the i18n files as harmless
dead weight rather than chasing every locale file for a delete.

**Admin list/CRUD reuses the `vehicles-page` skeleton almost verbatim** (list +
create/edit modal + soft-delete confirm modal, `AdminCollectionStore<PromotionRespDto[]>`
sibling to `VehiclesStore`). The existing `PromotionsPageComponent` (today: a single
round-trip edit form, `RoundTripPromotionStore`) gets extracted unchanged into a new
`RoundTripPromotionCardComponent` child — pure move, not a rewrite, to protect the
already-tested partial-PATCH/pristine-patch logic. The round-trip row still appears in
the general list (backend's `GET /admin/promotions` returns it as a normal row), but its
Edit/Delete icons are replaced with a muted "managed above" label — one edit surface per
entity, no risk of two divergent forms fighting over the same PATCH-partial vs
PUT-full-replace contract.

**`autoApply` (boolean) is modeled as a 2-option `app-admin-dropdown` (Yes/No), not a new
toggle-switch component** — no toggle pattern exists anywhere in this admin module yet,
and the round-trip form already sets the precedent of representing a boolean
(`active`) as a string-valued canonical dropdown. Reuses the canonical control instead
of introducing a 4th form-control type.

**Translations sub-form covers en/th/zh (3 locales), not en/th (2) like
`lookup-settings`.** `lookup-settings-page` only has `enLabel/thLabel` fields — but that
predates the ZH locale rollout on the customer site. Promotion labels/descriptions are
the trilingual site's actual customer-facing content, so the create/edit modal gets 6
translation inputs (EN/TH/ZH × label/description), matching `AdminTranslationReqDto[]`
already defined in `admin-api.service.ts` (reused type, not a new one).

## 2026-07-08 — Frontend: usability-report-triage (OBRS-86) (SELF-FIXED)

**Worktree:** `OBRS-frontend-wt-usability-report-triage` (branch `ao/usability-report-triage`, diff vs `origin/dev`)

**Finding (self-fixed) — dark-mode `.admin-status.is-accepted` was light-green-on-light-green (~1.3:1, unreadable).**
The new accepted pill added `--admin-accepted-text: #6fe08a` inside the `.admin-shell.is-dark`
block, while leaving `--admin-accepted-bg: #b7f3c0` (a light pastel green) unchanged. Every
OTHER status pill (success/warning/danger) is a self-contained pastel chip: light bg + dark
text in BOTH themes — none override their text color in dark mode. The lone dark-mode text
override put a light green (#6fe08a) on a light green bg → ~1.31:1 contrast, effectively invisible.
**Fix:** removed the dark-mode `--admin-accepted-text` override so the pill keeps its light-mode
dark-green text (#0a3d1d) on #b7f3c0 in dark mode too — ~9.8:1, readable, and consistent with
the other pills. Still a distinct green vs the blue `is-success` "resolved" pill, so intent holds.
**Pattern to remember:** the admin status pills are theme-agnostic pastel chips — do NOT add a
dark-mode color override for a new status unless you override the *background* to a dark surface
too. Match the existing token pattern (bg + text defined once in the light `.admin-shell` block).
## 2026-07-08 — Frontend implementation: round-trip discount UI (OBRS-85)

**Worktree:** `OBRS-frontend-wt-round-trip-discount` (branch `ao/round-trip-discount`).
Implements the UX spec below (Findings 1-4) end to end. `ng test`: 631/631 PASS.
`ng build --configuration production`: PASS (1.41 MB initial, under the 1.5 MB budget).

**Backend contract does not exist yet — built against the SA-locked shape, flagged in
`docs/handoff.md`.** Neither `OBRS-backend` (main) nor its `-wt-round-trip-discount`
worktree has a controller/DTO for `GET|PATCH /api/private/promotions/round-trip` at
time of writing — only the `Promotion`/`PromotionTranslation` JPA entities exist. Built
`AdminApiService.getRoundTripPromotion()` / `updateRoundTripPromotion()` directly against
the `Promotion` entity's fields (`discountValue`, `minBookingAmount`, `startDateTime`,
`endDateTime`, `status`, `discountType`, `usageLimit`, `currentUsage`, `slug='round_trip'`,
`code='RT20'` per `data.sql`), and filed a Contract Request in `docs/handoff.md` with the
assumed `PromotionRespDto` shape. The `/admin/promotions` page will show its
`ADMIN.PROMOTIONS.LOAD_FAILED` state until the backend implements the endpoint. Also
flagged there: `data.sql` only seeds a `promotion_status` lookup value of `active` — the
Active/Inactive dropdown needs an `inactive` value added too (worked around client-side by
building the two options from i18n rather than fetching a lookup category, so the FE isn't
blocked by that gap).

**Partial PATCH is driven by FormControl `dirty`, not value-diffing.** The edit form is a
single `FormGroup`; `buildPartialPayload()` includes a field only when its own control is
`.dirty` (regardless of whether the value is textually unchanged). This was chosen over
diffing the raw value against `this.promotion` because the date fields round-trip through
`Date.prototype.toISOString()` — a fetched `"2026-01-01T00:00:00+07:00"` and the
re-serialized value are the *same instant* but different strings, so string-equality
diffing would spuriously include an untouched date field on every save. `dirty` sidesteps
that entirely. After a successful save, `promotionForm.markAsPristine()` (which Angular
cascades to every child control) clears dirty state so the next background SWR revalidate
patches those controls again without a visual jump.

**Reused the schedules-edit-modal pristine-patch contract (design-system §6) for the
SWR case, not just the modal case.** `AdminCollectionStore` re-emits in the background
(`refresh()`) while the admin may be mid-edit on this single-form page (no modal open/close
boundary here). First `data$` emission → full `.reset()`; subsequent emissions → patch only
controls where `control.pristine` — same guard as the schedules edit modal's late-arriving
detail fetch, just triggered by the SWR revalidate instead of an async detail GET.

**Design-system §5 (pill inputs) applied narrowly, not by editing `admin-theme.scss`.**
The shared `.admin-field`/`p-calendar` classes used by every other admin page are still the
10px-radius pre-pill shape (tracked debt, §13) — I did not touch that global file. Instead
`promotions-page.component.scss` overrides `.admin-field { border-radius: $radius-pill; }`
and adds a `.promotion-calendar` `::ng-deep` override, both scoped to this component only
(Angular's emulated encapsulation confines the plain `.admin-field` rule; `::ng-deep` was
only needed for the PrimeNG-rendered calendar internals). No raw hex was introduced — the
calendar override reads `var(--admin-surface-card)`/`var(--admin-text)`/`var(--accent-strong)`/
`var(--accent-soft)`, matching `.admin-field`'s own tokens instead of copying the raw-hex
`schedule-calendar-filter` styles from `schedules-page.component.scss`.

**PaymentSummaryComponent footer: two `*ngIf ... else totalOnly` pointing at the same
template ref.** `booking$` (via `selectBooking`) and `hasDiscount(booking)` are two
independent conditions, but both "no" branches must render byte-identical `totalOnly`
markup ("no visual change" is a UX requirement, not just a suggestion). Angular allows
multiple `*ngIf/else` directives in the same template to reference one `<ng-template
#totalOnly>`, so the "no discount" path (booking absent OR discount not `>0`) only exists
once in the DOM output regardless of which condition was false. If you touch this template,
keep both `else totalOnly` pointers — collapsing to a single flag is fine, just don't
duplicate the total-only markup (a copy-paste would drift the two silently).

**Walk-in checkout discount plumbing is genuinely inert — verified, not just asserted.**
`WalkInCheckoutComponent.@Input() discountAmount` defaults to `null`; `netAmount` getter
returns `totalAmount - (discountAmount ?? 0)`, so with the default every existing getter
(`changeDue`, `canSell`) and the 5 pre-existing spec assertions on them are byte-identical
to before. Confirmed via `ng test` (no walk-in-checkout regressions) — this was a forward-
compat/parity addition per the UX spec's Finding 2, not something exercisable today.

## 2026-07-08 — UX spec: round-trip discount (OBRS-85) — key findings for the implementer

**Worktree:** `OBRS-frontend-wt-round-trip-discount` (branch `ao/round-trip-discount`). No
code written this pass — this is the UX/UI spec handoff. Full spec is in the OBRS-85 ticket
thread; the load-bearing findings that will surprise whoever implements are below.

**Finding 1 — only `payment-summary` can show a REAL discount line; review/passenger-info
cannot, by construction.** Traced the actual booking flow: `review-schedule-booking-total`
and `passenger-info-summary` both compute their totals *entirely client-side* from
`selectScheduleBooking`/`selectScheduleFilter` (schedule `pricePerSeat` × passenger count) —
neither makes a server call. The booking is only created (`POST /api/private/bookings`) at
the END of `passenger-info.component.ts::onSubmitPassengerInfo`, and `discount_amount_snapshot`
is a server-computed field that only exists *after* that call. So the review page and the
passenger-info sidebar are pre-booking *estimates*; they structurally cannot carry a real
discount without the FE precomputing one, which the backend spec explicitly forbids. Do NOT
add a discount line there — the spec calls this out and scopes the real change to
`payment-summary.component.ts` (used inline by `payment-creditcard`/`payment-qrcode`, the only
summary that renders AFTER booking creation, reading from the NgRx `booking` store).

**Finding 2 — `walk-in-checkout`'s discount line will be dormant on ship.** Two independent
reasons: (a) `sell-page.component.ts` hardcodes `bookingType: 'one_way'` for every walk-in
sale — round-trip walk-in booking doesn't exist in the UI yet, so the discount can never
trigger; (b) even if it did, `WalkInCheckoutComponent.totalAmount` is a pre-sale client getter
(`pricePerSeat * selectedSeats.length`) computed before `createWalkInBooking`/`payWalkIn` are
ever called — same pre-transaction timing gap as Finding 1. The spec adds the `@Input()
discountAmount` plumbing there anyway (parity + forward-compat with a future walk-in
round-trip feature) but flags explicitly that it cannot render under current functionality —
don't spend QA time trying to trigger it via walk-in.

**Finding 3 — `CreateBookingResponse`/`BookingState` currently only carry `{bookingId,
bookingNumber}`.** `booking.service.ts::normalizeCreateBooking` is the single seam that
resolves the booking-intake response — it needs the three new optional fields
(`totalAmount`/`discountAmountSnapshot`/`netAmount`) added there, in the `CreateBookingResponse`
and `BookingState` interfaces (`shared/interfaces/booking.interface.ts`), and forwarded through
`passenger-info.component.ts::setBookingStore`. No new NgRx actions/reducers needed —
`invokeSetBookingApi`/`invokeSetBookingApiSuccess` already carry the whole `BookingState`
generically, so extending the interface is sufficient plumbing.

**Finding 4 — OWNER cannot reach `/admin` today, full stop.** The top-level route guard
(`app-routing.module.ts`) gates the whole `/admin` module on `requiredRoles: ['admin']`, and
`AuthService.hasAnyRole`'s hierarchy expansion (admin > owner > salesperson > driver > customer)
only expands a role *downward* — an `owner` session's effective roles are
`{owner,salesperson,driver,customer}`, which does not include `'admin'`. So today, an OWNER
literally cannot open any admin page, even though the backend's round-trip promotion PATCH
allows OWNER/ADMIN. This is a pre-existing gap, not something this light UI ticket should
silently patch by loosening the global admin gate — flagged in the spec as a call-out for
the SA/PM to decide, not resolved here.

## 2026-07-08 — Frontend: report-row-clickable (OBRS-82) (SELF-FIXED)

**Worktree:** `OBRS-frontend-wt-report-row-clickable` (branch `sit/report-row-clickable`, diff vs `origin/dev`)

**Finding (self-fixed) — keyboard path lacked the interactive-target guard the mouse path has.**
The whole `<tr>` is now clickable/activatable. `onRowActivate` (mouse) correctly bails
when the click originates from an inner control via `target.closest('button, a, …')`,
so the View button opens the detail exactly once. But `onRowKeydown` (keyboard) had NO
equivalent guard: a keydown bubbling up from the focused View button on Enter/Space
was handled by the row too — it called `preventDefault()` + `openDetail()`. Combined
with the button's own native activation this double-fires the detail GET (or, when
`preventDefault` suppresses the button, hijacks the button's activation through the
row handler — browser-dependent, non-deterministic). The two activation paths must
stay symmetric.
**Fix:** guard `onRowKeydown` with `if (event.target !== event.currentTarget) return;`
so only a keydown on the row *itself* (not an inner focused control) activates it.
Added a regression spec: Enter bubbling from `button.admin-btn-small` must NOT call
`openDetail` from the row handler. Pattern to remember: **whenever you add a row/card-level
click handler alongside inner controls, the keyboard handler needs the same
origin guard as the mouse handler — don't guard one path and leave the other open.**

**Returned to developer/UX (not self-fixed — design decision) — `role="button"` on `<tr>`.**
Overriding the row's implicit `role="row"` with `role="button"` breaks the table's
accessibility structure (its `<td>` cells lose their valid `row` parent) and adds a
second tab stop per row that duplicates the already-accessible View button. Since every
row already has a keyboard-reachable View button that opens the same modal, the row-level
`role`/`tabindex`/`aria-label`/`keydown` are redundant for AT+keyboard users. Simpler,
more accessible option: keep row-click as a pure *mouse* affordance (`(click)` +
`cursor:pointer` only), drop the row-level ARIA/keyboard surface and the `ROW_ARIA` key.
Flagging for UX rather than unilaterally removing declared a11y scope.


## 2026-07-08 — Frontend: report-detail-ux (OBRS-77) (SELF-FIXED)

**Worktree:** `OBRS-frontend-wt-report-detail-ux` (branch `sit/report-detail-ux`, diff vs `origin/dev`)

**Finding (self-fixed) — optimistic-open clobbered the admin's in-progress status edit.**
`openDetail()` now opens the modal optimistically and seeds `selectedDetailStatus`
from the summary row, then fires the detail GET (~2s on SIT). The GET's `next`
callback unconditionally re-assigned `this.selectedDetailStatus = detail.status`.
If the admin changed the status dropdown during that ~2s window, the resolving
GET silently reverted their selection to the server value. This is exactly the
hazard design-system.md §6 names: *"patch detail into pristine-only controls."*
The status dropdown is the one user-editable control that gets patched, and it
was not pristine-guarded. **Fix:** only adopt the fetched status when nothing is
selected yet (`if (!this.selectedDetailStatus)`) — the summary already seeded it
for the normal case, and the guard preserves an in-flight edit. Added a locking
spec ("does not clobber an in-progress status selection…") that drives the GET
through a `Subject`, changes status mid-flight, then resolves — it fails on the
old code (`Expected 'new' to be 'resolved'`) and passes on the fixed code.
**Lesson:** whenever a modal goes optimistic-open, audit *every* subscribe
callback that writes to a user-editable control — seed-on-open + patch-on-arrive
must be pristine-guarded or it becomes a silent edit-clobber race.

**Also self-fixed (state hygiene):** `closeDetail()` didn't reset `isDetailFetching`,
leaving it stuck `true` after closing mid-fetch. Currently invisible (every
`openDetail` path re-sets the flag), but it left the state machine incoherent —
added `this.isDetailFetching = false;` to `closeDetail()`.

**Confirmed correct (no action needed):**
- **Lightbox ESC/backdrop routing.** Only the detail modal carries
  `adminModalBackdrop`; the lightbox is a plain child overlay. The single ESC
  listener routes through `onDetailBackdropDismiss()`, which closes the lightbox
  first when open, else the detail modal — no double-ESC dismiss, no path that
  strands the lightbox or closes the modal underneath. Backdrop-click on the
  lightbox is handled by its own `(click)` (target===currentTarget) and does not
  reach the detail directive's host-click (target ≠ detail backdrop element).
- **Cache stores only full detail.** The summary skeleton is only assigned to
  `detailReport`, never to `detailCache`; only the GET response is cached. Stale
  guard (`selectedReportId !== id`) protects the view-write in `next`; `saveStatus`
  invalidates the entry via `detailCache.delete(id)`. Optimistic `store.mutate` +
  AlertService + `store.refresh()` preserved.
- **Colors are tokens/established ink.** Lightbox close bg `rgba(25,28,30,.55/.75)`
  is the admin ink used throughout (base `#191c1e`); the scrim is inherited from
  `.admin-modal-backdrop`. No new raw hex. i18n keys (`IMAGE_ENLARGE`) present in
  en/th/zh; `COMMON.UPDATING`/`COMMON.CLOSE` exist. Backdrop directive reused, not
  forked. One primary (Save Status); × is a themed icon affordance.

## 2026-07-01 — Frontend: confirm-guidance-flow (OBRS-73) (SELF-FIXED)

**Worktree:** `OBRS-frontend-wt-confirm-guidance-flow` (diff vs `origin/dev`)

**Finding (self-fixed) — `jasmine.clock()` uninstall could leak on throw.**
The new happy-path test in `home.component.spec.ts` called
`jasmine.clock().install()` then `uninstall()` inline at the end of the `it`.
Jasmine's clock is a *global* mock shared across every spec file in a Karma run.
Failed `expect()`s don't throw (so those were safe), but any real exception
between install and the inline uninstall (e.g. a future refactor making
`onPickupDropoffConfirmed` throw, or `tick` erroring) would skip uninstall and
leak the fake clock into later spec files — where the next `install()` throws
"clock already installed" and cascades unrelated failures. **Fix:** wrapped the
body in `try { … } finally { jasmine.clock().uninstall() }` so cleanup is
guaranteed. **Lesson:** any inline `jasmine.clock().install()` must pair its
`uninstall()` with `finally` (or an `afterEach`), never a trailing statement.

**Confirmed safe (no action needed):**
- All 3 `onConfirm()` branches (neither / pickup-missing / dropoff-missing) call
  `alertService.toast(msg, 'warning')` — icon explicitly overrides the method's
  `'info'` default. Tab-switch + early-return logic is byte-for-byte unchanged
  (`activeTabIndex = 0`; `= isDesktop ? 1 : 2`).
- `onSearch()` removal is correctly scoped to the *caller*
  (`home.component.onPickupDropoffConfirmed`); `HomeBookingComponent.onSearch()`
  and its `(click)="onSearch()"` button binding are untouched and still reachable.
- Error branch still fires `alertService.error(SHARED.ERROR_GENERAL)` when a slug
  doesn't resolve. No new i18n keys added.
- `scrollIntoView` guarded with optional chaining + `setTimeout` (runs after CD
  applies the prefilled values). Safe.

**Non-blocking note (left for developer, not fixed):**
- `HomeBookingComponent.isPassengerSelected` getter is now dead production code —
  its only former caller (the removed passenger guard) is gone; only a unit test
  still references it. Harmless, but a candidate for a future cleanup PR.
- `AlertService.toast()` does not reset `isLoadingVisible = false` like the other
  methods. Irrelevant to this flow (no loading spinner during map-confirm), but be
  aware: SweetAlert2 shows one popup at a time, so firing a toast while a blocking
  loading modal is open would replace/close it. Out of scope here.

## 2026-07-01 — Frontend: stop-detail-card-cleanup (OBRS-72) (SELF-FIXED)

**Worktree:** `OBRS-frontend-wt-stop-detail-card-cleanup` (diff vs `origin/dev`)

**Finding (self-fixed) — e2e test still asserted the removed "View photo" button.**
The diff removed the "View photo" `p-button` from `route-stop-detail-card`, but
`e2e/tests/route-map.spec.ts` (lines 223 & 225) still asserted
`button hasText: 'View photo'` was visible on both the pickup and dropoff cards.
`ng test` (Karma unit) passed 606/606 and was the only suite the implementing
agent ran, so this regression went unnoticed — Playwright e2e is a separate
suite. **Lesson:** when deleting a UI element, grep the `e2e/` folder (and any
`.spec.ts`) for its label/text, not just the component unit spec. `ng test`
green does not cover e2e. **Fix:** removed the two "View photo" assertions and
updated the comment on line 222 to note OBRS-72 removed the button.

**Confirmed safe (no action needed):**
- `mapsApiKey` — still used by the *sibling* `route-map-panel` component (live
  interactive map) and its 2 parent bindings + `environment.mapsApiKey`. Removal
  was correctly scoped to the detail card only.
- `.detail-photo` SCSS class — still used by the inline photo `<img>`, not dead.
- `*ngIf="stop.address"` — truthy check correctly guards both `null` and `''`
  (empty string is falsy), so no separate empty-string check is needed. (Note:
  `RouteStop.address` is typed `string` but is null at runtime — a pre-existing
  interface inaccuracy, out of scope for this hotfix.)
- No other orphaned i18n keys; en/th/zh remain valid JSON.

## 2026-06-30 — Frontend: home-route-road-snap (issue #74) (SELF-FIXED)

**Worktree:** `OBRS-frontend-wt-home-route-road-snap` (diff vs `origin/dev`)

**Finding 1 (self-fixed) — duplicate Directions API call on /home re-navigation.**
Angular runs `ngOnChanges` (initial inputs) *before* `ngOnInit`. In
`route-map-panel.component.ts`, when `window.google.maps` is already loaded at
`ngOnChanges` time (any 2nd+ visit to /home after the Maps script loaded once),
`recomputeMapData()` fires `requestDirectionsPath(seq=1)`, and then `ngOnInit`'s
`.then()` deferred re-fire also fired it again with the *same* `seq=1`. Both pass
the stale guard and both hit the (billed) Directions API. Not a correctness bug
(same result, no stale overwrite) but a doubled API cost on every revisit.
**Fix:** added `private dirReqDispatchedSeq = -1;` — set to the seq whenever a
request is actually dispatched (in `recomputeMapData` and in the `ngOnInit`
re-fire), and the `ngOnInit` re-fire now only fires when
`dirReqDispatchedSeq !== dirReqSeq`. So the deferred re-fire only runs for the
genuine "stops arrived before maps loaded" case. 30/30 panel specs still pass.

**Finding 2 (self-fixed) — orphaned CSS.** `.contact-footer` rule remained in
`route-map-home.component.scss` after all three `.contact-footer` blocks were
removed from the template. Deleted the dead rule.

**Lesson for the developer:** `ngOnChanges` fires before `ngOnInit`. Any
"deferred until async resource ready" re-fire scheduled in `ngOnInit` must be
guarded against the case where the resource was *already* ready during
`ngOnChanges` (which then already did the work) — otherwise you double-dispatch.
A dispatched-seq marker is the cheap fix.

**Left for the developer (NOT self-fixed):** dead i18n keys now unused after the
removals — `HOME.ROUTE_MAP.VIEW_MAP` and the placeholder
`HOME.ROUTE_MAP.CONTACT_TITLE/CONTACT_PHONE/CONTACT_HOURS` ("Enquiries" /
"02-xxx-xxxx") in en/th/zh.json. Harmless but dead; remove if you want hygiene
(spans 3 locale files). The global `shared/components/footer` uses the separate
`HOME.FOOTER.*` keys and is untouched.

## 2026-06-30 — Frontend: ao/report-usability-issue (SELF-FIXED)

**Branch:** `ao/report-usability-issue` (commit `b004343`)

**Finding (self-fixed):** In `usability-reports-page.component.ts` the two
`app-admin-dropdown` option arrays (`statusFilterOptions`, `detailStatusOptions`)
were initialized with **hardcoded English labels** (`'New'`, `'In Review'`,
`'Resolved'`, `"Won't Fix"`). `app-admin-dropdown` renders `option[labelKey]`
verbatim with no translate pipe, so a Thai/Chinese admin saw English status
labels in the filter dropdown and the detail status selector — while the same
statuses rendered translated in the table via `statusLabel()`
(`ADMIN.USABILITY_REPORTS.STATUS.<status>`). Inconsistent + an i18n violation.

**Fix:** Build both option arrays from i18n in `ngOnInit` via a private
`buildStatusOptions()` that maps `statusValues` → `translate.instant('ADMIN.USABILITY_REPORTS.STATUS.<value>')`,
and rebuild on `translate.onLangChange` (takeUntil(destroy$)). The translated
STATUS keys already existed in en/th/zh, so no new i18n keys were needed.

**Lesson for the developer:** `app-admin-dropdown` does NOT translate labels —
whenever you feed it `{value,label}` options, the `label` must already be a
translated string. Never hardcode user-facing option labels; build them from
existing i18n keys (and rebuild on `onLangChange` so the dropdown follows the
language switcher like the rest of the page).

## 2026-06-26 — Frontend: ao/route-pickup-dropoff-map

**Branch:** `ao/route-pickup-dropoff-map`

**Feature:** Interactive Pickup/Drop-off Route Map — replaces `<app-station-home>` on `/home`
with a 3-panel (desktop) / 3-tab (mobile) pickup/drop-off selector backed by
`GET /api/routes/{slug}/pickup-dropoff`.

**New dependency:** `@angular/google-maps@^18` — added to package.json.
Map rendering is degraded-graceful: `mapsApiKey = ''` in all envs → placeholder only.
No JS error when key is blank.

**Key patterns used:**
- All 5 new components declared in `HomeModule` (no standalone).
- `BreakpointObserver` from `@angular/cdk/layout` drives `isDesktop` flag for 3-col ↔ 3-tab switch.
- `RouteMapHomeComponent` injects `RouteMapService` directly (smart container; not a page component).
- `HomeComponent.@ViewChild(HomeBookingComponent)` hand-off: picks up confirmed slug, resolves
  to `StationApi` from `selectProvinceWithStation`, calls `onStartStationChange` /
  `onEndStationChange`, checks `isPassengerSelected` getter before calling `onSearch()`.
- `HomeBookingComponent.isPassengerSelected` getter added (minimal public surface — sums
  all passengerInfo counts from the form control).
- ADDENDUM A2 status normalization: `String(status?.code ?? status?.slug ?? status).toLowerCase() === 'active'`
- ADDENDUM A3 script race: script injected in `ngOnInit` only if mapsApiKey set and `window.google?.maps` absent.
- `tsconfig.spec.json` types array updated to include `"google.maps"` so spec build resolves
  `google.maps.*` types from the `/// <reference types="google.maps" />` in @angular/google-maps.
- `home.component.spec.ts` updated to pass 3 constructor args after HomeComponent signature change.

**ADR:** `docs/adr/0005-route-pickup-dropoff-map.md` documents the component family,
Google Maps integration, ViewChild hand-off pattern, and status normalization rationale.

**Test result:** 517/517 PASS. Production build: 1.38 MB initial (under 1.5 MB budget).



## 2026-06-26 — Scrutinize self-fix: ao/sidebar-hover-expand pin visible on mobile

**Branch:** `ao/sidebar-hover-expand` (commit `dc32eab`)

**Defect found and self-fixed:** Every `.admin-sidebar-pin` rule (display, opacity,
align-self, hover, etc.) lived *inside* the `@media (min-width: 1101px)` desktop block in
`src/styles/admin-theme.scss`. There was no base rule, so at <=1100px the pin rendered as a
fully visible, clickable unstyled `<button>` between the brand and nav in the mobile drawer —
contradicting "mobile drawer unchanged." Worse, a mobile tap calls `togglePin()`, which writes
`obrs-sidebar-collapsed='0'`, silently making the *next desktop* session start pinned.

**Fix (under 10 lines):** added a base `.admin-sidebar-pin { display: none; }` next to the
sibling `.admin-menu-toggle` / `.admin-sidebar-backdrop` rules, which already use this exact
"hidden by default, revealed in the desktop media query" pattern (the desktop block already sets
`display: inline-flex`). **Pattern to remember:** when an element should only exist at one
breakpoint, give it a base `display:none` and reveal it in the media query — do not let the
*only* styling for an element live inside a media query, or it leaks as an unstyled element at
other widths.


## 2026-06-25 — QA pass: feature/trip-details-edit Editable Trip Details

**Branch merged:** `feature/trip-details-edit` → `dev`
Merge commit: `0ddc7bc`

**Defect found and self-fixed during QA:**
Integration Risk #1 confirmed. The frontend matched the backend 400 capacity-error by calling
`.includes('schedule.error.capacity.exceeds-type-max')` on `error.error.message`, but the backend
localizes `message` to prose ("Seating capacity exceeds vehicle type maximum") via
`messageSource.getMessage()`. The key string never appears in `message`. Fix (commit `66b00e2`):
match on `error.error.errorCode` instead — the backend derives `errorCode` from the message key
using `deriveErrorCode()` → `SCHEDULE_ERROR_CAPACITY_EXCEEDS_TYPE_MAX`. This is stable and
locale-independent. Pattern: never rely on localized prose for programmatic FE matching; always
use the structured `errorCode` field.

**Test results:**
- ng test: 335/335 PASSED
- Playwright E2E (trip-details-edit.spec.ts): 9/9 PASSED (AC-9 through AC-14 + i18n)
- Playwright regression suite: 43/43 PASSED (0 new failures)

**AC coverage:**
- Route name + Date: read-only (no formControlName input rendered) - PASSED
- Departure time: editable p-calendar - PASSED
- Vehicle type: editable admin-dropdown - PASSED
- Vehicle: filtered by type; type change refilters - PASSED
- Seating capacity: inline client-side validator fires before save; backend errorCode match renders inline error - PASSED
- Seat plan: pointer-events overlay confirmed on preview container - PASSED
- Driver: preselects current driver (id from schedule detail); change PUT payload includes driverId - PASSED
- Optimistic update: no full-page reload on save - PASSED
- i18n: all 17 TRIP_DETAIL_EDIT_* keys present in en/th/zh - PASSED

**Critical risk verifications (code-traced, no live backend required):**
- R0 invariant: ScheduleTimeChangedEvent ONLY fires on departureTimeChanged (line 135 ScheduleService). Capacity/vehicle/driver changes do NOT trigger it.
- Capacity invariant: COALESCE(seating_capacity, total_seats) used in both walk-in browse + search queries; service trims availableSeatNumbers to effectiveCapacity.
- 400 body shape: {status:400, message:"<localized prose>", errorCode:"SCHEDULE_ERROR_CAPACITY_EXCEEDS_TYPE_MAX", errors:null}. FE now reads errorCode, not message.



## 2026-06-25 — Scrutinize: owner role-hierarchy fix in hasAnyRole (#67)

**Self-fix (test stub drifted from production):** the production fix made
`AuthService.hasAnyRole` expand a held role to every role it outranks
(admin > owner > salesperson > driver > customer). But `navbar.component.spec.ts`
mocked `hasAnyRole` with a plain exact-match stub
(`required.some(r => roles.includes(r))`). After the fix that stub no longer
matched real runtime — a salesperson is now `isDriver === true`, yet the spec
asserted `isDriver === false`. The test stayed green only because it tested the
mock, not the behavior.

I rewrote the stub to mirror the real hierarchy expansion and corrected the one
assertion that genuinely changed (salesperson now flags `isDriver`). Pattern to
remember: **when you change a service method's semantics, audit every hand-rolled
stub of that method across the spec suite** — a stub that's simpler than the real
implementation will silently pass and hide the behavioral shift. Same exact-match
stub still lives in `staff-routing.spec.ts` (line ~82) and
`boarding-entry-page.component.spec.ts`; they don't assert the salesperson→driver
case so they're harmless today, but keep them in mind if those specs grow.


## 2026-06-25 — Scrutinize: global light/dark mode toggle (staff + public surfaces)

**Self-fix (CSS cross-surface bleed):** `src/styles/dark-theme.scss` scoped its dark rules
under `body.is-dark`. The new `ThemeService.applyBodyClass()` toggles `is-dark` on
`document.body` GLOBALLY (not just the `.admin-shell` div as before). Two generic selectors
therefore bled the public dark palette INTO the admin/staff shells, which already self-theme
via `admin-theme.scss` using `--admin-*` tokens:
  1. `body.is-dark label, input { color: ... !important }` (section 1) — collided with
     `.admin-shell label/input` at equal specificity; dark-theme.scss imports AFTER
     admin-theme.scss in styles.scss, so the public rule won by source order.
  2. `body.is-dark .form-control { background-color:#161922 !important; ... }` (section 4) —
     the staff portal uses bare `.form-control` inputs (walk-in-checkout, staff-schedules),
     so staff inputs got painted with the public dark-input palette instead of admin tokens.
  Fix: qualified those two rules with `:not(.admin-shell ...)` so they only apply outside the
  admin/staff shells. Verified `ng build` compiles and `ng test` (334) green.
  Pattern: when a global `body.is-dark` class drives dark mode, any UNQUALIFIED element or
  generic-utility selector (`label`, `input`, `.form-control`, `.title`, `.content-container`)
  under `body.is-dark` WILL leak into the self-theming `.admin-shell`. Either prefix
  public-page rules with a public-only ancestor, or exclude `.admin-shell` descendants. The
  `.admin-*`-prefixed and page-component-specific selectors (`.login-container`, `.payment-*`,
  `.stepper-*`, `.how-to-book-*`) are safe because they don't appear inside the shells.

**Returned to developer (test gap, not a blocker):** the staff/navbar toggle buttons have no
test asserting the click calls `themeService.toggle()`. Staff spec only checks the button
renders; navbar spec stubs `toggle: () => {}` as a plain fn (not a spy) and adds no
toggle/render test at all. The `ThemeService` itself is well covered (theme.service.spec.ts:
body class, persistence, toggle, init), so the wiring risk is low — but add a click→toggle
spy assertion for staff and navbar to lock the behaviour. See report for exact locations.

## 2026-06-25 — Scrutinize: online seat-picker Phase 1 (surface seat map + seat-race errors)

**Self-fix (duplicate alert):** removed the `extractApiErrorMessage` fallback block (and
its import) from `passenger-info.component.ts` `onSubmitPassengerInfo` catch. `createBooking`
does NOT set `SKIP_GLOBAL_ERROR_ALERT`, so the global `errorInterceptor` already calls
`alertService.error(extractApiErrorMessage(error) || 'Request failed.')` for every failed
`/api/` call and re-throws. The component's fallback then raised the SAME message a second
time → double toast. The seat-error branch keeps its own localized alert (it is a distinct
message) but is still double-toasted by the interceptor — see "Returned to developer".
Pattern: before adding `alertService.error(...)` in a component catch, check whether the
request opts out of the global interceptor via `SKIP_GLOBAL_ERROR_ALERT`. If it does not,
the interceptor already owns generic error messaging — only add a component alert for a
message the interceptor cannot produce, and suppress the global one for that request.

**Self-fix (cosmetic):** collapsed the dangling 3-line `<div class="seat-map-wrap mt-3">`
in `passenger-info-form.component.html` back to one line — the `*ngIf="...isSelectSeat..."`
was removed (Phase 1-A always renders the map) leaving an empty attribute artifact.

**Verified correct (traced end-to-end):**
- Phase 1-A: seat map renders unconditionally; `isSelectSeat:[true]` is now vestigial — the
  only reader was the removed template `*ngIf`. Grep confirms no code reads `.value`.
  Booker form still hard-codes `isSelectSeat:false`, harmless (it has no seat map).
- 401 early-return preserved; `error.error?.errorCode` read correctly for the two seat codes.
- Seat map (van) sources `availableSeatNumbers$` from `selectScheduleBooking`, NOT
  `selectScheduleList` — so the refresh genuinely must patch schedule-booking to update the
  map. The intent is real; the mechanism is the problem (below).

**Returned to developer (NOT self-fixed — >30 lines / lifecycle plumbing):**
- `refreshScheduleAvailability` waits for the fresh list with
  `firstValueFrom(store.pipe(select(selectScheduleList), skip(1), take(1)))`. This is
  fragile: (a) `skip(1)` assumes the very next emission is the HTTP result, but the
  schedule-list store is global and any other emission grabs the wrong value; (b) on a
  non-200/error the effect sets the store to `null` (or an unchanged value collapsed by
  NgRx `distinctUntilChanged`) → no 2nd emission → the `firstValueFrom` promise NEVER
  resolves and the subscription leaks. The component has NO `destroy$`/`ngOnDestroy`, and
  both call sites fire-and-forget the async method, so there is no teardown. Recommended:
  add `OnDestroy` + `destroy$`, react to the list via
  `pipe(filter(l => !!l), takeUntil(destroy$))` keyed on the known schedule IDs, or move the
  bridge into an effect. Pattern: never use `skip(1)` to "wait for my dispatch's result" on
  a shared store — there is no guarantee the next emission is yours, and the no-emission
  path leaks.
- Seat-race branch double-toasts (interceptor generic message + component localized one).
  Real fix needs `createBooking` to send `SKIP_GLOBAL_ERROR_ALERT` (edit in
  `booking.service.ts`, out of this review's scope).
- `buildScheduleFilterPayload` / `resolveStationCode` duplicate the payload+slug logic in
  `home-booking.component.ts` and `schedule-booking-filter.component.ts` (and `resolveStationCode`
  near-duplicates the component's own `getStationCodeById`). The two existing builders read
  their own forms, so none is directly reusable — extract a shared
  `buildScheduleFilterPayload(filter, stations)` util and have all three call it.

**Tests:** the C-error specs DO drive the real `onSubmitPassengerInfo` catch via a real
`throwError` (good), but they `spyOn(buildBookingPayload)` so the payload assembly is not
exercised, and the availability-refresh path (`refreshScheduleAvailability`, the `skip(1)`
wait, the schedule-booking patch) has ZERO coverage. NOTE: `ng test` could not be run green
in this working tree — an unrelated in-flight `login.component.spec.ts` constructs
`LoginComponent` with 7 args (constructor takes 6), failing the shared TS compile.

## 2026-06-25 — Scrutinize: login lang switcher mirrors home navbar switcher

**Self-fix (dead dependency):** removed `private elementRef: ElementRef` from the
`LoginComponent` constructor (and the now-unused `ElementRef` import). When you port the
navbar's outside-click handler that matches by CSS class
(`targetElement.closest('.navbar-lang-dropdown')`), `elementRef` is no longer read by
anything — the old Bootstrap handler used `this.elementRef.nativeElement.contains(...)`,
but the class-based handler does not. The navbar KEEPS `elementRef` only because its
`handleMobileMenuOutsideClick` still uses `nativeElement.contains`; login has no mobile
panel, so it has no such use. No spec churn: there is no `login.component.spec.ts`, so
nothing constructs the component with positional args. Pattern: after copying a method
from another component, re-grep the destination for each injected dependency it used to
need — a class-based DOM match drops the `ElementRef` requirement.

**Verified correct (traced end-to-end):**
- Outside-click + listener lifecycle: `toggleLangDropdown` registers a document click
  listener only while open; `closeLangDropdown` unlistens and nulls the handle;
  `ngOnDestroy` unlistens. Selecting an item runs the item's `(click)` first
  (closeLangDropdown unregisters the doc listener) so the same click does NOT re-fire the
  document handler. No leak, no double-handling.
- Material Symbols glyphs render via the GLOBAL `.material-symbols-outlined` rule in
  styles.scss — login does not need the navbar's component-scoped `%mat-icon` placeholder
  (which is itself redundant with the global rule). Parity confirmed.
- No leftover references to removed classes (`btn-lang`, `menu-lang`, `arrow-icon`,
  `dropdown-toggle`, flag svgs) in login html/scss/ts.

**Returned to developer (not self-fixed — needs a new file):**
- No `login.component.spec.ts` exists. The new switcher behavior (toggle open/close,
  select language calls languageService.switch + closes, outside-click closes,
  currentEndonym fallback) has zero regression coverage. This loop has no QA stage — add a
  spec. See report for the minimal cases.


## 2026-06-25 — Scrutinize: remove walk-in trip-headline + dead supporting code (issue #55)

**Self-fix (dead code):** removed the orphaned `formatDate(dateTime)` ("D MMM YYYY")
method from `walk-in-center-panel.component.ts`. It was NOT introduced by this diff —
it was pre-existing dead code, never referenced from the template or anywhere in the
component. Each other component (e-ticket, payment-info, review-schedule-booking,
passenger-info-summary) has its OWN `formatDate`, so a global grep looks busy; always
scope the grep to the component dir AND check the template before assuming a `formatXxx`
helper is live. While cleaning up sibling dead methods (`formatTime`), sweep the whole
helper block for other unused ones in the same class — don't stop at the symbols named
in the ticket.
Pattern: `dayjs` import stays — `formatDateTime` (Trip Details tab) still uses it, so
removing `formatTime`/`formatDate` does not orphan the import.

**Verified correct (traced end-to-end):**
- `selectedRouteSlug` correctly KEPT: it feeds `loadSegments(routeSlug, trip)` and the
  stale-response guards (`selectedRouteSlug !== routeSlug`) in both the success and error
  callbacks of the segment fetch. Removing it would break segment loading. Good call.
- `selectedRouteLabel` removal is complete: gone from the field, both assignments
  (`onDateChanged` reset + `onTripSelected`), the `[routeLabel]` binding, and all specs.
  No residual references anywhere. `WalkInRouteGroupDto.routeLabel` (DTO field) and the
  trip-browser's own `formatTime`/`routeLabel` usages are separate and correctly untouched.
- Padding change `py-2` → `pt-0 pb-2` does NOT reopen the #41/#55 viewport-fit e2e: the
  SCSS binds `.container-fluid` to `height: calc(100vh - 156px)` with `flex-direction:
  column` + `.pos-layout { min-height: 0 }`. The container's own padding is absorbed by
  the flex column (the SCSS comment states this explicitly); only the fixed 156px chrome
  constant — unchanged here — drives the fit. Safe.

## 2026-06-25 — Scrutinize: per-seat passenger type + pickup/drop-off state lift (issue #53)

**Self-fix (test):** `sell-page.component.spec.ts` → "stamps each passenger with the
passenger type staff selected" was a **vacuous test** (Karma warned "has no expectations").
It pre-set `selectedSeats = ['B1','B2']` and THEN called `onSeatToggled('B1')`/`('B2')`.
Because B1/B2 were already in the array, `onSeatToggled` took the *removal* branch and
emptied `selectedSeats`, so `onSell` built an empty `passengers` array and the
`for…expect` loop body never ran — the assertion executed zero times.
Fix: drop the manual `selectedSeats` pre-seed, add the seats via the real `onSeatToggled`
flow (so `seatPassengerTypes` is actually populated), and assert `passengers.length === 2`
before the per-passenger loop.
Pattern: `onSeatToggled` is a *toggle*. In tests, never pre-populate `selectedSeats` and
then call the toggle for the same seats — drive seats exclusively through the toggle, and
always assert array length before a `for…of … expect` so the loop can't pass vacuously.

**Verified correct (traced end-to-end):**
- Seat components' `seatGenders = null` default path is behaviorally identical to before:
  `seatGenderFor(l)` null-branch = `isSelected===l ? gender : ''`; `!isSeatActive(l)` null-branch
  = `isSelected!==l`. Customer passenger-info flow unaffected (it never sets `seatGenders`).
- Per-seat bug fix holds: `onSeatToggled` snapshots `selectedPassengerType` into
  `seatPassengerTypes[seat]` at click time; `onPassengerTypeChanged` only mutates the active
  type, never the map. `onSell` reads `seatPassengerTypes[seat] ?? selectedPassengerType`.
  Removal deletes the map entry; resets fire on date change, trip change, and post-sale.
- State lift complete: no orphaned segment state left in `walk-in-checkout`; `canSell` now
  gates on `pricePerSeat > 0`, totals on `pricePerSeat`. Stale-response guards
  (`selectedRouteSlug !== routeSlug`) preserved in the lifted `loadSegments`. Drop-off kept
  valid on pickup change via `onPickupChange`.

**Minor (left for dev, non-blocking):**
- `walk-in-center-panel.stopRowLabel()` is dead code — defined + unit-tested but never used in
  the template (HTML renders `{{opt.name}}`/`{{opt.time}}` inline). Remove method + its 2 tests.
- Orphaned i18n keys `STAFF.SELL.PICKUP_POINT/DROPOFF_POINT/STOP_PLACEHOLDER` no longer
  referenced after the checkout `<select>`s were removed; safe to delete from en/th/zh.
- `_buildStopTimes`: a leg with missing/zero `estimatedDurationMinutes` sets that stop's time
  to '' WITHOUT advancing `cumulativeMinutes`, so any downstream stop with a valid leg shows an
  under-counted (too-early) time rather than ''. No crash; low-severity display inaccuracy on
  incomplete duration data only.

## 2026-06-25 — Scrutinize: walk-in seat count/total fix + calendar restyle

**Self-fix (3-line comment):** Updated the stale leading comment in
`walk-in-trip-browser.component.html`. It still read "No calendar icon... the trailing
button was redundant" while the same change re-added an in-input `calendar.svg` icon —
the comment now contradicted the code. Replaced it with an accurate description (in-input
icon via `iconDisplay='input'`, `panelStyleClass="booking-calendar-panel"`, no `appendTo`).
Pattern: when you reverse a decision, rewrite the comment that justified the old one — a
contradicting comment is worse than none.

**Verified correct (traced end-to-end):**
- `seatClicked` is emitted unconditionally after the gender/taken-by-other guards, before the
  `isSelected` toggle. The walk-in count fix therefore does NOT depend on the seat component's
  internal single-select `isSelected` state (which goes stale in multi-select, but is only used
  for the single-highlight visual — a pre-existing UX limitation, not a count bug). Multi-seat
  deselect (select A1, A2, deselect A1 → [A2]) works because the parent `selectedSeats` array is
  the source of truth and `onSeatToggled` toggles by value.
- Walk-in flow binds ONLY `seatClicked`; `passengerSeatPositionOnChange` is no longer bound there
  → no double-fire. The passenger-info single-select flow still binds
  `passengerSeatPositionOnChange` and relies on its `''`-on-deselect to clear the form control
  (`setPassengerSeat`), so preserving that emit is correct.
- Removing `appendTo="body"` is REQUIRED, not incidental: `:host ::ng-deep .booking-calendar-panel`
  cannot reach a panel appended to `<body>`. Matches the proven home-booking / schedule-booking
  pattern. Van unavailable-seat clicks are still blocked by the seat-box `isDisabled` guard.

**Test note (left as-is):** `sell-page` "select then deselect leaves length 0" passes on the OLD
code too (it never passes `''`), so it's non-discriminating. The real regression test is
"empty string seat is a no-op" — that one fails without the `if (!seat) return;` guard. Adequate.

## 2026-06-25 — Scrutinize: issue #50 walk-in passenger-type tiles + center header

**Self-fix (1 line):** Added `[attr.aria-pressed]="passengerGender === pt.value"` to the
passenger-type tiles in `walk-in-center-panel.component.html`. The tiles use `role="button"`
and a `--active` CSS class to show selection, but that active state was visual-only. For a
toggle-button tile group, screen readers need `aria-pressed` to announce which option is
selected. Pattern: whenever a `role="button"` element represents a toggled/selected state,
pair the visual `[class.x--active]` with `[attr.aria-pressed]` bound to the same condition.

**Not fixed (left as-is, acceptable for a small UI change):**
- `(keydown.space)` does not call `preventDefault()`, so Space may also scroll the page while
  the tile is focused. Minor; revisit if QA flags it.
- `routeEndpoints` splits `routeLabel` on `→ — – -`. Robust for the standard
  "City → City" backend labels. Only failure mode is a 2-endpoint label where a single city
  name contains a spaced hyphen — unlikely given current backend data. Fallback header renders
  correctly when the label has no separator or is null.

## 2026-06-24 — QA pass: feature/walkin-ticket-sales Walk-in POS single-screen

**Branch merged:** `feature/walkin-ticket-sales` → `dev`

**Test results:**
- Playwright E2E: 27/27 PASSED (new spec replaced old 5-step wizard spec)
  - AC-1 through AC-12 covered; WI-A, WI-G watch items covered
  - One self-fix: AC-10 tab count used `li[role="tab"]` (0 hits) — PrimeNG uses `a[role="tab"]` anchors inside `li[role="presentation"]`; fixed to `a[role="tab"]`
- Backend unit tests: 633/633 PASSED (4 skipped)
  - Walk-in specific: ScheduleWalkInServiceTest (11), ScheduleWalkInControllerTest (6), ScheduleWalkInSecurityTest (4) all green

**Key observations:**
- Old `staff-sell-walkin.spec.ts` tested the 5-step wizard (fromStop, toStop, bookingType selectors, passengers array with gender). Completely replaced for the new 3-column POS.
- PrimeNG `p-tabview` nav renders `li[role="presentation"]` for tab items (not `li[role="tab"]`); the `a` inside has `role="tab"`.
- WI-A (totalAmount>0) confirmed by E2E: payload captured shows `totalAmount: 350` for 1-seat × 350 THB trip.
- WI-G (null pricePerSeat) confirmed: Sell button stays disabled when `canSell` gates on `totalAmount > 0`.
- API functional tests: SIT backend predates this feature (returns 400/TYPE_MISMATCH for `walk-in` path matching `{id}` route). Contract verified via MockMvc-based controller tests instead.
- i18n: all 3 locales (en/th/zh) have identical STAFF.SELL key sets — AC-11 passed.

## 2026-06-24 — Walk-in POS booking payload omitted `totalAmount` (self-fixed)

**File:** `src/app/modules/staff/pages/sell/sell-page.component.ts` (`onSell`).

The new single-screen POS built the `POST /api/private/bookings` payload without a
`totalAmount` field. The locked contract's `BookingReqDto` declares `totalAmount(>0)`
(NotNull/Positive on the backend), and the canonical online flow
(`passenger-info.component.ts`) always sends it (`price * passengers`). The walk-in payload
would have been rejected (400) or booked at zero. The checkout child already computes the
same value for its `canSell` gate but never forwarded it.

**Fix:** recompute `totalAmount = (parseFloat(trip.pricePerSeat || '0') || 0) * seatCount`
in `onSell` and add it to the booking payload (typed field + value). Added a spec asserting
`callArg.totalAmount === 600` for a 2-seat / 300-baht trip, plus two checkout specs proving
`canSell` stays false when `pricePerSeat` is `null` or `'0'` (the contract's null-price gate).
**Rule:** when you assemble a request payload by hand, diff it field-by-field against the
locked DTO contract AND the existing reference implementation of the same endpoint — don't
trust that the gate getter covering a value means the value reaches the wire.

## 2026-06-24 — Dark-mode accent text fails WCAG (self-fixed, #39)

**File:** `src/styles/admin-theme.scss`.

The unify-shell change added `.admin-shell.is-dark` flipping `--admin-surface*` and
`--admin-text/muted/outline`, but it did NOT flip the `--accent*` tokens. `--accent-text`
(light-mode values `#b3420a` orange / `#0f766e` teal / `#075c7a`) is deliberately dark so it
reads on white — but those same values are used in dark mode for card/modal headings, table
`code`, chips and status badges. On the dark surfaces (`#1d2226` / `#14181b`) that is only
~2.8:1, below the WCAG AA 4.5:1 floor for normal text. Light mode was fine (~5.5:1); the
defect appears only on the dark path, which is the admin-only shipped path (orange → 2.83:1).

**Fix:** added dark-mode `--accent-text` overrides scoped to `.is-dark` (generic `#fdba74`,
plus `.theme-admin.is-dark` → `#fb923c` ≈7:1 and `.theme-staff.is-dark` → `#5eead4` ≈10:1).
`--accent-soft` (a translucent tint) was left unchanged — the lighter text still passes AA
over it (~6:1). **Rule:** when you introduce a dark-mode surface flip, every token that
encodes a foreground colour tuned for the light surface (here the accent *text*, not just the
neutral text) must get a dark-mode value too. Don't stop at `--admin-text`; audit accents.


## 2026-06-23 — Navbar admin-reskin: group aria-label + dead field (self-fixed, #24)

**Files:** `navbar.component.html`, `navbar.component.ts`, `public/i18n/{en,th,zh}.json`.

Two issues in the TH|EN toggle + avatar dropdown reskin:
1. **a11y:** the `<div role="group">` wrapping the TH/EN buttons had
   `aria-label="HOME.NAVBAR.LANGUAGE_TH"` → screen readers announced the whole group as
   "Switch to Thai", which is the label for ONE button. A radiogroup/group label must describe the
   group, not a child. Added a neutral `HOME.NAVBAR.LANGUAGE_SWITCH` ("Language"/"ภาษา"/"语言") key in
   all three locales and pointed the group at it. Rule: a `role="group"` aria-label names the set, not
   a member — reuse a member's label only by accident.
2. **Dead code:** `userName` field + its `ngOnInit` assignment survived the refactor even though the
   template switched from `{{ userName }}` to `{{ userInitials }}`. Removed both. When you replace a
   bound field with a getter, grep the field name across the component's html+ts+spec and delete the
   orphan.

Note on the retained outside-click machinery: `toggleProfileDropdown` /
`handleProfileDropdownOutsideClick` (renderer `document` listen) is the old pattern; the admin
reference (`admin-layout.component.ts`) does this far more cleanly with
`@HostListener('document:click')` (close-only, `!profile.contains(target)`) plus
`@HostListener('document:keydown.escape')`. Functionally the navbar version works, but it lacks the
Escape-to-close affordance the admin topbar has — flagged to developer, not self-fixed (parity, not a
bug).

The `@ViewChild('profileDropdown', static:false)` change is CORRECT: the ref lives behind
`*ngIf="isLogin"`, so `static:true` would resolve it to `undefined`. It's only dereferenced from the
document-click handler, which can only be registered after the avatar (also behind the `*ngIf`) is
clicked — so no NPE.

## 2026-06-23 — Bookings departureTime: don't paper over a missing DTO field with `as` (self-fixed, #23)
The hotfix read departure time via `(schedule as { departureDateTime?: string })?.departureDateTime`.
The cast existed only because `AdminBookingScheduleDto` lacked the field that backend #17 now serves.
Two problems it hid:
1. Selection was `bookingSchedules?.[0] ?? journeys?.[0]` — it picks the FIRST non-null *object*, then
   reads `.departureDateTime`. If `bookingSchedules[0]` exists but has no timestamp (current SIT state),
   you get `undefined` and never fall through to `journeys[0].departureDateTime`. The `??` was at the
   wrong level (object, not field).
Fix pattern: add the real field to the DTO (`departureDateTime?`/`arrivalDateTime?` on
AdminBookingScheduleDto) and coalesce at the FIELD level:
`booking.bookingSchedules?.[0]?.departureDateTime ?? booking.journeys?.[0]?.departureDateTime ?? null`.
Rule: when a backend contract adds a field, update the typed DTO — never reach for `as { x?: T }`. The
cast disables exactly the null-safety analysis you need here.

## 2026-06-20 — Language not persisted on 5 more customer pages (self-fixed, #22)

**Files:** `switchLanguage()` in `login.component.ts`, `login-mobile.component.ts`,
`register.component.ts`, `forget-password.component.ts`, `otp-validate.component.ts`.

**Problem:** The #22 fix added `localStorage.setItem('app_language', lang)` to the
navbar's `switchLanguage()`, but five other customer-facing (unauthenticated) pages
had the identical pre-fix body — `translate.use(lang)` with no persistence. The
`authInterceptor` builds `Accept-Language` from `localStorage['app_language'] || 'th'`,
so switching language on login/register/OTP/forgot-password did NOT change the header.
These are exactly the pages that POST to the backend (login, register, send-OTP,
reset-password) and surface backend error modals — so the #22 symptom ("error stays
Thai after switching to English") reproduced there even after the navbar fix.

**Fix (pattern to learn):** When you fix a shared symptom rooted in a duplicated
method, grep the whole app for the method (`switchLanguage`) and fix every copy, not
just the one on the reported page. Root cause = N copies of the same omission. Each of
these components already *reads* `localStorage.getItem('app_language')` in ngOnInit to
seed `currentLanguage`, so the write side was simply missing — persisting also makes
the choice sticky across these pages, consistent with admin/staff layouts.

**Takeaway:** The real fix for a "duplicated logic" bug is to consider extracting a
shared `LanguageService.switch(lang)` so persistence can never drift again. Left as a
follow-up (>30 lines, new file) — see "Notes for the developer" below.

## 2026-06-20 — Sell page BUS seat map showed booked seats as free (self-fixed)

**File:** `src/app/modules/staff/pages/sell/sell-page.component.ts` — `getTakenSeats()`

**Problem:** `getTakenSeats()` was a stub that always returned `[]`. The BUS seat
component (`app-passenger-seat-bus`) has no `availableSeatNumbers` input — it only
disables seats listed in `[takenSeats]`. Because we passed an empty array, every BUS
seat (B1..B21) rendered as selectable, so a salesperson could pick a seat that was
already booked. (The VAN path was fine: it receives `[availableSeatNumbers]` and the
van component computes availability itself.)

**Fix (pattern to learn):** When reusing a presentational component, feed it the input
it actually consumes. The BUS component needs the *taken* set, so derive it as the
complement of `availableSeatNumbers` over the BUS's fixed seat universe (B1..B21, see
`passenger-seat-bus.component.html`). Match on the numeric part of each label because
`availableSeatNumbers` arrive as plain digit strings — this mirrors the VAN's
`normalizeSeatNumber()` convention. Empty `availableSeatNumbers` -> return `[]`
(don't mark everything taken).

**Takeaway:** Don't ship `// TODO`-style stubs that silently disable a safety check.
A seat picker that can't mark booked seats is worse than no picker — it invites
double-booking. Always wire the real data when the source (`availableSeatNumbers`) is
already on the DTO.

**Follow-ups for QA (not fixed here):**
- `sell-page.component.ts` has no component spec. The 5-step flow, seat-count guards,
  idempotency-key lifecycle, and walk-in payload are untested. Add coverage.
- `loadSeatMap()` fetches `getSeatMap()` then discards the result; seat availability
  comes only from the search DTO's `availableSeatNumbers`. If the search list goes
  stale, the map can drift. Consider using the seat-map response or removing the
  unused call.
- StaffModule statically imports the full PassengerInfoModule (booking/province/
  schedule effects + dropdowns) just to reuse two seat components. Safe (NgRx
  `forFeature` dedupes), but it bloats the staff lazy bundle. Consider extracting the
  seat components into a small shared module.

---

## 2026-06-20 — QA run: feature/staff-pages-salesperson-driver (FAILED)

**Verdict:** QA_FAILED — two spec deviations; unit tests all green.

**Unit tests:** `ng test --watch=false --browsers=ChromeHeadless` — 145/145 SUCCESS.
Covers StaffApiService (5 specs), BoardingListStore (4 specs), DriverSchedulesStore (3 specs),
StaffSchedulesStore (3 specs), plus all pre-existing tests (no regressions).

**Failing acceptance criteria (code-trace against spec):**

### FAIL 1: Boarding nav item absent from staff sidebar
**File:** `src/app/modules/staff/staff-layout.component.ts` — `get navItems()` lines 28–43.
**Spec requirement:** "nav built from authService roles: salesperson → [Sell, Schedules, Boarding];
driver → [My schedules, Boarding]. Dedupe Boarding by path if user has both roles."
**Actual:** salesperson gets [Sell, Schedules]; driver gets [My Schedules]. Boarding is entirely
absent from the sidebar nav. Boarding is only reachable by clicking "Boarding list" in the table
row actions on StaffSchedulesPage / DriverSchedulesPage, but there is no standalone sidebar link.
**Fix needed:** In `navItems` getter, add `{ path: 'boarding', labelKey: 'STAFF.NAV.BOARDING',
icon: 'list_alt' }` for both salesperson and driver branches. Apply dedup: if both roles are
present, push the boarding item once (check `items.some(i => i.path === 'boarding')` before push,
or add it once outside both `if` blocks when either role is present).

### FAIL 2: Main app navbar has no staff entry
**File:** `src/app/shared/components/navbar/navbar.component.ts` — line 34, 59.
**Spec requirement:** "Also surface a staff entry in the main app navbar where it shows admin entry
(navbar currently only knows isAdmin) — add isSalesperson/isDriver flags via authService.hasAnyRole."
**Actual:** `NavbarComponent` has only `isAdmin: boolean = false` (set at line 59 in the
`authStatus$` subscription). No `isSalesperson` or `isDriver`. The HTML (`navbar.component.html`
line 109) shows `*ngIf="isAdmin"` for the admin link but no staff equivalent exists.
**Fix needed:** Add `isSalesperson = false; isDriver = false;` properties; set them in the
`authStatus$` subscription alongside `isAdmin`; add a `<li *ngIf="isSalesperson || isDriver">`
routerLink="/staff" nav entry in `navbar.component.html` near the admin link.

---

## 2026-06-20 — QA re-check: commit e3b8cf7 — navigation fixes (PASSED)

**Verdict:** QA_PASSED — both prior FAIL items resolved; unit tests all green.

**Unit tests:** `ng test --watch=false --browsers=ChromeHeadless` — 154/154 SUCCESS (no regressions; 9 new tests added by the developer).

### PASS 1: Staff sidebar Boarding entry (previously FAIL 1)
**File:** `src/app/modules/staff/staff-layout.component.ts` — `get navItems()` lines 28–47.
Boarding item `{ path: 'boarding', labelKey: 'STAFF.NAV.BOARDING', icon: 'how_to_reg' }` is
pushed once outside both `if` blocks when `isSalesperson || isDriver` is true (line 42–44).
Dedup is handled by the branching: only one push regardless of roles.
Route `/staff/boarding` (param-less) exists at line 41–45 of `staff.module.ts`, ordered
before `/staff/boarding/:scheduleId` (line 46–51), both guarded with `canActivate:[AuthGuard]`
and `data.requiredRoles: ['driver','salesperson']` (lowercase). The param-less route is backed
by `BoardingEntryPageComponent`, which uses `driverSchedulesStore` for drivers
(assignedToMe=true) and `staffSchedulesStore` for salespersons (all schedules). Links to
`/staff/boarding/:id` via `router.navigate(['/staff/boarding', row.id])` on row click. Empty
state rendered when `isEmpty` is true (`!isLoading && rows.length === 0`).

### PASS 2: Main navbar staff entry (previously FAIL 2)
**File:** `src/app/shared/components/navbar/navbar.component.ts` lines 35–36 and 62–63.
`isSalesperson` and `isDriver` are declared as class properties and set in the `authStatus$`
subscription alongside `isAdmin`. `navbar.component.html` line 114 shows
`<li *ngIf="isSalesperson || isDriver">` with `[routerLink]="'/staff'"` — exactly what the
spec required.

**R0 guardrail:** Confirmed clean. Git diff of frontend feature branch shows only staff module
files + routing + i18n changed. No payment, booking, idempotency, or boarding-list core code
was modified.

**What passed (code-trace):**
- Walk-in stepper (5 steps): search → seats → passengers → booking payload (bookingChannel:'walk_in')
  → idempotency key stable on retry (generate in goToStep('payment'), kept across pay() retries)
  → e-ticket dispatch + navigate.
- Cash-only payment: static "Cash" badge, no method selector, payWalkIn sends `paymentMethod:'cash'`.
- BUS seat takenSeats computed as complement of availableSeatNumbers (scrutinize fix applied).
- VAN seat: availableSeatNumbers bound directly.
- Invalid form: markAllAsTouched + alertService.warning (FORM_INVALID, SEAT_COUNT_MISMATCH).
- Schedules CRUD: optimistic modal open + GET patch (pristine-only), mutate+refresh on delete.
- No fetch-in-ngOnInit: all three stores call store.refresh() from ngOnInit (not fetch directly).
- Driver page: assignedToMe=true via getMySchedules(), empty→empty-state (not error).
- Boarding check-in: optimistic mutate → POST → revert on error + alertService.error; store.refresh on success.
- BoardingListStore.setScheduleId() calls clear() when id changes (root-scoped store reset).
- Routes: each child has canActivate:[AuthGuard] + data.requiredRoles lowercase. Parent /staff route
  has requiredRoles:['driver','salesperson']. AuthGuard checks hasAnyRole.
- i18n STAFF keys: present in en.json, th.json, zh.json (changed files include all three).

## 2026-06-24 — Bare /staff redirect: regression test didn't lock the bug (self-fixed, #30)

**Files:** `staff-routing.spec.ts` (rewritten), `staff.module.ts`, `passenger-info.module.ts`
(exported the previously module-local `routes` consts as `staffRoutes` / `passengerInfoRoutes`).

The fix itself (extracting `PassengerSeatModule` so `StaffModule` no longer imports
`PassengerInfoModule`) was correct and resolves the root cause. The problem was the **regression
test**: it hand-rolled a *stub* `staffRoutes` table that simply omitted the leaking passenger-info
empty-path route, and never imported the real `StaffModule` / `PassengerInfoModule`. A stub that
mirrors the desired routes proves nothing — it passes identically with the bug present, because the
bug lived in NgModule import *composition* (Angular flattening a child module's
`RouterModule.forChild` routes into the lazy context), not in any literal route array the stub copied.
The trivial `StaffLayoutComponent !== PassengerInfoComponent` "structural guard" was always true and
unrelated to the bug.

**What I changed:** the spec now asserts against the **real exported route arrays** and the **real
compiled module import graph** (walking `StaffModule.ɵinj.imports`). The decisive assertion —
`StaffModule must not import PassengerInfoModule` — was verified to FAIL when the fix is reverted
(re-adding the `PassengerInfoModule` import) and PASS with the fix in place. That is what "locks the
regression" means.

**Rule:** a regression test must consume the *real* artifact the bug lives in, not a parallel
hand-authored copy of the intended state. Before trusting a regression test, revert the fix and
confirm the test goes red. If it stays green against the buggy code, it tests nothing. When the bug
is in module wiring, assert on the module's actual metadata/route exports — export the `const` if you
must — rather than re-declaring stub routes.

---

## navbar mobile hamburger — a single `@ViewChild` cannot identify a template rendered twice

**Bug (caught in scrutinize, self-fixed):** The language switcher was extracted into one
`<ng-template #langSwitcher>` and rendered via `*ngTemplateOutlet` into BOTH the desktop bar and the
mobile panel. The trigger button carried a `#langDropdown` template-ref read by
`@ViewChild('langDropdown')`, and `handleLangDropdownOutsideClick` used
`this.langDropdown.nativeElement.contains(target)` as its "clicked the trigger?" guard.

When both outlets are in the DOM (mobile panel open — note the desktop copy is only `display:none`,
still present), a single-element `@ViewChild` resolves to the **first** match = the hidden desktop
trigger. The same click that opened the menu from the **mobile** trigger then failed
`desktopTrigger.contains(mobileTrigger)` → the guard's else-branch slammed the menu shut. Net effect:
the language dropdown was impossible to open on mobile. The header comment claiming "@ViewChild
resolves the LAST instance, so it's safe" was wrong on two counts (it's the first, and one ref can
never represent two elements).

**Why the new tests missed it:** they set `isLangDropdownOpen = true` by hand instead of calling
`toggleLangDropdown()`, so the same-click guard was never exercised. A test that drives the real
toggle path with the mobile trigger as the event target fails on the old code.

**Fix:** drop the `@ViewChild`/template-ref entirely; match the trigger by class with
`(event.target as HTMLElement).closest('.navbar-lang-dropdown')`. Class matching is correct for N
instances of the same template.

**Rule:** when a template (or `ng-template`/`*ngTemplateOutlet`) is instantiated more than once in a
component, do NOT identify its elements with a single `@ViewChild`/template-ref — it silently binds to
one instance. Use a class/`closest()` check, `@ViewChildren` (QueryList), or event delegation. And a
dropdown's "outside click" regression test must call the real `toggle*()` and feed the guard the
actual clicked element, not pre-set the open flag.


## 2026-06-25 — QA re-check: feature/trip-details-edit defect fix (PASSED)

**Verdict:** QA_PASSED — defect resolved; all tests green; merges complete.

**Fix verified (commit 66b00e2):** walk-in-center-panel.component.ts lines 331-332 now read
(err as HttpErrorResponse)?.error?.errorCode and compare with === 'SCHEDULE_ERROR_CAPACITY_EXCEEDS_TYPE_MAX'
/ 'SCHEDULE_ERROR_CAPACITY_BELOW_OCCUPIED'. Inline capacityInlineError now fires correctly for
server-side 400 capacity responses. ng test: 335 passing.

**E2E results (post-fix):**
- New spec (trip-details-edit.spec.ts): 9/9 PASSED
  - AC-11 server-side path (test 4): PUT mock returns errorCode=SCHEDULE_ERROR_CAPACITY_EXCEEDS_TYPE_MAX;
    edit form remains visible without crash (test passes; behavior logs inline error rendered correctly)
- Regression (staff-sell-walkin + admin-critical-paths + b2c-critical-path): 34/34 PASSED

**Backend unit tests:** 651/651 PASSED (confirmed from prior run; no BE changes in fix commit)

**Merge status:**
- Frontend: merged feature/trip-details-edit → dev (merge SHA 0ddc7bc in OBRS-frontend)
- Backend: merged feature/trip-details-edit → dev (merge SHA cef8a8a in OBRS-backend)
- Neither repo pushed (per QA protocol)


## 2026-06-26 — Scrutinize: sit/title-prefix-chinese (issue #69) — SELF_FIXED

**Self-fix (register.component.ts):** The zh title-prefix fix wired `localizedDropdownName`
into the three forms that consume the shared `TITLE_OPTIONS` constant (walk-in-checkout,
passenger-info-form, booker-info-form), but `register.component.ts` carried its OWN inline
copy of the title array WITHOUT `nameChinese`. Since the register title dropdown renders via
`app-dropdown-obrs` → `getValue` → `localizedDropdownName`, zh fell back to nameEnglish there —
the same bug #69, just on a fourth dropdown the fix missed.

Replaced the 48-line duplicate array with `titleOptions: Dropdown[] = [...TITLE_OPTIONS];`
(+ import of TITLE_OPTIONS). The inline array was byte-identical to TITLE_OPTIONS, and
`resolveTitleName` only reads id/nameThai/nameEnglish (all still present), so this is a safe
drop-in that closes the zh gap on registration and removes the duplication.

**Pattern for next time:** when localizing a shared option list, grep for *all* render sites
of that list — duplicated/hardcoded copies of a shared constant won't inherit the new field.
Prefer `[...SHARED_CONSTANT]` over re-declaring the array per component.

---

## Scrutinize self-fix: global error alert double-toast on new auth HTTP calls (ao/google-signin-email-verify)

`loginWithGoogle()` / `verifyEmail()` / `resendVerification()` in `auth.service.ts` were posting
WITHOUT the `SKIP_GLOBAL_ERROR_ALERT` HttpContext token. Because the global `errorInterceptor`
(registered in `app.module.ts` via `withInterceptors([authInterceptor, errorInterceptor])`) fires
`alertService.error(extractApiErrorMessage(...))` on every `/api/` error, and these components then
ALSO show their own errorCode-mapped alert (or, for verify-email, an inline "failed" panel), the user
saw TWO error surfaces — a generic interceptor toast plus the specific one. For verify-email this even
fired a toast on `VERIFICATION_TOKEN_ALREADY_USED`, which the component intentionally treats as success.

Fix: added `{ context: new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true) }` to all three posts —
the same opt-out convention already used by booking/admin/staff/route-map/usability-report services
that do their own inline error handling.

**Pattern for next time:** any service method whose call-sites branch on `error.error.errorCode` and
render their own alert/inline error MUST opt out of the global error alert with `SKIP_GLOBAL_ERROR_ALERT`,
otherwise you get a double-toast. The existing `callLogin` avoids this only because it swallows the error
(returns `err`) and the component never re-alerts — that is NOT the pattern to copy for errorCode-branching flows.

---

## Scrutinize self-fix — admin-unlock-account (ao/admin-unlock-account, base commit 0a83175)

**What I changed:** `user-management-page.component.ts` `confirmUnlock()` error branch.
The original read `errorCode` via typed cast and fed it into
`this.translate.instant(errorCode ? 'ADMIN.MESSAGES.UNLOCK_FAILED' : 'ADMIN.MESSAGES.UNLOCK_FAILED')`
— a vacuous ternary whose two branches are identical, plus a now-unused `errorCode` read.
Collapsed to a single controlled key:
`this.alertService.error(this.translate.instant('ADMIN.MESSAGES.UNLOCK_FAILED'))`.

**Why it matters:** a ternary with identical branches is dead/misleading code — it implies
two outcomes when there is one. AC7's intent (a controlled i18n key, NOT
`extractApiErrorMessage`) is still fully satisfied. AC7 said "branch on error.error.errorCode",
but the spec defines a single failure key, so there is genuinely nothing to branch on — the
typed access served no purpose.

**Pattern for next time:** don't scaffold a `cond ? A : B` when A === B "for future error codes".
Wire the branch only when a second key actually exists; otherwise it reads as an unfinished TODO.
If distinct backend errorCodes (e.g. USER_NOT_LOCKED) later need distinct messages, reintroduce
the typed read + a real branch at that point. tsc --noEmit stays clean (0) after the change.

**QA follow-up (this session):** the Thai-locale i18n E2E test (`AC7-i18n-th`) initially
clicked `page.locator('button[aria-label]').first()` on the whole page, which matched the
sidebar's menu-toggle button (also aria-labelled, rendered before the table) instead of the
row's Unlock button — the confirm dialog never opened, and the test timed out. Scoped the
click to the locked row instead. Also confirmed the shared `node_modules` environment
(broken by an earlier QA run's stray `npm install` outside its worktree) was repaired via
`npm ci`; all 607 unit tests and all 7 Playwright E2E specs in `admin-unlock-account.spec.ts`
pass clean.

---

## OBRS-110 change-seat — Scrutinize self-fix: i18n key placed OUTSIDE its ERROR block

**What I changed:** In all three locale files (`public/i18n/{en,th,zh}.json`), the
`CHANGE_SEAT.NO_SEATS` string was defined at the *top level* of `MY_BOOKINGS.CHANGE_SEAT`,
but `change-seat-error.ts` maps `CHANGE_SEAT_ERROR_NO_SEATS → MY_BOOKINGS.CHANGE_SEAT.ERROR.NO_SEATS`.
So `translate.instant('...ERROR.NO_SEATS')` resolved to `undefined` and the confirm banner
would render the raw key `MY_BOOKINGS.CHANGE_SEAT.ERROR.NO_SEATS` to the user. I moved the
already-translated string into the `ERROR` block (next to `SEAT_UNAVAILABLE`) in all three files.

**Why it matters:** NO_SEATS is a RETURN_TO_MAP confirm error — the exact OBRS-83 lesson path.
A raw i18n key on that banner is precisely the "looks broken to the user" failure the ticket
called out. Unit tests did NOT catch it because `TranslateModule.forRoot()` with no loaded
translations returns the key for BOTH a correct-but-untranslated key and a missing key — so
`expect(...).toBe('MY_BOOKINGS.CHANGE_SEAT.ERROR.NO_SEATS')` passes either way.

**Pattern for next time:** when adding an error-code→i18n map, verify each target key path
against the actual JSON nesting, not just that *some* key with that leaf name exists. A quick
`node -e "require('./en.json').MY_BOOKINGS.CHANGE_SEAT.ERROR.NO_SEATS"` per locale catches
misplacement that key-presence greps and unit tests both miss.

---

## OBRS-96 QA (local-BE + local-FE against live SIT Supabase, 2026-07-10)

**Setup that worked:** ran the backend worktree locally with `-Dspring-boot.run.profiles=sit`
plus manually-exported env vars (DB_PASSWORD from `secrets.local.env`, TICKET_TOKEN_SECRET_KEY
from the task brief, JWT/SendGrid/Omise/ThaiBulkSMS/Google values copied from the main clone's
gitignored `application-local.yml`) — booted on port 8080 against the real SIT Supabase. FE
served via bare `ng serve --port <random>` (NOT `npx playwright test`, whose own `webServer`
tries `ng serve --configuration sit` on :4200 and fails — `environment.local.ts` doesn't exist
in a fresh worktree, only the `.example`). `environment.base.ts`'s default `apiUrl` is
`localhost:8000` but the backend's real default port is `8080` (docker-compose remaps to 8000,
plain `mvn`/`spring-boot:run` does not) — edited `apiUrl` to 8080 for this run only, reverted
after.

**Real bug found — `boardedAt: null` in the boarding-scan success response:**
`TicketRepository.updateBoardedByIdIfConfirmed` is a native `@Modifying` bulk UPDATE with no
`clearAutomatically`/`flushAutomatically`. `TicketService.boardingScan` loads the `Ticket` via
`findById` BEFORE the bulk update (to check `scheduleId`/status), so it's already in the
persistence-context L1 cache; the immediately-following `findById` after the update returns the
SAME stale managed instance instead of re-querying, so `boarded.getBoardedAt()` is `null` in the
response even though the DB row is correctly stamped (verified directly via psql — `boarded_at`
and `boarded_by` both set correctly). Reproduced twice (tickets 74 and 75, salesperson's own
seed bookings on schedule 10 / today). Real user impact: `boarding-list-page.component.ts:187`
merges `result.boardedAt` straight into the on-page row, so the just-scanned passenger's row
shows a blank boarded-at until the list is refreshed/reloaded (a fresh GET re-queries and gets
the right value). Fix would be `ticketRepository.flush()` + `entityManager.clear()` (or
`@Modifying(clearAutomatically = true)`) between the update and the re-fetch in
`TicketService.boardingScan`.

**Confirmed via direct API (curl) against local-BE/live-SIT-DB, all matching contract:**
happy-path scan 200 (passenger name + seat correct, boardedAt bug above), ALREADY_BOARDED 409,
WRONG_SCHEDULE_TICKET 400, INVALID_TICKET_TOKEN 400, TICKET_NOT_CONFIRMED 409 (via real
cancel-booking API on a sacrificial salesperson-owned booking, not raw SQL), customer role on
`/boarding-scan` → 403 ACCESS_DENIED. Critically: **garbage/tampered token returns 400, never
401** — the OBRS-187 regression guard holds at the API layer, and live-browser-confirmed too
(staff stayed on `/staff/boarding/10`, no forced logout, after scanning a garbage token).

**Scope correction — don't confuse the pre-existing `my-booking-ticket-modal` /
`app-e-ticket-card` (My Bookings' "View e-ticket" action) with the actual OBRS-96 feature.**
That modal is untouched by this branch (`git diff dev...HEAD --stat` confirms) and still passes
ONE comma-joined `ticketNumber` string for the whole booking into a single QR — that is NOT a
regression, it's just the wrong component to test. The real per-ticket QR lives in
`e-ticket.component.html`'s `*ngFor="let passenger of passengers"` block, one `.ticket-card`
per ticket with its own `passenger.qrDataUrl`/`ticketNumber`, and a `qrCardPlaceholder` template
for `qrUnavailable` tickets (confirmed by source read) — but this page's `bookingId` comes from
NgRx state set by `invokeSetBookingApi` during the live checkout/payment-result flow with NO
localStorage persistence (`booking.effect.ts`'s `getBooking$` just echoes current store state,
no HTTP call) — it cannot be deep-linked directly; reaching it live requires driving the full
booking→payment flow. Did NOT complete that live within the 45-min box; verified structurally
via source instead (see report). If a future session needs to live-verify this exact page,
budget for the full search→seats→passenger-info→payment→e-ticket flow (see
`obrs-booking-flow-playwright-capture` memory) rather than trying to reach it from
"My Bookings".

**`mapBoardingScanErrorCode`/`boardingScanErrorSeverity`/`boardingScanErrorIcon`
(`boarding-scan-error.ts`) branch strictly on `error.error.errorCode`, never message text** —
confirmed by source read, matches the live errorCodes observed above exactly (INVALID_TICKET_TOKEN,
WRONG_SCHEDULE_TICKET, TICKET_NOT_CONFIRMED, ALREADY_BOARDED, plus EXPIRED_TICKET_TOKEN /
BOARDING_WINDOW_NOT_OPEN which are time-dependent and not live-tested here — covered by BE unit
tests per the task brief).

---

## OBRS-96 QA re-verify after the boardedAt fix (2026-07-10, second pass)

**Both gaps from the first pass closed, live:**

1. **boardedAt fix confirmed** (backend commit `20cc56f`, `@Modifying(clearAutomatically=true,
   flushAutomatically=true)`): scanned a fresh ticket (id 81) via curl — response now returns
   `"boardedAt":"2026-07-10T13:27:34..."` instead of `null`. Live-confirmed in the browser too:
   scanned ticket 82 on the staff boarding-list page and the row showed `เช็คอินแล้ว` +
   `เวลาขึ้นรถ: 13:28` **immediately, with no page reload** — screenshot
   `05-scan-success-boardedAt-no-reload.png`.

2. **Live-rendered the actual OBRS-96 per-ticket QR e-ticket page** (the headline feature, only
   structurally verified in the first pass). Drove the full real booking flow as
   `customer@system.local`: home search (หนองชาก → BTS หมอชิต, 2 adults) → seat selection (2
   distinct seats, one per passenger, via the `.card-container.mt-3` per-passenger seat-van maps)
   → passenger-info (booker + `useBookerInfo` copy for passenger 1, manual fill for passenger 2)
   → payment with Omise test card `4242 4242 4242 4242` → landed on `/e-ticket`. Result: **2
   passengers → 2 distinct QR codes**, each with its own `ticketNumber` (`T-2SPNB7S72Q` seat 6 /
   `T-EES6CLCAHN` seat 7), passenger name, and a download button — screenshot
   `06-e-ticket-page-HEADLINE.png`. Confirmed the QR encodes the real signed **boardingToken**
   (not the ticket number) by re-fetching a token for the just-booked ticket 102 and scanning it
   at the boarding-list endpoint — round-tripped correctly (see below).

**Bonus finding — `BOARDING_WINDOW_NOT_OPEN` verified live** (was deferred as time-dependent in
the first pass): the just-booked ticket 102 departs 2026-07-18 (today is 2026-07-10); scanning
its real token on its real `scheduleId` (11) correctly rejected with 400
`BOARDING_WINDOW_NOT_OPEN` ("Boarding is only allowed on the day of departure") rather than
boarding it early.

**Automation gotchas hit driving the full booking flow (useful for next time):**
- **Seat inventory depletion across retries**: each abandoned/failed script attempt still
  reserves seats on that schedule (no visible release), so repeated runs against the SAME
  schedule burn through its free-seat count fast (schedule 10 today went from 7→0 free across a
  few attempts; schedule 7 (2026-07-17) similarly). Pick a schedule with a healthy taken/free
  ratio first — query `select count(*) from tickets where schedule_id=X and status in
  (confirmed,checked_in,reserved)` vs. capacity — and expect to burn a few seats per debugging
  iteration. Schedule 11 (2026-07-18) had only 3/13 taken and absorbed the successful run fine.
- **Passenger seat maps**: `.card-container.mt-3` on the passenger-info page is NOT 1:1 with
  passengers — index 0 is the booker card, index 1/2 are passenger 0/1's own seat-van maps.
  Scope `.seat-box:not(.disabled)` inside the right card, re-querying live (not cached) right
  before each click, since taking a seat in one map disables it in the other (shared inventory).
- **The credit-card `p-calendar` (`view="month"`, `inputId="templatedisplay"`) resisted every
  Playwright UI approach** (`#templatedisplay` click reported "element is not enabled"; the
  panel's month cells were empty/unmatchable). Fastest reliable workaround: patch the Angular
  reactive form directly via the dev-build's `window.ng.getComponent(...)` devtools API —
  `ng.getComponent(document.querySelector('app-payment-creditcard')).creditCardForm.patchValue({expireDate: new Date(2027,11,1)})`
  — then `markAsDirty()`/`updateValueAndValidity()`. This still exercises the REAL Omise
  tokenization + real backend payment call + real e-ticket render; only the calendar-click UI
  mechanic is bypassed. Legitimate for E2E capture, not for asserting the calendar widget itself
  works (that's out of scope for a payment-flow smoke test).
- **`FRONTEND_URL` env var on the local backend MUST match the FE's actual serve port** — Omise's
  card 3DS flow (`.../authorize` → `.../complete`) redirects the real browser back to
  `${app.frontend-url}/payment/result`; if `FRONTEND_URL` is stale (e.g. left at `:4200` from a
  previous session while the FE is actually on a fresh random port like `:4267`), the post-3DS
  redirect hits `ERR_CONNECTION_REFUSED` and the flow never reaches `/e-ticket`. Always set
  `FRONTEND_URL` to the exact port the FE was just started on for this session, not a
  remembered/default one.
- The `.p-monthpicker`/`.p-datepicker-calendar` selectors from the pre-existing booking-flow
  memory note (departure-date picker) worked fine as documented; it was specifically the credit
  card's `view="month"` variant that was unreliable to automate.

## 2026-07-10 — QA verification: OBRS-130 staff pre-departure boarding management

Verified LOCAL frontend (`ao/obrs-130-boarding`, this worktree, served on a fresh port against
a **local backend**, not Koyeb SIT — the new `/board`/`/unboard` endpoints aren't deployed yet)
paired with `OBRS-backend-wt-obrs-130-boarding` (branch `ao/obrs-130-boarding`) booted locally
with `spring.profiles.active=sit` (real SIT Supabase), `TICKET_TOKEN_SECRET_KEY` given by the
task + a locally-generated `JWT_SECRET_KEY` (any valid HS256 secret works — it only needs to be
internally consistent for this process's own sign/verify, not match Koyeb's). Real SIT data
found for the manifest: `scheduleId=10` (Chonburi-Bangkok, today) already had 6 confirmed
tickets (mixed boarded/not-boarded) from prior QA/dev sessions — no fresh booking-flow seeding
needed.

**Confirmed via curl (API) + Playwright (browser) against the real local stack:**
- Sell page Tab-3 ("ขึ้นรถ"/Boarding) renders the manifest **inline** — clicking the tab keeps
  the URL at `/staff/sell` (no navigation).
- Manifest columns: ticket #, seat, passenger, pickup stop, dropoff stop, a separate **Status**
  column (`สถานะ` = ticket lifecycle, e.g. "ยืนยันแล้ว"/Confirmed) AND a **Boarded** column
  (`ขึ้นรถแล้ว`/`ยังไม่ขึ้นรถ` with check-circle vs. empty-circle icon) — confirmed distinct,
  matches spec. Boarded rows show the audit sub-line `เวลาขึ้นรถ: HH:mm · บันทึกโดย: <name>`.
- Board → duplicate board → `409 ALREADY_BOARDED`. Unboard → duplicate unboard →
  `409 NOT_BOARDED`. Re-board after unboard produces a **fresh** `boardedAt` (verified two
  different timestamps on the same ticket across unboard/re-board) — no stale state.
- `boardedByName` attribution: boarded as `salesperson@system.local`, then re-fetched the same
  manifest as `admin@system.local` — still attributed to "Ms. Sales Person" (the real boarder),
  not "Mr. Admin Admin" (the viewer). Misattribution guard holds at the API level.
- Un-board is SALESPERSON-only server-side: driver token → `403 ACCESS_DENIED` on `/unboard`
  regardless of the ticket's boarded state (the `@PreAuthorize` gate rejects before the service
  layer even runs). Driver's own boarding page (`/staff/boarding/:scheduleId`) renders the full
  manifest + scan box + Board button but **zero** Un-board affordance anywhere in the DOM
  (`grep`'d the rendered body text for "ยกเลิกขึ้นรถ"/"Un-board" — zero matches).
  Screenshot: `qa-obrs-130-screenshots/11-driver-boarding-page.png`.
- i18n: `en.json`/`th.json`/`zh.json` all carry the full `STAFF.BOARDING.*` key set (`BOARDED`,
  `NOT_BOARDED`, `BOARDED_AT`, `BOARDED_BY`, `UNBOARD_*`, `ALREADY_BOARDED`, `NOT_BOARDED` error
  strings) — verified by direct key inspection in all three files; live browser-switch to
  ZH wasn't exercised this pass (ran out of time-box) but the TH default render was live-verified
  end-to-end with correct strings throughout.
- 409-no-forced-logout (OBRS-187 regression): confirmed at the code level, not just by
  observation — `auth.interceptor.ts` only force-logs-out on `error?.status === 401`, so a `409`
  (both `ALREADY_BOARDED` and `NOT_BOARDED`) can never trip it, full stop.

**One non-bug worth flagging for future readers (already anticipated in the code comment at
`boarding-list.component.ts` `board()`, ~line 140-144):** immediately after a successful Board
click, the row's "boarded by" optimistically shows `authService.getUsername()` — which in this
build returns the **raw email** (e.g. `salesperson@system.local`), not the formatted display
name ("Ms. Sales Person") the backend returns. It self-corrects within one `store.refresh()`
cycle (confirmed: reloading/re-navigating to Tab-3 immediately after shows the correct full
name). This IS the intended, commented tradeoff — not a defect — but it's a real few-hundred-ms
window where the row's format is visibly inconsistent with every other row if a screenshot or a
fast-clicking operator catches it mid-flight. Did not block QA; noting for anyone who sees it in
a future capture and wonders if it's the misattribution bug reappearing (it isn't — that one
is the *stale value across different viewers* case, which IS correct; this is a *this-operator,
this-instant* cosmetic-only optimistic-UI artifact).

**Residual gap (not exercised, disclosed rather than declared done):** driver-role **successful**
Board click wasn't captured end-to-end — the only driver-assigned schedule in SIT seed data
(`scheduleId=1`) departs 2026-12-20, outside the "boarding is only allowed on the day of
departure" window (`400 BOARDING_WINDOW_NOT_OPEN`), and `scheduleId=10` (today, has confirmed
tickets) has no `driver_id` assigned (`403` "not authorized to access this ticket"). Confirmed
the *authorization* boundary (driver reaches the service layer, correctly blocked by legitimate
business rules, not a blanket permission wall) but not a full driver board-success round-trip.
Would need either a schedule with both `driver_id` set AND `departure_date_time` = today in SIT
seed data, or a live DB write to create one — didn't do the latter to avoid mutating shared SIT
state beyond what the QA pass itself needed.

## OBRS-185 scrutinize self-fix (2026-07-10)
- Consolidation added `COMMON.CALENDAR_ICON_ALT` and used it for the 12 new inline
  calendar-icon instances, but left 5 pre-existing `alt="Calendar Icon"` hardcoded
  strings on the img tags it was ALREADY editing (home-booking x2, schedule-booking-filter
  x2, walk-in-trip-browser x1). Scrutinize replaced them with
  `[attr.alt]="'COMMON.CALENDAR_ICON_ALT' | translate"` for i18n consistency (CLAUDE.md:
  no hardcoded strings). Pattern: when you introduce an i18n key for a repeated string,
  retrofit every instance you touch in the same diff — don't half-migrate.
- Left the credit-card expiry picker (`payment-creditcard`, view="month", mm/yy) OUT of the
  date-field consolidation on purpose: it is a month-only control, not a day-grid date field,
  so the 280px day-panel + pill styling would not fit. Its `.calendar-icon` /
  `payment-card-calendar-panel` classes are component-scoped and unaffected by the deletions.

## 2026-07-11 — OBRS-138 FE delta: authoritative pickup→dropoff distance/duration estimates

Worktree `OBRS-frontend-wt-obrs-138-distance-estimation` @ branch `ao/obrs-138-distance-estimation`.
Frontend-only half of a card built in parallel with the backend (the live `OBRS-backend` clone at
the time of this work did **not** yet have `StopEntry.offsetMinutesFromOrigin` or
`ScheduleSearchRespDto.routeSlug` — both are passthrough interface fields here, so the FE compiles
and tests green today and picks the real values up automatically once the backend lands them; no
FE redeploy needed for that half of the contract).

- **Replaced the client-side proxy ratio** in `RouteTravelSummaryComponent`
  (`src/app/modules/home/components/route-map/route-travel-summary/`) with the direct authoritative
  delta: `distanceKm = |Δ distanceKmFromOrigin|`, a NEW single-value duration key
  (`HOME.ROUTE_MAP.SUMMARY_DURATION_SEGMENT`) from `|Δ offsetMinutesFromOrigin|`, replacing the
  old ratio-projected min/max range for a resolved segment. Distance and duration fall back
  **independently** now (two separate source fields, not one shared ratio) — deleted `@Input()
  routeSpanKm`, the `segmentRatio` getter, and `route-map-home.component.ts`'s `routeSpanKm` getter
  entirely; also deleted a stale comment on `distanceKmFromOrigin` that called it an "offset-derived
  proxy" — Scrutinize (SA-side, prior card) had already confirmed it's a real km value, and the new
  |Δ| is strictly more accurate than the old ratio projection.
- **New shared helper `tripEstimateFromStops(pickup, dropoff)`** in `src/app/shared/lib/trip-format.ts`
  — the single place every consumer (schedule-booking-list row chips, review-schedule-booking-summary
  per-leg chips) computes the estimate. Each figure (`distanceKm`/`durationMinutes`) resolves
  independently; a missing source value on either stop yields `null` for that one figure, never a
  fabricated `0`.
- **New `RouteMapService.getPickupDropoffCached(slug)`** — session-scoped in-memory
  `Map<slug, Observable>` + `shareReplay({ refCount: false })` + `catchError(() => of(null))`, so N
  schedule rows on the same route fire one HTTP call and a failure just means the chip stays absent
  (no `AlertService`). Documented in the README as a reusable request-dedup pattern, distinct from
  the map panel's persisted two-tier Directions cache.
- **The return-leg swap (load-bearing, easy to get backwards):** a return schedule's `routeSlug` is
  the *reverse* physical route — its `pickup[]` holds the destination-city stops, `dropoff[]` holds
  the origin-city stops. Both `schedule-booking-list.component.ts` (`resolveLegEstimates`) and
  `review-schedule-booking-summary.component.ts` (`findTripEstimate`) resolve `fromSlug`/`toSlug`
  once from the search filter's `startStationId`/`stopStationId`, then swap which slug is searched
  in `pickup[]` vs `dropoff[]` **only** for the return leg (`pickupSlug = toSlug`, `dropoffSlug =
  fromSlug`). Verified via a unit test with a synthetic reverse-route fixture in both components'
  specs (`resolves the return leg estimate with the pickup/dropoff swap`) — searching unswapped
  would silently empty every return-leg chip (`.find()` never matches) with no error surfaced
  anywhere, so this is the single riskiest line in the diff.
- **Slug-space check (explicit ask from the UX spec, done rather than assumed):** confirmed
  `StationApi.slug` (`GET /api/stops`, fed into the schedule-filter's station store) and
  `StopEntry.slug` (`GET /api/routes/{slug}/pickup-dropoff`) key off the same underlying
  `stops.slug` column server-side per `../OBRS-backend/docs/api/catalog.md` ("every stop slug in
  pickup/dropoff also appears in the province/stops feed") — so a direct slug match (no translation
  layer) is correct. Matched on `StationApi.slug` via new private `stationSlugById()` helpers
  (mirroring the existing `getStationLabelById()` pattern) in both consumer components.
- **Deliberately did NOT touch** the pre-existing unswapped station-*label* lookup in
  `review-schedule-booking-summary.component.html`'s return card (`findStationById(startStationId)`/
  `findStationById(stopStationId)` around what were originally lines 260/305) — that's a separate,
  already-flagged, out-of-scope bug; this card's own estimate chip resolver applies the correct
  swap regardless of that unrelated label bug.
- Added `HOME.ROUTE_MAP.SUMMARY_DURATION_SEGMENT`, `SCHEDULE_BOOKING.ESTIMATE_KM_UNIT`/
  `ESTIMATE_MIN_UNIT`, `REVIEW_SCHEDULE_BOOKING.SUMMARY.ESTIMATE_KM_UNIT`/`ESTIMATE_MIN_UNIT` to all
  three locale files in the same commit; `≈`/`·` are literal punctuation (matches the existing
  `|`-separator precedent in schedule-booking-list), not i18n keys.
- `ng test --watch=false --browsers ChromeHeadless`: 1196/1196 green. `ng build --configuration
  production`: clean (1.48 MB initial, under the 1.5 MB warning budget). `npx tsc --noEmit -p
  tsconfig.app.json`: clean. No NgRx changes — plain service memoization per the spec.

## Scrutinize self-fix (OBRS-138) — DRY consolidation of `stationSlugById`
- The commit introduced a byte-identical private `stationSlugById(stationId, stationList)`
  in BOTH `schedule-booking-list.component.ts` and `review-schedule-booking-summary.component.ts`
  (a net-new fork in the same commit). There is an established shared-helper home in
  `shared/interfaces/station.interface.ts` (`getStationFallbackLabel`, `getStationTranslationLabel`).
- Fix: extracted the logic once as exported `getStationSlugById(stationId, stationList)` in
  `station.interface.ts`; both components now import and call it, private copies deleted.
- Pattern for next time: a helper that resolves a station field by id belongs beside the other
  `getStation*` functions in `station.interface.ts` — grep there BEFORE adding a private copy.
  (The pre-existing `getStationLabelById` duplication across e-ticket/payment-info/schedule-booking-list
  is older tech debt, left out of this scope.)
- Verified: `npx tsc --noEmit -p tsconfig.app.json` clean after the change; no spec referenced
  the private method (public behavior unchanged).

---

## OBRS-100 scrutinize self-fix — global @media print rule blank-printed the whole app

**Bug (caught in review, shipped past 1149 passing tests + prod build):** the print-isolation
CSS added to `admin-theme.scss` (a GLOBAL stylesheet via `styles.scss`) used an *unconditional*
rule:

```scss
@media print {
  body > *:not(.boarding-manifest-print-portal) { display: none !important; }
}
```

`<app-root>` is the only `body` child (`index.html`). The manifest portal only exists while
`printManifest()` is running. So a **native Ctrl+P on ANY page in the app** (dashboard, bookings,
reports — anywhere) matched `body > app-root` and hid it → **blank print output app-wide**, not
just on the boarding page. Component tests never exercise real `@media print`, so it passed CI.

**Why it's a trap:** the reviewer prompt flagged "@media print placement" expecting the classic
*component-scoped-won't-match-a-body-portal* mistake. The dev correctly made it global — but a
global print rule must be **conditionally armed**, never left hiding-everything unconditionally.

**Fix (self-applied, <30 lines, no new files):** gate the rule on a `body.boarding-manifest-printing`
marker class that `printManifest()` adds and `disposePrintPortal()` removes:

```scss
@media print {
  body.boarding-manifest-printing > *:not(.boarding-manifest-print-portal) { display:none !important; }
  body.boarding-manifest-printing   .boarding-manifest-print-portal        { display:block !important; }
}
```

+ `document.body.classList.add('boarding-manifest-printing')` in `printManifest()`,
`.remove(...)` in the idempotent `disposePrintPortal()`, spec assertions that the gate arms on
print and disarms on teardown, and afterEach class cleanup. 25/25 boarding-list specs pass.

**Pattern for next time:** any GLOBAL `@media print` "hide everything except X" rule MUST be
scoped to a runtime-toggled body/html class, so it is inert unless that specific print was
explicitly invoked. An unconditional global print rule is a whole-app regression.
## OBRS-196 scrutinize (settlements) — 2026-07-11
- Self-fixed a STALE DOC COMMENT in `settlements.store.ts` class JSDoc: it still
  said the cache backed `/admin/settlements/pending`, but the whole post-merge
  reconciliation (commit 26f9b17) had moved the endpoint to
  `/api/private/settlements/pending` (no `/admin/` segment — the controller is
  `hasRole('OWNER')`, ADMIN inherits via role hierarchy). Comment now names the
  real path. Pattern: when a reconciliation changes a URL/contract, grep the
  matching store/service JSDoc for the OLD path — code was correct, only the
  doc lied.

## OBRS-229 seat-scarcity display (schedule-booking list)
- Goal: stop always exposing the exact remaining-seat count on the search-results page. New pure
  classifier `getSeatAvailabilityStatus(availableSeats, threshold)` in `shared/lib/trip-format.ts`
  (same file as the other trip-row formatters) buckets into `'sold-out'` (`<= 0`/missing),
  `'low'` (`<= threshold`, inclusive), `'available'`. `ScheduleBookingListComponent` wraps it with
  `LOW_SEAT_THRESHOLD = 5` via `seatStatus(availableSeats)`; both legs (departure/return) call the
  same method — no duplicated bucket logic.
- Template: an `[ngSwitch]` over `seatStatus(...)` in the `.availability` block, identical shape on
  both legs — `SEAT_FULL` (sold-out), `SEAT_REMAIN {n} SEAT_UNIT` (low — the only branch that shows
  the raw number, reusing the pre-existing `SEAT_REMAIN`/`SEAT_UNIT` keys unchanged), `SEAT_AVAILABLE`
  (available, no number).
- **Fixed a real dead-code bug while wiring the disabled state**: the existing
  `[class.select-btn-diabled]="departureList.length === 0"` (and the return-leg equivalent) sat
  inside the `*ngFor` over that same list — a rendered row's list can never have `length === 0`, so
  sold-out styling could never actually fire and the button stayed clickable. Rewired to the
  per-row `departure.availableSeats === 0` / `return.availableSeats === 0` and added a native
  `[disabled]` binding alongside it (kept the existing typo'd class name `select-btn-diabled`
  verbatim — renaming it was out of scope, and the SCSS already targets it).
- Styling: `.seat-status--low` (red/semibold) and `.seat-status--full` (light-grey/medium) added
  next to `.availability` in the component SCSS, using existing tokens
  (`$text-red`, `$text-lightgrey`, `$font-weight-semibold`, `$font-weight-medium`) — no new hex.
  `.seat-status--available` needs no rule (inherits `.availability`'s color).
- Dark mode: `dark-theme.scss` §14 has a blanket `.schedule-item, .schedule-item * { color:
  $dk-text !important; }` that would wash out both new colors. Followed the existing re-assert
  precedent immediately below it (the `.text-error`/`.form-required` block) and added
  `.schedule-item .seat-status--low { color: $dk-danger !important; }` /
  `.schedule-item .seat-status--full { color: $dk-text-muted !important; }` — same pattern, same
  location, no new tokens.
- Added `SCHEDULE_BOOKING.SEAT_AVAILABLE`/`SEAT_FULL` to all three locale files in the same commit,
  right next to the existing `SEAT_REMAIN`/`SEAT_UNIT` keys (kept unchanged, still used by the
  `low` branch).
- **Test gotcha hit while writing the return-leg spec**: `ngOnInit` unconditionally resets
  `this.isSelectFirst = false`, which runs on the *first* `fixture.detectChanges()`. Setting
  `component.isSelectFirst = true` before that first `detectChanges()` gets silently overwritten —
  the return leg's `*ngIf="isSelectFirst"` wrapper never renders and `.schedule-item` queries come
  back with only the departure row. Fix: call `detectChanges()` once (runs `ngOnInit`), then set
  `isSelectFirst`, then call `detectChanges()` again to re-render with the leg visible.
- Frontend-only, no backend/NgRx change (`LOW_SEAT_THRESHOLD` is a component constant, not a
  server-driven config — no contract request needed).
- `ng test --watch=false --browsers ChromeHeadless`: 1306/1306 green (1005 packages installed fresh
  in this worktree via `npm ci`, no shared `node_modules`). `ng build --configuration production`:
  clean, 1.49 MB initial (under the 1.5 MB warning budget). `npx tsc --noEmit -p tsconfig.app.json`:
  clean.

## OBRS-229 follow-up — PO reduced to scarcity-only after grounding in the real query
- PO re-grounded in the actual search query — `ScheduleRepository.searchSchedulesWithAvailability`
  (line 65: `AND (capacity - occupied) >= :numberOfPassengers`) filters OUT any schedule that
  doesn't have enough seats for the party, so a sold-out (0-seat) row can **never** appear in
  search results, and every row shown is already bookable. That made both the neutral "seats
  available" label and the sold-out/disabled-button handling from the first pass dead code —
  unreachable given how the backend actually queries.
- Reduced the whole feature to a single boolean predicate, replacing the three-bucket classifier:
  `getSeatAvailabilityStatus()`/`SeatAvailabilityStatus` → `isLowSeatCount(availableSeats,
  threshold): boolean` — `true` for `1..threshold` (inclusive), `false` for everything else
  including `0`/missing (deliberately not a "warning" — it just can't happen here).
  `seatStatus()` → `isLowSeats()` on the component, same wrapper shape.
- Template: the `[ngSwitch]` over three cases collapsed to a single `*ngIf="isLowSeats(...)"` span
  — low seats show `SEAT_REMAIN {n} SEAT_UNIT` in `.seat-status--low`; anything else renders
  nothing (no text, no wrapper element) instead of a neutral "available" label.
- **Removed the sold-out button disable added in the first pass** (`[disabled]="…availableSeats
  === 0"` / `[class.select-btn-diabled]="…availableSeats === 0"` on both legs) — dead per the same
  grounding, since a 0-seat row never reaches this component. Restored both buttons to their
  pre-OBRS-229 bindings with no seat-count condition at all (did NOT reinstate the original
  `list.length === 0` dead code either — that was already established as unreachable in the first
  pass and stays gone).
- i18n: removed `SCHEDULE_BOOKING.SEAT_AVAILABLE`/`SEAT_FULL` from all three locale files (now
  unused); kept `SEAT_REMAIN`/`SEAT_UNIT` (still used by the low-seat span). Note there is an
  unrelated, pre-existing `SEAT_AVAILABLE` key elsewhere in each locale file (a different feature's
  seat-map block) — left untouched, only the `SCHEDULE_BOOKING.*` ones were removed.
- SCSS: removed `.seat-status--full` from the component SCSS and its dark-theme re-assert in
  `dark-theme.scss` §14; kept `.seat-status--low` in both. Left the now-unreferenced
  `.select-btn-diabled` SCSS rule alone (harmless, out of scope to hunt down).
- Spec: replaced the six-test seat-scarcity block (sold-out/low/available × 2 legs) with a
  four-test block (low/comfortable × 2 legs) — comfortable-seats assertions now check that
  `.seat-status--low` is absent and no `SEAT_REMAIN` text renders, rather than asserting a
  different (now-deleted) neutral label.
- **Lesson for future OBRS-229-shaped work**: before designing a multi-state UI purely from a UX
  spec's prose, check what the backing query actually returns — an endpoint that pre-filters
  (`WHERE capacity - occupied >= :n`) can make an entire branch of a state machine unreachable.
  Would have caught this by reading `ScheduleRepository` before the first implementation pass.

## OBRS-229 layout polish — price-unit moved off the availability line
- Two more PO polish passes landed on top of the scarcity-only cut:
  1. `SEAT_PER_PASSENGER` copy changed from "ราคา/คน" (price/person) to "/ที่นั่ง" (leading slash,
     meant to read directly after the price) and the pipe separator was made conditional on
     `isLowSeats(...)` (it had gone orphaned once the neutral-seats text was removed, so a `|`
     with nothing after it could render on comfortable rows).
  2. That conditional pipe still left a visible duplication on the *low* row — "เหลือ 3 ที่นั่ง | /ที่นั่ง"
     put "ที่นั่ง" on the line twice. Fix: moved `SEAT_PER_PASSENGER` off the `.availability` line
     entirely and onto the `.price` line as a `<span class="price-unit">` directly after
     `BAHT_UNIT` (so it reads "200 บาท/ที่นั่ง", grouped with the price it actually describes), and
     put `*ngIf="isLowSeats(...)"` on the `.availability` **div itself** rather than the inner span
     — so the div (and the now-obsolete pipe) is entirely absent above the threshold, not just
     empty. Comfortable rows: no `.availability` element in the DOM at all (no empty div, no gap).
     Low rows: `.availability` contains only the red `SEAT_REMAIN {n} SEAT_UNIT` span, nothing else.
  3. New `.price-unit` SCSS rule (small/muted — `$font-size-sm`/`$font-weight-regular`/
     `$text-lightblack`) matches the look the old inline availability text had, so the price line
     doesn't visually clash between the bold price number and the muted per-seat unit.
  4. Spec fix: the "comfortable seats" tests previously queried `.availability` and asserted on its
     (now nonexistent) text — `fixture.debugElement.query()` returns `null` for an absent element,
     so calling `.nativeElement` on it throws. Rewrote both to assert `query('.availability')` is
     falsy directly, and added a `.price .price-unit` assertion to the low-seat tests to lock in
     the new price-line grouping.
- No i18n changes needed for this final layout pass — `SEAT_PER_PASSENGER`'s "/ที่นั่ง"-shaped value
  (already leading-slash in all three locales from the prior polish commit) works unchanged whether
  it's read on the availability line or the price line.

## 2026-07-13 — Scrutinize self-fix: OBRS-272 trip delay staff control (commit efaf24c)

**Worktree:** `OBRS-frontend-wt-obrs-272-trip-delay-notify` (branch `ao/obrs-272-trip-delay-notify`).
Two under-30-line self-fixes applied after review; larger items left as notes below.

1. **Dead reuse alias wired up, not deleted.** `schedule-delay-error.ts` exported
   `extractScheduleDelayErrorCode = extractScheduleStatusErrorCode` (the intended per-flow
   extract+map pair, matching `boarding-scan-error`/`boarding-action-error`/`schedule-status-error`),
   but `BoardingListComponent.submitDelaySchedule()`'s error handler still called
   `extractScheduleStatusErrorCode()` directly — leaving the alias dead. Fix: import and call
   `extractScheduleDelayErrorCode()` in the delay flow (line ~458) so each flow imports its own
   extract+map pair (convention), and the OBRS-256 status flow (line ~748) keeps
   `extractScheduleStatusErrorCode`. Pattern lesson: when you create a feature-local reuse alias,
   USE it at the call site — don't create it then bypass it, or it reads as dead code on review.

2. **Wrong ADR reference.** `admin-modal-backdrop.directive.ts`'s doc comment cited
   `docs/adr/0016-admin-modal-backdrop-relocation.md`, but 0016 is an unrelated ADR
   (`0016-eod-sales-report-money-columns-and-row-expand.md`); the real one is
   `0017-schedule-delay-control-and-modal-backdrop-relocation.md`. Fixed the citation. Lesson:
   when the ADR number is assigned late, grep `docs/adr/` for the actual filename before citing it.

## OBRS-266 scrutinize self-fix — camera startup teardown race (2026-07-11)

`startCameraScan()` assigned `this.scannerControls`/`cameraStatus='active'` only AFTER
awaiting `decodeFromVideoDevice()` (Promise). The mode-toggle buttons are disabled on
`isScanning` but NOT during the camera `requesting` phase, so an operator can tap "Text"
(or a scheduleId re-bind / arrived-transition can fire) mid-startup. `stopCameraStream()`
then runs while `scannerControls` is still null (no-op), the pending promise later resolves,
and a now-LIVE MediaStream gets stored into `scannerControls` with `cameraStatus='active'`
while `scanMode==='text'` — an orphan stream (camera light stays on) nothing stops until the
next teardown.

Fix (pattern to remember): after any `await` that acquires a resource you also tear down
elsewhere, re-check the teardown-owned flag BEFORE committing the resource:
```ts
const controls = await this.codeReader.decodeFromVideoDevice(...);
if (this.cameraStatus !== 'requesting') { controls.stop(); return; } // torn down mid-await
this.scannerControls = controls;
this.cameraStatus = 'active';
```
`cameraStatus !== 'requesting'` catches all teardown paths at once (stopCameraStream sets it
to 'idle'; re-bind/toggle also set scanMode='text'). Locked with a fakeAsync spec that resolves
the decode promise AFTER a text-toggle and asserts `stop()` called once + `scannerControls` null.
General lesson: an idempotent teardown helper only protects against a resource that ALREADY
exists — it can't cancel one still in flight; guard the post-await assignment too.

## 2026-07-14 — OBRS-317 owner/staff in-app notification inbox (Phase 1, poll) — commit 95b3679

**Worktree:** `OBRS-frontend-wt-obrs-317-notification-inbox` (branch `ao/obrs-317-notification-inbox`,
off `origin/dev` at 41513cf). Worktree was recreated mid-flight by a parallel session's sweep;
started fresh, no prior 317 work lost (there was none).

**What shipped:** bell + unread badge in both `admin-layout`/`staff-layout` topbars, opening a
`p-overlayPanel` inbox (click-to-read + mark-all-read), backed by role-agnostic
`/api/private/notifications`. Poll-only unread-count (60s, matches the existing
`NEW_REPORT_COUNT_POLL_MS` sidebar-badge cadence) + list refetch on init/panel-open. List capped
to 10 most recent (read+unread), "showing latest N of M" footer when `totalElements > 10`.

**Reuse ledger (DRY gate):**
- `PageResponse<T>` (`payment.interface.ts`) reused as-is for the paged list — no new Page type.
- `.admin-nav-badge` token recipe reused **verbatim**; only a position-only modifier class
  (`.notification-bell-badge`, absolute-positioned corner) added on top — did not fork the badge.
- `formatDisplayDateTime()` reused for the row timestamp — no new date formatter.
- `NotificationInboxService`'s idempotent-start guard mirrors `BadgeSocketService.connect()`;
  clear-on-logout mirrors `AdminCollectionStore`'s `authStatus$` subscription. New code, but shaped
  identically to the two closest precedents rather than inventing a third shape.
- New: `NotificationApiService` (deliberately NOT folded into `AdminApiService` — that service is
  admin-scoped; this endpoint must also serve staff/salesperson/driver). New: `p-overlayPanel` is
  the first use of that PrimeNG component in the codebase (`p-menu[popup]`'s `MenuItem[]` shape
  can't carry a row's message/timestamp/read-state/click-handler) — see ADR 0018.

**Gotchas hit:**
1. TS2729 ("used before initialization") when a component's field initializers read
   `this.constructorParamService.xyz$` — constructor-param-property assignment happens in the
   constructor body, which runs AFTER top-of-class field initializers in the emitted JS. Fixed by
   declaring the fields as `Observable<T>` (no initializer) and assigning them inside the
   constructor body instead of at declaration.
2. Both `admin-layout.component.spec.ts` and `staff-layout.component.spec.ts` needed a same-file
   `@Component({selector: 'app-notification-bell', template: ''})` stub declared + a
   `NotificationInboxService` mock provider added to their existing `TestBed.configureTestingModule`
   blocks — mounting the real bell markup in the layout template makes those specs fail to compile
   otherwise (unknown element / missing DI token). Same pattern as the existing `LangSwitcherComponent`
   real-component approach, but the bell pulls in a full HTTP-backed service chain so a stub was the
   better fit here (mirrors how `BadgeSocketService` gets a hand-rolled stub in the same spec file).
3. `*ngIf="unreadCount$ | async as unreadCount"` for the badge naturally matches
   "`show only when > 0`" for free — 0 is falsy in JS, so no explicit `> 0` comparison needed in the
   template; kept the field truthy-check idiom rather than writing `(unreadCount$ | async) ?? 0 > 0`.
4. `npm ci` was required in this fresh worktree (no `node_modules/`) before `ng test`/`ng build`
   would run at all — budget ~6 min. `ng build --configuration production` passed with only the
   pre-existing initial-bundle-budget WARNING (not new to this change; 1.67MB vs 1.57MB budget,
   a warning not an error, build exits 0) — did not investigate whether this session's ~15KB of
   added JS pushed it over an existing-close threshold; flag for `obrs-tech-lead` if bundle size
   becomes a recurring blocker.

**Result:** `ng test` 2142/2142 passing (added 2 spec failures during first pass — both in my own
new `notification-bell.component.spec.ts`: an untranslated-key assertion and a copy-paste'd wrong
call-count expectation — fixed before submitting, not a product bug). `ng build --configuration
production` passes. ADR: `docs/adr/0018-notification-inbox-overlay-panel-and-root-service-state.md`.

### Scrutinize follow-up fix (same day, commit a8f327c)

Scrutinize caught a real visual defect unit tests couldn't: `p-overlayPanel`'s
`appendTo="body"` moves the panel outside `.admin-shell`, so every `--admin-*`/
`--accent-*` custom property the panel/row SCSS reads (declared only on
`.admin-shell`/`.admin-shell.theme-*`/`.admin-shell.is-dark` in
`admin-theme.scss`) silently failed to resolve there (no fallback → invisible
unread highlight/dot, black text in dark mode, missing footer border). Same
class of bug as the already-solved `my-bookings-action-menu` precedent
(`appendTo="body"` + a `styleClass` carrying context, themed in the matching
global stylesheet) — should have been caught by re-grepping for `appendTo=
"body"` precedent BEFORE writing the component, not after Scrutinize flagged
it. Fix: bell takes `shellVariant: 'admin'|'staff'` input + reads
`ThemeService.mode$` directly, composes `styleClass="notification-inbox-overlay
theme-{variant}[ is-dark]"`, and `admin-theme.scss` re-declares the needed
tokens scoped to that class. **Verification method worth reusing**: jsdom/Karma
can't render real CSS cascade for a body-appended node, so I built a static
HTML harness loading the actual compiled `dist/.../styles-*.css` (has the new
`.notification-inbox-overlay*` rules) + the component SCSS inlined verbatim
(these particular files are plain CSS, no SCSS-only syntax) and read
`getComputedStyle()` via Playwright (already in `node_modules`, run with
`NODE_PATH=<repo>/node_modules node <script>` since the script lives in the
scratchpad dir outside the repo) — confirmed all 5 flagged properties resolve
to real theme colors, not transparent/black/Bootstrap-default, across
admin/staff × light/dark. Lesson: for any `appendTo="body"`/CDK-overlay/portal
content that reads shell-scoped CSS custom properties, grep for the existing
`my-bookings-action-menu` pattern FIRST and budget for a styleClass + global
stylesheet rule from the start — don't discover the gap after Scrutinize.

### QA follow-up 2 (same day, commit 9951b61) — panel root chrome + i18n NG0200 diagnosis

**Fix 1 (in scope):** the earlier `.notification-inbox-overlay` block only re-declared
custom PROPERTIES, never an actual `background`/`color`/`border` on the PrimeNG panel
ROOT — so the card chrome stayed the theme's hardcoded `.p-overlaypanel { background:
#ffffff }` (lara-light-blue) white in dark mode, behind now-correctly-dark-themed text.
Added `.p-overlaypanel.notification-inbox-overlay` (background/color/border from the
same tokens) + arrow pseudo-element overrides. Verified with the same static-harness-
+-Playwright `getComputedStyle()` recipe as the first Scrutinize fix, this time
reproducing the REAL rendered root classes (`p-overlaypanel p-component` + styleClass,
copied from `OverlayPanel`'s own template) so the specificity fight (`0-2-0` vs `0-1-0`)
is tested faithfully, not just the token declarations.

**Diagnose 2 (NG0200 circular DI / raw i18n keys) — CONCLUSION: pre-existing/env, NOT
OBRS-317-caused.** Empirically reproduced with Playwright against `npm run
start:local`-equivalent (`ng serve`): the exact `NG0200: Circular dependency in DI
detected for _TranslateService` (thrown from `error.interceptor.ts:22`'s `inject(
TranslateService)`) fires on a **cold `/login` page load**, before any auth, before any
navigation into `/admin` or `/staff`, i.e. before a single line of OBRS-317 code (bell,
NotificationInboxService, NotificationApiService) has executed. Visually confirmed
`/login` itself renders raw keys (`LOGIN.WELCOME`, `LOGIN.USERNAME`, ...,
`USABILITY_REPORT.FAB.LABEL`) in that same session. Root cause (not fixed, out of
scope — `error.interceptor.ts` is on the CLAUDE.md "DO NOT MODIFY without explicit
request" list): the interceptor's `inject(TranslateService)` is unconditional (runs for
literally every HttpClient request, not gated behind `isApiRequest`), so it also fires
for the i18n loader's OWN `/i18n/{lang}.json` HttpClient GET. If that fetch is issued
synchronously from within `TranslateService`'s own construction (e.g. an eager
`.use(lang)` call before the constructor returns), the interceptor's `inject()` for the
SAME token mid-construction is a genuine reentrant cycle → NG0200, independent of route,
independent of our polling. `AuthService.isAuthenticated()`/`getRoles()` read plain
localStorage (`auth_token`/`auth_roles`, no JWT verification client-side) — useful
precedent for future FE-only repro without a live backend: `localStorage.setItem(
'auth_token', 'x'); localStorage.setItem('auth_roles', '["admin"]')` then
`goto('/admin/dashboard')` renders the shell as if logged in. Reported back to
coordinator to open a separate card; left `error.interceptor.ts` untouched.
---

## 2026-07-13 — UX spec: read-only Admin Booking Detail dialog (OBRS-280) — key findings for the implementer

**Worktree:** `OBRS-frontend-wt-obrs-280-admin-booking-detail` (branch `ao/obrs-280-admin-booking-detail`).
No code written this pass — UX/UI spec handoff. Frontend-only, read-only, no new route: a "view"
action on `admin/pages/bookings` opens a detail dialog for one booking. NO cancel/reschedule
actions (deferred cards) — Close is the only interactive control besides the top-right ×.

**The closest existing precedent is `UsabilityReportsPageComponent`'s detail modal — copy its
idiom almost verbatim, not the schedules-page confirm-modal idiom.** It's the only other read-
mostly, click-a-row-to-drill-in admin detail dialog in the codebase, and it already encodes every
rule design-system.md §6/§11 cares about:
- Row click (`(click)="onRowActivate(id, $event)"` on `<tr>`) **and** a small explicit
  `admin-btn admin-btn-small` "View" button in an Actions column both open the same dialog — the
  row has no `role="button"`/keyboard handler (would orphan cells), so the button remains the
  accessible/keyboard affordance. `onRowActivate` ignores clicks on `button, a, input, select,
  textarea` (`target.closest(...)`) and ignores an active text selection
  (`window.getSelection()?.toString()`), then calls the same `openDetail(id)` the button calls.
  **Reuse this exact guard**, not a bare `(click)` on the row.
- **Optimistic open + stale-response guard**, textbook: `openDetail(id)` sets
  `selectedReportId = id` synchronously (this alone makes `*ngIf="selectedReportId !== null"`
  show the backdrop+shell instantly), seeds `detailReport` from a **fallback built from the row
  already in hand** (`toUsabilityReportDetailFallback(summary)`) so the header renders before any
  network round-trip, sets `isDetailFetching = true`, then in the subscribe `next`, bails with
  `if (this.selectedReportId !== id) return;` before touching any field — so a second row-click
  while the first fetch is in flight can never let the stale response clobber the newer one.
  **OBRS-280 needs this exact pattern**, just with two independent fetches instead of one (see
  below), each with its own stale-id guard.
- Modal shell: `.admin-modal-backdrop` + `adminModalBackdrop` directive (`(dismiss)="..."`) wrapping
  `.admin-modal <page-prefix>-detail-modal`, containing a `.admin-modal-header` (`h4.admin-modal-title`
  + a 36px round icon-button `×` using `.material-symbols-outlined` `close`), then the body gated
  `*ngIf="detailReport"`. **No `.admin-modal-actions` / primary button at all** — this dialog has no
  save/confirm action, unlike the schedules confirm-modal or the usability-report's own status-update
  footer (OBRS-280 must **not** copy that footer — it's mutating, we're read-only).
- `.admin-modal` **base is theme-var driven already** (`background: var(--admin-surface-card)`,
  `.is-dark .admin-modal { border-color: var(--admin-outline); }` in `admin-theme.scss` lines
  ~1244-1260) — reusing it costs **zero new dark-mode SCSS**. The only component-scoped SCSS this
  card needs is a **width override** (usability-reports uses `.ur-detail-modal { max-width: 680px;
  max-height: 90vh; overflow-y: auto; }`; `promotion-form-modal` separately proves the same
  size-variant-by-scoped-class idiom with `.admin-modal-lg { width: min(880px, 100%); }`) — no
  color, so it needs no dark override either. **OBRS-280 uses `max-width: 900px` (wider than 680px
  — this dialog has two data tables, not just label/value rows).**

**Two independent fetches, not one — size the loading state per-section, not modal-wide.**
`GET /api/private/bookings/{id}` (`AdminApiService.getBookingById`, **new method, doesn't exist
yet**) returns the booking header/status/contact/actor/journeys+tickets/pricing/payment-summary;
`GET /api/private/bookings/{id}/payments` (`AdminApiService.getBookingPayments`, **already exists**,
used today by `BookingsStore.loadPaymentStatusByBookingId`) returns the transaction list. Fire both
`takeUntil(this.destroy$)` subscriptions from `openDetail()`, each with its own
`isDetailFetching` / `isPaymentsFetching` flag and its own `if (this.selectedBookingId !== id)
return;` guard — so the passengers/tickets section can render as soon as the first call resolves
without waiting on the second, and vice versa. Show `admin-skeleton` blocks (the row-list idiom
already used on this exact page for the table body) in each section while its flag is true, not a
single modal-wide spinner.

**`BookingRow` (in `bookings.store.ts`) doesn't carry the numeric booking `id` today** — it only
exposes `bookingId: string` (the human-facing `bookingNumber`, e.g. `#BK-1042`). Add
`id: number` to the `BookingRow` interface and populate it from `booking.id` in `toBookingRow()` —
required so the "View" click can call `getBookingById(row.id)`. This is the one existing-file
change on the list side; everything else is additive.

**New DTOs needed in `admin-api.service.ts`** (none of these exist yet — `AdminBookingDto`, the
list DTO, has no `bookingType`/`expiredAt`/ticket-level data):
```ts
export interface AdminBookingTicketDto {
  passengerName?: string;
  passengerType?: string;
  seatNumber?: string;
  status?: string | AdminStatusDto;   // include CANCELLED/REFUNDED tickets, don't filter them
  ticketNumber?: string;
}
export interface AdminBookingDetailJourneyDto extends AdminBookingJourneyDto {
  tickets?: AdminBookingTicketDto[];
}
export interface AdminBookingDetailDto {
  id: number;
  bookingNumber?: string;
  bookingType?: string;
  status?: string | AdminStatusDto;
  createdAt?: string;
  expiredAt?: string;
  actor?: { name?: string; type?: string; channel?: string; officeName?: string };
  contact?: { fullName?: string; phoneNumber?: string };
  journeys?: AdminBookingDetailJourneyDto[];
  pricing?: AdminPriceSummaryDto;
  payment?: AdminPaymentSummaryDto;
}
getBookingById(bookingId: number): Observable<ResponseAPI<AdminBookingDetailDto>> {
  return this.getRequest<AdminBookingDetailDto>(`${this.baseUrl}/private/bookings/${bookingId}`);
}
```
Base path matches the sibling `getBookingPayments` (`${this.baseUrl}/private/bookings/${id}/payments`)
— **not** the list endpoint's `/private/admin/bookings` path, which is a different resource.

**Ticket/transaction status color mapping is a new small local method, following the codebase's
established per-page duplication style** (`bookings-page.component.ts` already has its own private
`statusClass()`/`paymentClass()` — there's no shared status-class util anywhere in admin, so don't
invent one here): `ticketStatusClass(status)` → CONFIRMED/ACTIVE → `is-success`; PENDING →
`is-warning`; CANCELLED → `is-danger`; REFUNDED → `is-neutral` (the plain-grey "inactive/unset"
role, §2.4 — distinct from danger, since a refunded ticket isn't an error state, it's a resolved
one). Booking-level `status` badge reuses the page's *existing* `statusClass()` method unchanged.

**Timeline is composed client-side — no history/audit endpoint exists.** Build a flat, time-sorted
array from fields already in hand: `{ time: createdAt, labelKey: EVENT.CREATED }`, one entry per
payment transaction (`{ time: tx.paidAt, labelKey: EVENT.PAYMENT, params: { method: tx.paymentMethod } }`),
`{ time: expiredAt, labelKey: EVENT.EXPIRES }` **only when present** (a confirmed/paid booking has
no `expiredAt`), and a final `{ time: null, labelKey: EVENT.CURRENT_STATUS, params: { status:
booking.status.label } }` pinned last regardless of sort (it's "now", not a past event). Render as
a plain `<ul class="bk-timeline">` of `<li>` — a dot (`background: var(--accent)`) + label
(`var(--admin-text)`) + muted timestamp (`var(--admin-muted)`), no new component. Copy this as
"Activity" (`SECTION.TIMELINE`), not "Audit trail" or "History" — it's a derived convenience list,
not a real audit log; don't over-promise completeness the backend doesn't back.

Full spec (routes, component hierarchy, dialog layout, forms, i18n table) is below this entry.

---

## UX/UI Specification — OBRS-280 Admin Booking Detail dialog

### New routes / pages
None. No new route. All changes land on the existing
`src/app/modules/admin/pages/bookings/bookings-page.component.{ts,html,scss}` (page-scoped SCSS
file needs to be created — the page currently has no `.scss` beyond table/filter layout, check
`bookings-page.component.scss` and add to it) plus `bookings.store.ts` (add `id` to `BookingRow`)
and `admin-api.service.ts` (new `getBookingById` + DTOs above).

### Component hierarchy
No new Angular components — deliberately mirrors `UsabilityReportsPageComponent`, which keeps its
entire read-only detail modal inline in the page template rather than extracting a child component.
Same choice here: less indirection for a single-consumer, read-only view.

- `BookingsPageComponent` (smart, existing) — new protected state:
  - `selectedBookingId: number | null = null`
  - `detailBooking: AdminBookingDetailDto | null = null` (seeded optimistically, see above)
  - `paymentTransactions: AdminPaymentTransactionDto[] | null = null`
  - `isDetailFetching = false`, `isPaymentsFetching = false`
  - `detailLoadError = ''`, `paymentsLoadError = ''`
  new protected methods: `onRowActivate(row, event)`, `openDetail(row: BookingRow)`,
  `closeDetail()`, `onDetailBackdropDismiss()`, `ticketStatusClass(status)`, `timelineEvents(): {time, labelKey, params}[]` (getter, computed from `detailBooking` + `paymentTransactions`).

### Bookings list table changes (prerequisite for opening the dialog)
- Add an `Actions` column: `<th class="text-right">{{ 'ADMIN.COMMON.ACTIONS' | translate }}</th>`
  (key already exists — used by schedules/usability-reports, no new key) — bump the empty-row
  `colspan` from `8` to `9` and add a skeleton `<td>` to the loading rows.
- Row `<tr>` gets `(click)="onRowActivate(booking, $event)"` (guard pattern above); action cell has
  one small button, `admin-btn admin-btn-small`, `(click)="openDetail(booking)"`, label
  `'ADMIN.BOOKINGS.VIEW' | translate` (new key, mirrors `ADMIN.USABILITY_REPORTS.VIEW`).

### Detail dialog layout (inline in `bookings-page.component.html`, appended after the `admin-card`
section, structurally mirroring `usability-reports-page.component.html`'s `<!-- Detail Modal -->`
block)

```html
<div class="admin-modal-backdrop" *ngIf="selectedBookingId !== null" adminModalBackdrop (dismiss)="onDetailBackdropDismiss()">
  <div class="admin-modal bk-detail-modal">
    <div class="admin-modal-header">
      <h4 class="admin-modal-title">{{ 'ADMIN.BOOKINGS.DETAIL.TITLE' | translate }}</h4>
      <button type="button" class="bk-detail-close" [attr.aria-label]="'ADMIN.BOOKINGS.DETAIL.CLOSE' | translate" (click)="closeDetail()">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>

    <ng-container *ngIf="detailBooking">
      <!-- 1. Header / status band -->
      <div class="bk-detail-header">
        <span class="admin-emphasis">{{ detailBooking.bookingNumber }}</span>
        <span class="admin-status" [ngClass]="statusClass(bookingStatusCode(detailBooking.status))">
          {{ bookingStatusLabel(detailBooking.status) }}
        </span>
        <span class="admin-muted">{{ detailBooking.bookingType }}</span>
      </div>
      <div class="bk-detail-row"><span class="bk-detail-label">{{ 'ADMIN.BOOKINGS.DETAIL.CREATED_AT' | translate }}</span><span>{{ displayDateTime(detailBooking.createdAt) }}</span></div>
      <div class="bk-detail-row" *ngIf="detailBooking.expiredAt"><span class="bk-detail-label">{{ 'ADMIN.BOOKINGS.DETAIL.EXPIRES_AT' | translate }}</span><span>{{ displayDateTime(detailBooking.expiredAt) }}</span></div>

      <!-- 2. Contact + actor, two-column -->
      <div class="bk-detail-twocol">
        <section>
          <h5>{{ 'ADMIN.BOOKINGS.DETAIL.SECTION.CONTACT' | translate }}</h5>
          <div class="bk-detail-row"><span class="bk-detail-label">{{ 'ADMIN.BOOKINGS.DETAIL.CONTACT_NAME' | translate }}</span><span>{{ detailBooking.contact?.fullName || '-' }}</span></div>
          <div class="bk-detail-row"><span class="bk-detail-label">{{ 'ADMIN.BOOKINGS.DETAIL.CONTACT_PHONE' | translate }}</span><span>{{ detailBooking.contact?.phoneNumber || '-' }}</span></div>
        </section>
        <section>
          <h5>{{ 'ADMIN.BOOKINGS.DETAIL.SECTION.ACTOR' | translate }}</h5>
          <div class="bk-detail-row"><span class="bk-detail-label">{{ 'ADMIN.BOOKINGS.DETAIL.ACTOR_NAME' | translate }}</span><span>{{ detailBooking.actor?.name || '-' }}</span></div>
          <div class="bk-detail-row"><span class="bk-detail-label">{{ 'ADMIN.BOOKINGS.DETAIL.ACTOR_TYPE' | translate }}</span><span>{{ detailBooking.actor?.type || '-' }}</span></div>
          <div class="bk-detail-row" *ngIf="detailBooking.actor?.channel"><span class="bk-detail-label">{{ 'ADMIN.BOOKINGS.DETAIL.ACTOR_CHANNEL' | translate }}</span><span>{{ detailBooking.actor?.channel }}</span></div>
          <div class="bk-detail-row" *ngIf="detailBooking.actor?.officeName"><span class="bk-detail-label">{{ 'ADMIN.BOOKINGS.DETAIL.ACTOR_OFFICE' | translate }}</span><span>{{ detailBooking.actor?.officeName }}</span></div>
        </section>
      </div>

      <!-- 3. Passengers & tickets, grouped by journey -->
      <section class="mt-3">
        <h5>{{ 'ADMIN.BOOKINGS.DETAIL.SECTION.PASSENGERS' | translate }}
          <span *ngIf="isDetailFetching" class="ur-inline-updating">{{ 'ADMIN.COMMON.UPDATING' | translate }}</span>
        </h5>
        <p *ngIf="!isDetailFetching && !(detailBooking.journeys?.length)" class="admin-muted">{{ 'ADMIN.BOOKINGS.DETAIL.NO_JOURNEYS' | translate }}</p>
        <ng-container *ngFor="let journey of detailBooking.journeys; let ji = index">
          <div class="bk-journey-heading">
            {{ 'ADMIN.BOOKINGS.DETAIL.JOURNEY_LABEL' | translate: { index: ji + 1, route: journeyRouteLabel(journey) } }}
          </div>
          <table class="admin-table">
            <thead>
              <tr>
                <th>{{ 'ADMIN.BOOKINGS.DETAIL.COL.PASSENGER_NAME' | translate }}</th>
                <th>{{ 'ADMIN.BOOKINGS.DETAIL.COL.PASSENGER_TYPE' | translate }}</th>
                <th>{{ 'ADMIN.BOOKINGS.DETAIL.COL.SEAT' | translate }}</th>
                <th>{{ 'ADMIN.BOOKINGS.DETAIL.COL.TICKET_NUMBER' | translate }}</th>
                <th>{{ 'ADMIN.BOOKINGS.DETAIL.COL.TICKET_STATUS' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let ticket of journey.tickets">
                <td>{{ ticket.passengerName }}</td>
                <td>{{ ticket.passengerType }}</td>
                <td class="admin-emphasis">{{ ticket.seatNumber }}</td>
                <td><code>{{ ticket.ticketNumber }}</code></td>
                <td><span class="admin-status" [ngClass]="ticketStatusClass(ticketStatusCode(ticket.status))">{{ ticketStatusLabel(ticket.status) }}</span></td>
              </tr>
            </tbody>
          </table>
        </ng-container>
      </section>

      <!-- 4. Payment summary + transactions -->
      <section class="mt-3">
        <h5>{{ 'ADMIN.BOOKINGS.DETAIL.SECTION.PAYMENT' | translate }}</h5>
        <div class="bk-payment-summary">
          <div><span class="bk-detail-label">{{ 'ADMIN.BOOKINGS.DETAIL.TOTAL_AMOUNT' | translate }}</span><span class="admin-emphasis">{{ formatMoney(detailBooking.payment?.totalAmount, detailBooking.payment?.currency) }}</span></div>
          <div><span class="bk-detail-label">{{ 'ADMIN.BOOKINGS.DETAIL.PAID_AMOUNT' | translate }}</span><span>{{ formatMoney(detailBooking.payment?.paidAmount, detailBooking.payment?.currency) }}</span></div>
          <div><span class="bk-detail-label">{{ 'ADMIN.BOOKINGS.DETAIL.OUTSTANDING_AMOUNT' | translate }}</span><span>{{ formatMoney(detailBooking.payment?.outstandingAmount, detailBooking.payment?.currency) }}</span></div>
          <div><span class="bk-detail-label">{{ 'ADMIN.BOOKINGS.DETAIL.REFUNDED_AMOUNT' | translate }}</span><span>{{ formatMoney(detailBooking.payment?.refundedAmount, detailBooking.payment?.currency) }}</span></div>
          <span class="admin-status" [ngClass]="paymentClass(detailBooking.payment?.status)">{{ detailBooking.payment?.status }}</span>
        </div>
        <span *ngIf="isPaymentsFetching" class="ur-inline-updating">{{ 'ADMIN.COMMON.UPDATING' | translate }}</span>
        <table class="admin-table mt-2" *ngIf="!isPaymentsFetching">
          <thead>
            <tr>
              <th>{{ 'ADMIN.BOOKINGS.DETAIL.COL.TXN_DATE' | translate }}</th>
              <th>{{ 'ADMIN.BOOKINGS.DETAIL.COL.TXN_METHOD' | translate }}</th>
              <th>{{ 'ADMIN.BOOKINGS.DETAIL.COL.TXN_AMOUNT' | translate }}</th>
              <th>{{ 'ADMIN.BOOKINGS.DETAIL.COL.TXN_STATUS' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let tx of paymentTransactions">
              <td>{{ displayDateTime(tx.paidAt) }}</td>
              <td>{{ tx.paymentMethod }}</td>
              <td class="admin-emphasis">{{ formatMoney(tx.amount, tx.currency) }}</td>
              <td><span class="admin-status" [ngClass]="paymentClass(tx.status)">{{ tx.status }}</span></td>
            </tr>
            <tr *ngIf="!paymentTransactions?.length" class="admin-empty-row"><td colspan="4">{{ 'ADMIN.BOOKINGS.DETAIL.NO_TRANSACTIONS' | translate }}</td></tr>
          </tbody>
        </table>
      </section>

      <!-- 5. Timeline -->
      <section class="mt-3">
        <h5>{{ 'ADMIN.BOOKINGS.DETAIL.SECTION.TIMELINE' | translate }}</h5>
        <ul class="bk-timeline">
          <li *ngFor="let event of timelineEvents">
            <span class="bk-timeline-dot" aria-hidden="true"></span>
            <span>{{ event.labelKey | translate: event.params }}</span>
            <span class="admin-muted" *ngIf="event.time">{{ displayDateTime(event.time) }}</span>
          </li>
        </ul>
      </section>
    </ng-container>

    <p *ngIf="!detailBooking && detailLoadError" class="admin-muted text-center mt-3">{{ detailLoadError }}</p>
  </div>
</div>
```

Notes on the markup above:
- `bookingStatusCode`/`bookingStatusLabel`/`ticketStatusCode`/`ticketStatusLabel` are thin helpers
  around the already-imported `parseAdminStatus` util (same one `bookings.store.ts` uses) — status
  can come back as a bare string or `{slug, label}`, both need normalizing before badge/class lookup.
- `formatMoney(amount, currency)` — reuse the `Intl.NumberFormat('en-US', { style: 'currency', ... })`
  one-liner already written in `bookings.store.ts` `toBookingRow()`; hoist it to a shared
  `shared/lib` helper if touching that file anyway, otherwise a local private method is fine (same
  duplication tolerance as `statusClass`/`paymentClass` today).
- `.bk-journey-heading` / `.bk-payment-summary` / `.bk-timeline` are **new page-scoped classes** —
  style them ONLY with existing CSS custom properties (`var(--admin-surface-soft)` for the journey
  heading background — the same "structural, not data" surface already used for `admin-table thead`
  and the OBRS-231 expandable-row chip surface per design-system.md §12 — and `var(--admin-text)`/
  `var(--admin-muted)`/`var(--accent)` for the timeline dot/text), so dark mode needs **zero**
  additional overrides (the CSS vars already flip under `.is-dark`).

### Forms
None — this is a read-only view, no form controls, no validation.

### User flows
1. Admin opens `/admin/bookings` (existing) → sees the booking list (unchanged, now with an Actions
   column) → clicks a row (or its "View" button) → dialog opens instantly showing bookingNumber +
   status pill it already had from the row (no blank/spinner-only state) → within ~1-2s the
   passengers/tickets, payment, and timeline sections populate as their two backing fetches resolve.
2. Admin clicks a different row while the first dialog's fetch is still in flight → `selectedBookingId`
   flips to the new id immediately, dialog re-seeds from the new row's fallback, the in-flight
   response for the old id is dropped by the stale-id guard when it lands.
3. Fetch fails (404/500) → `detailLoadError` is set (via the same inline-message convention the page
   already uses for its list-load failure — `admin-muted` paragraph, no `Swal`/AlertService, since
   this replaces content rather than reacting to a user action) → admin clicks Close (or backdrop, or ×)
   → dialog closes, state resets, no residual error banner leaks into the next open.

### States
- Loading: per-section, not modal-wide — `isDetailFetching`/`isPaymentsFetching` gate their own
  sections with the existing inline `'ADMIN.COMMON.UPDATING' | translate` hint (`.ur-inline-updating`
  class already defined globally from the usability-reports work — reuse, don't redefine) next to
  each section heading; the header/status band never blanks because it's seeded from the row.
- Empty: no journeys → `ADMIN.BOOKINGS.DETAIL.NO_JOURNEYS`; no transactions →
  `ADMIN.BOOKINGS.DETAIL.NO_TRANSACTIONS` (both inline `admin-muted` text, matching `ADMIN.COMMON.NO_DATA`'s
  existing tone elsewhere on this page).
- Error: `detailLoadError` inline `admin-muted text-center` paragraph inside the modal body (not
  AlertService — this is a content-load failure being displayed, not a transient action result).

### NgRx changes
None. The admin module doesn't use `@ngrx/store` for this data — `bookings.store.ts` is a local
`AdminCollectionStore` (RxJS `BehaviorSubject`-backed cache), and the detail dialog's state
(`selectedBookingId`, `detailBooking`, `paymentTransactions`, the fetching/error flags) lives
directly on `BookingsPageComponent`, exactly like `UsabilityReportsPageComponent`'s
`selectedReportId`/`detailReport`. No new selectors/actions/effects.

### i18n keys to add
All three locale files (`public/i18n/en.json`, `th.json`, `zh.json`), inside the existing
`"ADMIN"."BOOKINGS"` object (add `"VIEW"` as a sibling of `"LOAD_FAILED"`, then a new `"DETAIL"`
object, mirroring `ADMIN.USABILITY_REPORTS.DETAIL`'s placement exactly):

| Key | EN | TH | ZH |
|---|---|---|---|
| ADMIN.BOOKINGS.VIEW | View | ดูรายละเอียด | 查看 |
| ADMIN.BOOKINGS.DETAIL.TITLE | Booking Detail | รายละเอียดการจอง | 预订详情 |
| ADMIN.BOOKINGS.DETAIL.CLOSE | Close | ปิด | 关闭 |
| ADMIN.BOOKINGS.DETAIL.LOAD_FAILED | Unable to load booking detail. Please try again. | ไม่สามารถโหลดรายละเอียดการจองได้ กรุณาลองใหม่อีกครั้ง | 无法加载预订详情，请重试。 |
| ADMIN.BOOKINGS.DETAIL.CREATED_AT | Created At | สร้างเมื่อ | 创建时间 |
| ADMIN.BOOKINGS.DETAIL.EXPIRES_AT | Expires At | หมดอายุเมื่อ | 过期时间 |
| ADMIN.BOOKINGS.DETAIL.SECTION.CONTACT | Customer Contact | ข้อมูลติดต่อลูกค้า | 客户联系信息 |
| ADMIN.BOOKINGS.DETAIL.CONTACT_NAME | Full Name | ชื่อ-นามสกุล | 姓名 |
| ADMIN.BOOKINGS.DETAIL.CONTACT_PHONE | Phone Number | หมายเลขโทรศัพท์ | 电话号码 |
| ADMIN.BOOKINGS.DETAIL.SECTION.ACTOR | Booked By | ผู้ทำรายการจอง | 预订操作人 |
| ADMIN.BOOKINGS.DETAIL.ACTOR_NAME | Name | ชื่อ | 姓名 |
| ADMIN.BOOKINGS.DETAIL.ACTOR_TYPE | Actor Type | ประเภทผู้ทำรายการ | 操作人类型 |
| ADMIN.BOOKINGS.DETAIL.ACTOR_CHANNEL | Channel | ช่องทาง | 渠道 |
| ADMIN.BOOKINGS.DETAIL.ACTOR_OFFICE | Office | สำนักงาน | 办公室 |
| ADMIN.BOOKINGS.DETAIL.SECTION.PASSENGERS | Passengers & Tickets | ผู้โดยสารและตั๋ว | 乘客与车票 |
| ADMIN.BOOKINGS.DETAIL.NO_JOURNEYS | No journeys on this booking. | ไม่มีเที่ยวเดินทางในรายการจองนี้ | 此预订没有行程。 |
| ADMIN.BOOKINGS.DETAIL.JOURNEY_LABEL | Journey {{index}}: {{route}} | เที่ยวที่ {{index}}: {{route}} | 行程 {{index}}：{{route}} |
| ADMIN.BOOKINGS.DETAIL.COL.PASSENGER_NAME | Passenger | ผู้โดยสาร | 乘客 |
| ADMIN.BOOKINGS.DETAIL.COL.PASSENGER_TYPE | Type | ประเภท | 类型 |
| ADMIN.BOOKINGS.DETAIL.COL.SEAT | Seat | ที่นั่ง | 座位 |
| ADMIN.BOOKINGS.DETAIL.COL.TICKET_NUMBER | Ticket No. | หมายเลขตั๋ว | 车票编号 |
| ADMIN.BOOKINGS.DETAIL.COL.TICKET_STATUS | Ticket Status | สถานะตั๋ว | 车票状态 |
| ADMIN.BOOKINGS.DETAIL.SECTION.PAYMENT | Payment | การชำระเงิน | 付款 |
| ADMIN.BOOKINGS.DETAIL.TOTAL_AMOUNT | Total | ยอดรวม | 总金额 |
| ADMIN.BOOKINGS.DETAIL.PAID_AMOUNT | Paid | ชำระแล้ว | 已付 |
| ADMIN.BOOKINGS.DETAIL.OUTSTANDING_AMOUNT | Outstanding | ค้างชำระ | 未付 |
| ADMIN.BOOKINGS.DETAIL.REFUNDED_AMOUNT | Refunded | คืนเงินแล้ว | 已退款 |
| ADMIN.BOOKINGS.DETAIL.COL.TXN_DATE | Date/Time | วันที่/เวลา | 日期/时间 |
| ADMIN.BOOKINGS.DETAIL.COL.TXN_METHOD | Method | วิธีการชำระเงิน | 支付方式 |
| ADMIN.BOOKINGS.DETAIL.COL.TXN_AMOUNT | Amount | จำนวนเงิน | 金额 |
| ADMIN.BOOKINGS.DETAIL.COL.TXN_STATUS | Status | สถานะ | 状态 |
| ADMIN.BOOKINGS.DETAIL.NO_TRANSACTIONS | No payment transactions recorded. | ไม่มีรายการธุรกรรมการชำระเงิน | 暂无支付交易记录。 |
| ADMIN.BOOKINGS.DETAIL.SECTION.TIMELINE | Activity | ความเคลื่อนไหว | 活动记录 |
| ADMIN.BOOKINGS.DETAIL.EVENT.CREATED | Booking created | สร้างรายการจอง | 预订已创建 |
| ADMIN.BOOKINGS.DETAIL.EVENT.PAYMENT | Payment received ({{method}}) | ได้รับการชำระเงิน ({{method}}) | 收到付款（{{method}}） |
| ADMIN.BOOKINGS.DETAIL.EVENT.EXPIRES | Booking expires | รายการจองจะหมดอายุ | 预订即将过期 |
| ADMIN.BOOKINGS.DETAIL.EVENT.CURRENT_STATUS | Current status: {{status}} | สถานะปัจจุบัน: {{status}} | 当前状态：{{status}} |

Reused (no new key): `ADMIN.COMMON.ACTIONS`, `ADMIN.COMMON.UPDATING`, `ADMIN.COMMON.NO_DATA`.

### Design-system conformance
- **Reused patterns:** `.admin-modal` + `.admin-modal-backdrop` + `adminModalBackdrop` directive
  (app-themed, §6); `.admin-table`/`admin-status` pill classes + `.admin-skeleton` loading rows
  (already on this page); `admin-emphasis`/`admin-muted` text tokens; the row-click +
  guarded-`onRowActivate` + explicit small View-button dual affordance and the
  optimistic-open/stale-id-guard fetch pattern, copied from `UsabilityReportsPageComponent`
  (the closest existing read-only detail dialog); component-scoped modal-width override
  (`.bk-detail-modal { max-width: 900px }`), same idiom as `.ur-detail-modal`/`.admin-modal-lg`
  elsewhere; `var(--admin-surface-soft)` "structural, not data" background for the journey-group
  heading, same role it already plays for `admin-table thead` and the OBRS-231 expandable-row
  chip surface (§12).
- **New patterns:** (1) a **client-composed timeline list** (`.bk-timeline`) — no
  history/audit-log endpoint exists in this system yet, and no timeline/activity-feed UI exists
  anywhere in the admin module to reuse; justified because the alternative (omitting it) drops a
  requirement, and it introduces no new color (dot = `var(--accent)`, text = existing text/muted
  tokens) so it needs no dark-mode work. (2) a **two-fetch, two-flag optimistic-open** (rather
  than the single-fetch version `UsabilityReportsPageComponent` uses) — justified because this
  dialog's data genuinely comes from two separate existing endpoints (`getBookingById`,
  `getBookingPayments`) and gating passengers/tickets on the slower of the two would be a
  regression vs. showing each section as soon as its own data arrives; both fetches use the
  identical stale-id-guard idiom, so the risk profile is unchanged, just duplicated per-section.
  No spec-test lock added for either (read-only view, no state that can be silently clobbered by
  a stale write) — flag as a candidate for a lock spec only if a future card adds a mutating
  action to this dialog.
- **Confirm:** no selects in this dialog (read-only, no form) so §3.1 doesn't apply · exactly
  **zero** primary buttons (deliberately — no save/confirm action exists; Close is a plain
  `.bk-detail-close` icon button mirroring `.ur-detail-close`, not a `.admin-btn`/`.admin-btn-primary`
  pair, matching the usability-report dialog's own icon-only close, since a text "Close" button in
  `.admin-modal-actions` would imply there's a companion primary action there isn't) · no raw hex,
  every new color reference is a `var(--admin-*)`/`var(--accent*)` token · single title surface
  (route topbar renders "Bookings Management" already; this dialog's own `h4.admin-modal-title` is
  the modal's own title surface, not a page title, so §7 doesn't apply — same precedent as every
  other `.admin-modal-title` in the codebase) · no i18n string hardcoded, all new keys land in
  en/th/zh in the same commit.

## OBRS-316 Gap 1 scrutinize — full-replace guard hole on 2xx-empty-data (SELF_FIXED)
`vehicle-form-modal.component.ts` `initEditForm`: the R1 fetch-fail guard only set
`isEditDetailError` in the `catch` (thrown / non-2xx). A 2xx response with a null/empty
`data` envelope made `vehicleDetail = null`, skipped the patch, and cleared the loading
flag WITHOUT setting the error flag → Save re-enabled with the 7 attribute controls still
at blank fallback → a full-replace PUT would null all 7 saved attributes. Pattern for
full-replace edit forms opened from a partial row fallback: the "detail didn't arrive"
guard must cover BOTH throw AND loaded-but-empty (`response.data == null`), not just throw.
Fixed by branching on `vehicleDetail` inside the same-vehicle/still-open check and setting
`isEditDetailError = true` on the empty branch.
## OBRS-361/362 scrutinize self-fix (2026-07-14) — finish the seat-label consolidation
- `src/app/shared/lib/seat-label.ts`'s docstring claimed it consolidated BOTH the van's private
  `normalizeSeatNumber` AND `PassengerInfoComponent`'s inline `.match(/\d+/g)` regex. The van was
  repointed correctly, but `PassengerInfoComponent.normalizeSeatNumber` (`passenger-info.component.ts`)
  still re-implemented the digit regex → the docstring's claim was false and one duplicate regex
  remained.
- Fix (behavior-identical, verified by input enumeration + `tsc` + the 9 passenger-info specs):
  imported the shared util as `stripSeatDigits` and had the private method delegate to it, KEEPING
  the payload-specific null-return wrapper (`'' / no-digit` → `null`, which the shared util does not
  do because the booking payload needs `seatNumber: null`, not `''`, for "no manual seat").
- Lesson: when a shared util's docstring says "every X should call this", grep that it actually
  replaced EVERY call site — a half-finished consolidation leaves the util's own contract untrue.
  The method itself was correct to keep (distinct null semantics); only its inner regex was the dup.
## OBRS-403/376 merge scrutinize self-fix (2026-07-16) — one step-back rule, not two copies
- The merge correctly SPOTTED that mark/unmark-as-duplicate never inherited OBRS-403's
  auto-step-back guard (that path round-trips `store.refresh()` instead of `applyRowStatus()`'s
  optimistic mutate, because `duplicateCount` is server-derived), and added
  `stepBackIfPageEmptied()` for it. The diagnosis and the wiring were both right.
- But it left the ORIGINAL rule inlined in `applyRowStatus()` as a byte-near-identical copy —
  `if (this.currentPage > 1 && this.store.value?.content.length === 0) onPageChange(currentPage - 1)`
  differing only by a leading `leavesTab &&`. That re-creates, one level up, the exact
  "two call sites, one guarded" trap the merge had just finished fixing: the next paging rule
  change now has to be made in two places, and whichever is forgotten fails silently (a blank
  page is not an exception, and both copies' tests still pass independently).
- Fix (behavior-identical, 2551/2551 green, both tsc clean): `applyRowStatus()` now calls
  `if (leavesTab) { this.stepBackIfPageEmptied(); }`. `leavesTab` stays at the CALL SITE rather
  than moving into the shared method — it is that path's own precondition (a relabel-in-place
  can't empty a page), and the refresh-driven callers must NOT have it (post-refresh emptiness
  is authoritative regardless of why). `stepBackIfPageEmptied()` is now the single owner of the
  rule and its doc comment enumerates both callers.
- Lesson (DEV-GOTCHAS "enumerate the WHOLE family, don't spot-fix the named line"): when you
  find a guard missing at a second call site, the fix is to make the guard a single named unit
  BOTH sites call — not to hand-copy it to the site you just found. Copying it forward means the
  family now has two members to keep in sync instead of one, which is how the gap opened.

## OBRS-433 Scrutinize — Reviewer self-fix (errorCode mismatch) + returned finding

- SELF-FIXED (my-report-edit-form.component.ts `mapErrorCodeKey`): the FE mapped `VALIDATION_FAILED`,
  but the backend derives its errorCode by upper-casing the message key. `report.validation-failed`
  (thrown for a keepImageId that doesn't belong to the report, an invalid category, or a blank
  description) → `REPORT_VALIDATION_FAILED` (see backend `DomainException.deriveErrorCode`:
  `.toUpperCase().replace('.', '_').replace('-', '_')`). The old key was never emitted by this
  multipart endpoint, so that case fell through to the GENERIC toast. Added the real
  `REPORT_VALIDATION_FAILED` key (kept `VALIDATION_FAILED` as a harmless fallback). Lesson: FE error
  branching must read the LIVE backend code derivation, not a paraphrase — a domain BadRequest key
  keeps its `report.` prefix in the derived code (`REPORT_*`), it does NOT collapse to the generic
  bean-validation `VALIDATION_FAILED`.

- RETURNED (my-report-detail-modal + my-report-edit-form): the optimistic-open edit path is NOT
  immune to the clobber family (DEV-GOTCHAS "Every control an optimistic-open modal patches after
  fetch needs its own pristine-guard", 3 prior occurrences). The form fields are read once in
  ngOnInit (safe), but (a) the Edit button is reachable during the ~2s background GET / after a GET
  error, so it seeds from `toDetailFallback()` whose `description` is the TRUNCATED preview — saving
  then persists truncated text; and (b) `existingImages` is a LIVE getter (`this.detail.images`), so
  when the background GET reseats the parent `detail` mid-edit, the image picker's ngOnChanges
  re-seeds and discards any files the reporter attached during that window. Fix direction: gate entry
  to edit mode on "real detail loaded" (a flag set true only in the successful GET next-handler), not
  merely on `detail.editable`, so the form never seeds from the fallback and `detail` is stable for
  the edit's lifetime. Left for the developer because it is a behaviour/UX change that QA should
  verify and the unit specs don't cover the button-during-fetch gate.
