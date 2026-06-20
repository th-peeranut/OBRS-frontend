# Agent Memory — Scrutinize notes for developers

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
