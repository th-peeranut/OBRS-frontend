# Agent Memory — Scrutinize notes for developers

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
