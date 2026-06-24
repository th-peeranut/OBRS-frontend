# Agent Memory — Scrutinize notes for developers

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
