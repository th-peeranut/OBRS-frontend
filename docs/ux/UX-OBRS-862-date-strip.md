# UX/UI Specification — OBRS-862 · Schedule results day strip

Branch `ao/obrs-862-schedule-date-strip`. Governed by `docs/design-system.md`
(§2 tokens, §4 button roles, §5 shape, §9 i18n, §11 rubric, §12 new patterns).
No raw hex anywhere below — every colour is a token from `src/styles/variables.scss`
or `src/styles/_dark-tokens.scss`.

---

## 1. New routes / pages

**None.** `/schedule-booking` already exists
(`ScheduleBookingModule`, `src/app/modules/schedule-booking/schedule-booking.module.ts:29`).

---

## 2. Component hierarchy

```
ScheduleBookingComponent (smart, existing — schedule-booking.component.html)
  app-navbar
  app-stepper
  app-schedule-booking-filter      (existing, untouched)
  app-schedule-booking-day-strip   ◄── NEW, inserted HERE
  app-schedule-booking-list        (existing, empty-state block edited)
  app-footer
```

New files:

| File | Role |
|---|---|
| `src/app/modules/schedule-booking/components/schedule-booking-day-strip/schedule-booking-day-strip.component.ts` | smart component (reads store, fires availability, dispatches filter) |
| `…/schedule-booking-day-strip.component.html` | |
| `…/schedule-booking-day-strip.component.scss` | |
| `…/schedule-booking-day-strip.component.spec.ts` | incl. the AC-3 policy test |
| `src/app/shared/lib/day-label.ts` | `toBcp47` + `formatDayLabel` + `formatDayChip` (moved out of the list component, see §9) |
| `src/app/shared/lib/schedule-day-jump.ts` | `scheduleFilterForDay()` — the ONE place a day-change filter is built |

Declared in `ScheduleBookingModule.declarations` with `standalone: false`
(see the `LoadingStateComponent` header comment — Angular 19 flipped the default;
module-declared components in this repo must say so explicitly).

Not a `shared/` component: one call site, one page. If a second surface ever needs it,
that is the card that promotes it.

---

## 3. The day window (the "±3" decision)

**Decision: a 7-day window — the selected day with up to 3 days before it and the
remainder after, slid so it always holds 7 days where 7 days are legal.**

```
minDay   = start of today                       (matches the filter's `minDate`)
maxDay   = today + maxAdvanceDays               (BookingPolicyService, §7)
selected = clamp(scheduleFilter.departureDate, minDay, maxDay)

start = selected − 3 days
if (start < minDay)  start = minDay
end   = start + 6 days
if (end > maxDay) { end = maxDay; start = max(minDay, end − 6 days) }

chips = [start … end]           // 7 chips; fewer ONLY if maxDay − minDay < 6 days
```

Why 7 and not "±3 always":

1. **A symmetric ±3 is impossible on the day it matters most.** Today is the lower
   bound, so on the default search a ±3 strip is 4 chips; three days later it is 7.
   A control whose size changes under the customer is worse than one that slides.
2. **7 days = every weekday exactly once.** The fleet is 6 minibuses on a
   weekly-repeating timetable, so a 7-day window is the *smallest* window guaranteed
   to contain each weekday's pattern — a 5-day window can hide the only two days a
   route runs.
3. **It is the smallest window that also answers the empty state** (§6): "the nearest
   day with trips" is read out of the *same* response, so a shorter window would need
   a second, wider request for a question this one already answers.
4. **It stays scrollable rather than endless.** At a 360 px viewport ≈ 4.5 of the
   7 chips are visible (64 px chip + 8 px gap = 72 px into 328 px of content width),
   so the partially-cut chip at the right edge *is* the scroll affordance — no arrows,
   no gradient mask, no JS.

Reject-list (do not implement): month view, "next week" pager, infinite rail.

---

## 4. Availability data

### 4.1 Contract (shipped on `origin/dev`, OBRS-1251)

`POST /api/schedules/availability` — public, unauthenticated.

```
request  { fromStop: string, toStop: string, numberOfPassengers: 1..21,
           fromDate: "YYYY-MM-DD", days: int >= 1 }
response { availableDates: ["YYYY-MM-DD", …] ascending, effectiveDays: int }   // under ApiSuccessRespDto
```

### 4.2 Where it lives

Add to the **existing** `ScheduleService`
(`src/app/services/schedule/schedule.service.ts`) — same `/api/schedules/*` family,
no new service:

```ts
getAvailabilityCached(req: ScheduleAvailabilityReq): Observable<ScheduleAvailability | null>
```

- Session-scoped `Map<string, Observable<…>>` + `shareReplay({ bufferSize: 1, refCount: false })`,
  keyed on `fromStop|toStop|numberOfPassengers|fromDate|days`. This mirrors
  `RouteMapService.sharedRequests` (the established precedent) and exists because
  **two** components consume the same answer — the strip and the list's empty state.
  Without it they issue two byte-identical POSTs per search.
- `HttpContext` MUST set `SKIP_GLOBAL_LOADING_ALERT` **and** `SKIP_GLOBAL_ERROR_ALERT`.
  Without them every results page flashes the blocking overlay for a background
  refinement, and a failure pops a modal over a page that is working fine. Same rule
  as `BookingPolicyService.getBookingPolicy` and `ScheduleService.getBlockedSeats`.
- `catchError(() => of(null))` — a failure is "we were told nothing", never an error UI.
- Cache staleness is accepted: seats sell while the page is open, so a day cached as
  available can go empty. Worst case the customer taps and meets the existing empty
  state — exactly the pre-card behaviour. Do **not** add a TTL for this card.

Interfaces, added to `src/app/shared/interfaces/schedule.interface.ts`:

```ts
export interface ScheduleAvailabilityReq {
  fromStop: string; toStop: string; numberOfPassengers: number;
  fromDate: string; days: number;
}
export interface ScheduleAvailability {
  availableDates: string[];   // ascending "YYYY-MM-DD"
  effectiveDays: number;
}
```

### 4.3 When it fires

The strip subscribes to `selectScheduleFilter` + `selectProvinceWithStation` and
computes a **request key**. It fires only when the key **changes** and is complete:

- `fromStop` and `toStop` both resolve to a slug (`getStationSlugById`, existing
  helper in `shared/interfaces/station.interface.ts`), and
- `numberOfPassengers = adultCount + kidsCount` is `>= 1` and
  `<= MAX_PASSENGERS_PER_BOOKING` (21, `shared/constants/passenger-limits.ts`) —
  the server validates `byte 1..MAX_PASSENGERS_PER_BOOKING` and would 400 otherwise.

Mirrors `ScheduleBookingFilterComponent.isSearchable()`. The key includes `fromDate`
and `days`, so one tap on a chip slides the window and fires **one** availability POST
alongside the search POST already in flight. `distinctUntilChanged` on the key absorbs
the several `scheduleFilter` emissions a single change produces.

### 4.4 Per-day state resolution

For chip *i* (0-based) at date *D* in `[start … end]`:

| Condition | State |
|---|---|
| `D === selected` | **selected** |
| `i >= effectiveDays` | **unknown** — the server did not answer for this day |
| `availableDates` includes `D` | **available** |
| otherwise | **unavailable** |
| availability is `null` (in flight, failed, or key incomplete) | **available**, for every chip |

**`unknown` renders exactly like `available` — identical tokens, selectable.** This is
the deliberate answer to "design what the strip shows beyond `effectiveDays`": greying
a day is a *statement to a customer* ("there are no trips"), and beyond `effectiveDays`
we have not been told that. Rendering it as available makes no claim and lets the
search — the authority — answer. Do not invent a third visual state for it: the only
thing the customer could do with the distinction is what they can already do, which is
tap it. **Write this reason in the component.**

In practice `unknown` is transient: the strip's own upper bound is already clamped to
the policy cap, so it only appears while `getBookingPolicy()` is still in flight and
the fallback 60 is wider than the server's real cap.

---

## 5. The strip — DOM, states, tokens

### 5.1 DOM

```html
<!-- schedule-booking-day-strip.component.html -->
@if (isSearchable()) {
  <div class="day-strip"
       role="group"
       [attr.aria-label]="'SCHEDULE_BOOKING.DAY_STRIP_LABEL' | translate"
       [attr.aria-busy]="isAvailabilityInFlight"
       data-testid="day-strip">
    @for (day of days; track day.iso) {
      <button type="button"
              class="day-strip__chip"
              [class.is-selected]="day.state === 'selected'"
              [class.is-unavailable]="day.state === 'unavailable'"
              [attr.aria-pressed]="day.state === 'selected'"
              [attr.aria-disabled]="day.state === 'unavailable'"
              [attr.data-date]="day.iso"
              data-testid="day-strip-chip"
              #chip
              (click)="selectDay(day)">
        <span class="day-strip__weekday">{{ day.weekdayLabel }}</span>
        <span class="day-strip__date">{{ day.dateLabel }}</span>
        @if (day.state === 'unavailable') {
          <span class="visually-hidden">{{ 'SCHEDULE_BOOKING.DAY_STRIP_NO_TRIPS' | translate }}</span>
        }
      </button>
    }
  </div>
}
```

`day.weekdayLabel` = `'SCHEDULE_BOOKING.DAY_STRIP_TODAY' | translate` when the date is
today, otherwise `Intl` short weekday (§9). `day.dateLabel` = `Intl` day + short month.

`isSearchable()` gates the whole strip: with no station pair or no passengers no search
has run either, and an orphan day control above an empty page is worse than nothing.

### 5.2 Colour + spacing tokens

**Light** (`@import "../../../../../styles/variables.scss";`):

| Element / state | Property | Token |
|---|---|---|
| `.day-strip` | gap | `$space-2xs` (8 px — the rubric's minimum neighbour spacing) |
| `.day-strip` | padding-block | `$space-2xs` |
| `.day-strip__chip` (all) | border-radius | `$radius-md` (12 px) |
| | padding | `$space-2xs $space-xs` |
| | min-width / min-height | `64px` / `56px` (≥ 44×44 rubric floor; 64 fits `10 ส.ค.` at 14 px Sarabun) |
| | border | `1px solid` (colour per state) |
| | font-size (weekday row) | `$font-size-xs` |
| | font-size (date row) | `$font-size-sm` |
| | transition | `background-color $duration-fast $easing-standard, color $duration-fast $easing-standard` |
| **available** / **unknown** | background | `$primary-white` |
| | color | `$text-black` |
| | border-color | `$primary-grey` |
| available `:hover` | color | `$primary-blue` |
| **selected** | background | `$primary-blue` |
| | color | `$text-white` (5.33:1 — recorded in `variables.scss:25`) |
| | border-color | `$primary-blue` |
| | font-weight | `$font-weight-bold` |
| **unavailable** | background | `$primary-lightgrey` |
| | color | `$text-black` |
| | border-color | `$primary-lightgrey` |
| | `.day-strip__date` | `text-decoration: line-through` |
| | cursor | `default` |
| **today** | *(no colour of its own)* | the weekday row renders `DAY_STRIP_TODAY` instead of the abbreviation — see §5.4 |
| any `:focus-visible` | box-shadow | `$shadow-focus`, `outline: none` |

`$text-black` (not `$text-softblack`) on `$primary-lightgrey`: `variables.scss:75-77`
records that `$text-softblack`'s only sub-AA sites sat on a grey of this family and
were repointed to `$text-black`. Do not repeat that.

**Dark** — component-owned `:host-context(body.is-dark)` block, *not* `dark-theme.scss`
(OBRS-767: a global rule cannot outrank this component's own emulated-encapsulation
selectors). Import `../../../../../styles/dark-tokens`.

| State | Property | Token |
|---|---|---|
| available / unknown | background / color / border | `$dk-bg-card` / `$dk-text` / `$dk-border` |
| available `:hover` | color | `$dk-accent` |
| selected | background / color | `$dk-accent` / `$dk-bg` (9.31:1 — the recorded inversion `dark-theme.scss` uses for `.sold-out-today__action` and `trip-type-toggle .is-selected`; `$text-white` on `$dk-accent` would be 2.03:1) |
| unavailable | background / color / border | `$dk-bg-soft` / `$dk-text-muted` / `$dk-border-muted` (≥ 5.38:1, derived from the measurement recorded at `variables.scss:98` for the darker `#989ba4` on this same surface) |
| `:focus-visible` | `outline: 2px solid $dk-accent; outline-offset: 2px; box-shadow: none` | `$shadow-focus` is `rgba($primary-blue, .2)` and is invisible on `$dk-bg` |

### 5.3 Scroll, touch, and viewport overflow (AC-6)

```scss
:host {
  display: block;                        // OBRS-775
  width: min(100%, 1200px);              // aligns with .booking-card and .booking-container
  margin: 0 auto;
  padding-inline: $space-sm;
  box-sizing: border-box;
}
.day-strip {
  display: flex;
  gap: $space-2xs;
  overflow-x: auto;
  overscroll-behavior-x: contain;        // a horizontal fling does not become a page/back gesture
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}
.day-strip__chip { flex: 0 0 auto; }
```

The overflow lives on the **inner** flex row, never on the host or the page — the
rubric's "wide content scrolls, the shell never scrolls sideways" rule, and the reason
this cannot deepen OBRS-634. `:host` is capped by `min(100%, …)`, so the strip cannot
exceed the viewport at any width.

On every change of the selected day the component scrolls its selected chip into view:

```ts
chip.scrollIntoView({
  inline: 'center',
  block: 'nearest',                              // load-bearing: without it the page scrolls vertically
  behavior: prefersReducedMotion ? 'auto' : 'smooth',
});
```
(`prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches`.)
Required, not decoration: the window slides on every tap, so on a phone the selected
chip would otherwise land off-screen and AC-1 fails.

### 5.4 Loading and failure (the strip)

| Situation | What the strip shows |
|---|---|
| availability in flight | every chip in range rendered, **enabled**, real dates; `aria-busy="true"` on the container. No spinner, no skeleton. |
| availability failed | identical to in-flight, `aria-busy="false"`. No alert, no retry, nothing logged to the user. |
| availability resolved | greying applied per §4.4 |
| the **search** in flight (after a tap) | nothing extra — `ScheduleService.getByFilter` carries no SKIP context, so the existing global loading overlay already covers it |

No spinner and no skeleton is a decision, not an omission: the chips are their own
reserved space (the rubric's "no layout jump" rule is satisfied by rendering them
immediately), the strip is **fully usable** before availability lands — availability
only ever *removes* options — and a spinner would advertise a wait that blocks nothing.
Same posture as `loadRouteSegments()` / `loadProvinceStops()` in the filter component:
a refinement must never block and never alert.

Accepted trade-off: a chip tapped in the instant before availability lands may have
been about to grey. The customer then sees the empty state — which is the behaviour
they have today for every day. Do not add a guard for it.

---

## 6. The empty state (part 2) and its relationship to `sold-out-today`

### 6.1 The rule

There is **one** empty-result block, and it is the existing `.sold-out-today` /
`.no-results` markup in `schedule-booking-list.component.html`. **No second widget.**
The new "nearest day with trips" copy *replaces the hint + button inside the block
already there* whenever availability gives a real answer, and falls back to today's
exact behaviour when it does not.

`nearestDay` is read from the **same** cached availability response as the strip
(`getAvailabilityCached`, §4.2 — one HTTP call serves both):

```
after  = first date in availableDates strictly after  selected
before = last  date in availableDates strictly before selected
nearestDay = after ?? before ?? null
```

Forward wins ties by construction — a customer looking for a trip wants the next one.
`nearestDay` is `null` when availability is unknown, empty, or holds only the selected
day. **"Nearest" means nearest inside the 7-day window** — that is what we asked about,
so the copy is true; when the window holds nothing, the block degrades to today's copy
and makes no claim. (See OPEN DECISION #2.)

### 6.2 Markup — surgical edit only

`.no-results` and `.sold-out-today__*` are **`mustRender` entries in the contrast gate**
(`e2e/support/customer-pages.ts:605,626`) and carry hand-tuned `!important` dark
overrides (`dark-theme.scss:780-825`). **Rename nothing, delete no class.**

```html
@if (!schedules.departureSchedules?.length) {
  @if (soldOutToday$ | async; as soldOutToday) {
    <div class="sold-out-today">
      <p class="sold-out-today__title">{{ "SCHEDULE_BOOKING.SOLD_OUT_TODAY_TITLE" | translate }}</p>
      @if (nearestDay$ | async; as nearestDay) {
        <p class="sold-out-today__hint">
          {{ "SCHEDULE_BOOKING.NEAREST_DAY_HINT" | translate: { date: nearestDay.label } }}
        </p>
        <button type="button" class="sold-out-today__action"
                data-testid="nearest-day-action" (click)="showDay(nearestDay.iso)">
          {{ "SCHEDULE_BOOKING.SOLD_OUT_TODAY_ACTION" | translate: { date: nearestDay.label } }}
        </button>
      } @else {
        <p class="sold-out-today__hint">{{ "SCHEDULE_BOOKING.SOLD_OUT_TODAY_HINT" | translate }}</p>
        <button type="button" class="sold-out-today__action" (click)="showNextDay()">
          {{ "SCHEDULE_BOOKING.SOLD_OUT_TODAY_ACTION" | translate: { date: soldOutToday.nextDayLabel } }}
        </button>
      }
    </div>
  } @else {
    <div class="sold-out-today">
      <p class="no-results">{{ "SCHEDULE_BOOKING.NO_RESULTS" | translate }}</p>
      @if (nearestDay$ | async; as nearestDay) {
        <p class="sold-out-today__hint">
          {{ "SCHEDULE_BOOKING.NEAREST_DAY_HINT" | translate: { date: nearestDay.label } }}
        </p>
        <button type="button" class="sold-out-today__action"
                data-testid="nearest-day-action" (click)="showDay(nearestDay.iso)">
          {{ "SCHEDULE_BOOKING.SOLD_OUT_TODAY_ACTION" | translate: { date: nearestDay.label } }}
        </button>
      }
    </div>
  }
}
```

One SCSS line is added so the wrapped `<p>` does not double its padding — the render is
then **pixel-identical** to today's `.no-results` when `nearestDay` is null:

```scss
.sold-out-today .no-results { padding: 0; margin: 0; }
```

`SOLD_OUT_TODAY_ACTION` ("ดูรอบ{{date}}" / "Show trips on {{date}}" / "查看{{date}}的班次")
is **reused verbatim** for the nearest-day button — same action, same words, no new key.

Button role (§4): `.sold-out-today__action` is the block's single primary and stays the
only one. The selected chip's `$primary-blue` fill is a **selection state**, not a
button role — the identical precedent is `app-trip-type-toggle .is-selected`, already
`$primary-blue`-filled on this same page.

---

## 7. Upper bound from `BookingPolicyService` (AC-3)

Mirror `ScheduleBookingFilterComponent` exactly (`schedule-booking-filter.component.ts:83-93, 147-181`):

```ts
minDate = new Date();                                     // AC-3 lower bound
maxAdvanceDays = BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK; // 60, in-flight only
// ngOnInit:
this.bookingPolicyService.getBookingPolicy()
  .pipe(takeUntil(this.destroy$))
  .subscribe({
    next: (r) => { if (r.data) { this.maxAdvanceDays = r.data.maxAdvanceDays; this.rebuildWindow(); } },
    error: () => undefined,     // required, not stylistic — see the filter's comment
  });
```

⛔ Never a literal. `BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK` is imported from
`src/app/services/booking-policy/booking-policy.service.ts`, used only until the
response lands, and never copied into a second constant.

**The AC-3 unit test** (`schedule-booking-day-strip.component.spec.ts`) — it must fail
if someone hardcodes 60:

1. Stub `getBookingPolicy()` → `{ data: { maxAdvanceDays: 3, cutoffMinutes: 20 } }`.
   Assert the strip renders chips for `today … today+3` and **no** chip for `today+4`.
2. Stub `getBookingPolicy()` → `{ data: { maxAdvanceDays: 90 } }`, seed the filter's
   `departureDate` at `today+80`. Assert chips render around `today+80`.
   **This arm is the one that proves the API is read** — `today+80` is unreachable
   under the fallback 60, so a hardcoded constant fails here.
3. Stub `getBookingPolicy()` → `throwError(…)`. Assert the strip still renders and its
   upper bound is `today+60` (fallback intact, no alert raised).

---

## 8. Round trip (AC-4) — decided, with the reasoning to paste into the code

**The strip drives the OUTBOUND leg only. The return leg is carried forward by the
existing single-source rule, in the same dispatch, never left to drift.**

New shared lib, `src/app/shared/lib/schedule-day-jump.ts`:

```ts
/**
 * OBRS-862 AC#4 — moving the search to another day, in ONE place.
 *
 * The day strip drives the OUTBOUND leg only. Two reasons, and neither is
 * convenience:
 *   1. The availability endpoint answers for one ordered stop pair. A round
 *      trip would have to ask twice (stops swapped) and INTERSECT the answers,
 *      which would grey out a day that genuinely has an outbound trip because
 *      the customer's separately-chosen return date has none. That is a false
 *      statement to a customer, and greying is a statement (owner, 2026-08-11).
 *   2. The return date is a second, independent intent. A strip that moved
 *      both legs together would silently re-decide how long the customer stays.
 *
 * The return leg does NOT drift, because it moves by the rule that already
 * owns it: `carryReturnDate` (OBRS-1185, shared/lib/return-date.ts) — unchanged
 * when it is still on or after the new departure, re-derived from it otherwise.
 * It is written into the SAME dispatch as the departure date, so the store, the
 * filter form and the search payload can never disagree about it.
 */
export function scheduleFilterForDay(
  filter: ScheduleFilter,
  day: Date | string,
  maxDate: Date
): ScheduleFilter
```

Returns `{ ...filter, departureDate: 'YYYY-MM-DD' }`, plus
`returnDate: carryReturnDate(newDeparture, currentReturn, maxDate)` when the filter is
a round trip (`roundTrip.id === 2`, read defensively — `roundTrip` reaches the store as
either the `Dropdown` or its bare id).

Callers — all three, no fourth:
- `ScheduleBookingDayStripComponent.selectDay()`
- `ScheduleBookingListComponent.showDay()` (new, §6)
- `ScheduleBookingListComponent.showNextDay()` (**rewritten** to use it)

`SoldOutTodayState.canJumpToNextDay` is **deleted** together with the
`@if (soldOutToday.canJumpToNextDay)` guard. It was the owner's 2026-08-10 workaround
for the precise problem this card solves — its recorded reason is *"this screen has no
say over the return leg"*, and as of this card it does. See OPEN DECISION #1.

---

## 9. Weekday / date labels (AC-5)

Short weekday names come from `Intl.DateTimeFormat` in the active locale, **not** from
i18n keys — the platform already ships correct th/en/zh calendar data
(`th-TH` → `จ.`, `en-GB` → `Mon`, `zh-CN` → `周一`), and a hand-maintained key set for
21 strings is 21 chances to drift. This is the shipped OBRS-1217 precedent
(`ScheduleBookingListComponent.formatDayLabel`).

Move `toBcp47()` and `formatDayLabel()` out of the list component into
`src/app/shared/lib/day-label.ts` and add:

```ts
formatDayChip(date: Date, lang: string): { weekday: string; date: string }
// weekday: Intl { weekday: 'short' }
// date:    Intl { day: 'numeric', month: 'short' }
// same try/catch fallback to dayjs the original has — a locale the runtime
// rejects must not blank the chip out.
```

Both the list and the strip import from there. The list's own `formatDayLabel` call
sites keep working unchanged (import swap only). Language changes are picked up from
`TranslateService.onLangChange` with `startWith(currentLang)`, exactly as the list does.

Today's chip shows the translated word instead of the abbreviation, so the customer's
anchor is a word and not arithmetic.

---

## 10. Forms

**None.** The strip has no `FormGroup`, no `FormControl`, and no select — it writes to
the store and lets the existing filter form re-render itself. Design-system §3.1
(dropdown contract) is not engaged by this card.

---

## 11. User flows

1. Customer lands on `/schedule-booking` from the home search → filter's store
   subscription dispatches `invokeGetScheduleListApi` (existing) → **in parallel** the
   strip resolves its window and calls `getAvailabilityCached` → chips render enabled
   immediately, then grey where the answer says there are no trips.
2. Customer taps an **available** chip → `invokeSetScheduleFilterApi` with the new
   `departureDate` (+ carried `returnDate` on a round trip) → the filter component's
   existing `scheduleFilter` subscription patches its date control **and** re-runs the
   search (`schedule-booking-filter.component.ts:244-270`) → list updates, filter form
   shows the new date (**AC-2 satisfied with zero new NgRx**) → strip re-derives its
   window, re-fires availability for the new key, scrolls the selected chip to centre.
3. Customer taps an **unavailable** chip → nothing happens. `selectDay()` returns early;
   there is no dispatch, no request, no toast. Screen readers announce
   "no trips" from the visually-hidden span.
4. Search returns empty → the block in §6 renders; if availability knows a nearer day,
   the hint names it and the button jumps there through the same path as (2).
5. Customer opens the filter form's calendar and searches a day outside the window →
   the store change re-anchors the strip around the new day. The strip never fights the
   form; both read the same store value.

---

## 12. NgRx changes

**None. No new action, no new selector, no new effect, no new reducer, no new feature slice.**

| Need | Existing surface used |
|---|---|
| read the selected day, stations, passengers, trip type | `selectScheduleFilter` |
| map station id → slug | `selectProvinceWithStation` + `getStationSlugById()` |
| change the day, update the store AND the filter form | `invokeSetScheduleFilterApi` |
| re-run the search | *nothing* — the filter component's existing `scheduleFilter` subscription does it, behind its own `isSearchable()` guard |

⛔ The strip MUST NOT dispatch `invokeGetScheduleListApi`. That is the OBRS-1503 bug
(two identical `POST /schedules/search` per press); one filter dispatch already runs
the search. Availability lives in component state fed by the cached service (§4.2), not
in the store — it is a per-request refinement, not shared application state, and an
NgRx slice for it would be four files for one consumer pair.

---

## 13. i18n keys to add

Three new keys in `public/i18n/{en,th,zh}.json` under `SCHEDULE_BOOKING`.
`SOLD_OUT_TODAY_ACTION` is reused for the nearest-day button — no fourth key.

| Key | TH | EN | ZH |
|---|---|---|---|
| `SCHEDULE_BOOKING.DAY_STRIP_LABEL` | เลือกวันเดินทาง | Choose travel day | 选择出行日期 |
| `SCHEDULE_BOOKING.DAY_STRIP_TODAY` | วันนี้ | Today | 今天 |
| `SCHEDULE_BOOKING.DAY_STRIP_NO_TRIPS` | ไม่มีรอบเดินทาง | No trips | 无班次 |
| `SCHEDULE_BOOKING.NEAREST_DAY_HINT` | วันที่มีรอบเดินทางใกล้ที่สุดคือ{{date}} | The nearest day with trips is {{date}} | 最近有班次的日期是{{date}} |

(`NEAREST_DAY_HINT` is the fourth — it is new; `SOLD_OUT_TODAY_ACTION`,
`SOLD_OUT_TODAY_TITLE`, `SOLD_OUT_TODAY_HINT`, `NO_RESULTS` are all reused as-is.)

Thai `NEAREST_DAY_HINT` has no space before `{{date}}` on purpose — the interpolated
label starts with a Thai weekday ("วันอังคาร 11 ส.ค."), matching the existing
`SOLD_OUT_TODAY_ACTION` = "ดูรอบ{{date}}".

---

## 14. Accessibility

| Concern | Spec |
|---|---|
| container role | `role="group"` with a translated `aria-label`. **Not `tablist`/`aria-selected`**: `aria-selected` is only valid on `option`/`tab`/`row`/`gridcell`, and a real `tablist` would drag in `aria-controls` on a results list this component does not own, plus a roving-tabindex handler. `role="group"` + `aria-pressed` is the precedent already on this page (`app-trip-type-toggle`). |
| selected state | `aria-pressed="true"` **and** a fill inversion **and** `$font-weight-bold` — never hue alone (rubric). |
| unavailable state | `aria-disabled="true"` + a visually-hidden `DAY_STRIP_NO_TRIPS` + `line-through` on the date. **Not the native `disabled` attribute** — a disabled button leaves the tab order, so a keyboard user cannot reach it and never hears *why* the day is dead. `selectDay()` no-ops instead. |
| keyboard | Native. Each chip is a `<button>` in document order; Tab/Shift+Tab move, Enter/Space activate. No arrow-key handler, no roving tabindex — 7 buttons is not a grid, and the filter bar above already contributes more than that. |
| focus ring | `$shadow-focus` (light) / `outline: 2px solid $dk-accent; outline-offset: 2px` (dark). Never `outline: none` without a replacement. |
| in-flight | `aria-busy` on the container; nothing announced, nothing moves. |
| tap targets | 64×56 px minimum, 8 px gaps — clears the rubric's 44×44 / 8 px customer-surface floor. |
| motion | Colour transitions at `$duration-fast` (150 ms), matching `trip-type-toggle`. `scrollIntoView` uses `behavior: 'auto'` under `prefers-reduced-motion: reduce`. |

---

## 15. Test / evidence surface the implementer must not skip

- **Contrast gate blind spot (the OBRS-1228 lesson).** `e2e/support/customer-pages.ts`
  seeds the store directly and mocks no HTTP, so on all three `/schedule-booking`
  entries availability resolves to `null` and **every chip renders available** — the
  **unavailable** chip and the **selected-on-dark** chip would never be measured.
  Add a seeded availability response (or a fourth entry) whose `mustRender` includes
  `.day-strip__chip.is-unavailable` and `.day-strip__chip.is-selected`, in both themes.
  This is exactly how `.no-results` shipped at 4.45:1 for eleven months.
- **Unit:** the three AC-3 arms in §7; window clamping at `today` and at the cap;
  `scheduleFilterForDay` carrying / not carrying the return date; `selectDay()` on an
  unavailable chip dispatches nothing; the request key does not re-fire on an unchanged
  filter emission.
- **AFTER evidence** for the Jira card: light + dark, mobile (360 px) + desktop, showing
  (a) the strip with at least one greyed day, (b) an empty result with the nearest-day
  button, (c) the strip not overflowing the viewport at 360 px.

---

## 16. Design-system conformance

**Reused patterns**
- `app-trip-type-toggle` — the segmented-selection look, verbatim: `$primary-blue` fill
  + `$text-white` selected, `$shadow-focus`, `$duration-fast` colour transition, and
  the dark inversion `$dk-accent` fill + `$dk-bg` label (§2.4.0 / §12 OBRS-312 lineage).
- `.sold-out-today` block, classes and dark overrides — extended, not forked (§10).
- `.sold-out-today__action` as the empty state's single primary (§4).
- `$radius-md` (12 px) — §5's sanctioned **multi-line** radius. §5's pill applies to
  single-line form controls; a two-row day chip is the same case a `textarea` is, and
  it must not be forced into a 999 px pill.
- Material Symbols only (none needed here), Sarabun, `$space-*` scale, `$font-size-*`.
- `RouteMapService.sharedRequests` — the request-dedup cache shape (§4.2).
- `BookingPolicyService` + `BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK` (§7).
- `:host-context(body.is-dark)` for a component's own dark rules (OBRS-767).

**New patterns (§12 — add each as a row to `design-system.md` when this ships)**
1. **Horizontally scrolling day strip.** No existing customer-shell control is a
   scrollable single-select rail: `trip-type-toggle` is a fixed 2-option pill pair,
   `nav-tabs`/`.schedule-tabs` are admin-shell and read `--admin-*` which does not
   resolve outside `.admin-shell`, and PrimeNG has no matching primitive. Locked by
   the spec test in §15.
   *Locking spec to add:* "A horizontally scrollable selection rail puts `overflow-x`
   on the inner flex row, never on `:host` or the page; `:host` is capped with
   `width: min(100%, <max>)`; chips are `flex: 0 0 auto` at ≥ 44×44 with ≥ 8 px gaps."
2. **"Unavailable" as a selection state.** New state colour role — light
   `$primary-lightgrey` / `$text-black`, dark `$dk-bg-soft` / `$dk-text-muted`, plus a
   non-hue carrier (`line-through`) and `aria-disabled` rather than `disabled`.
   *Locking spec to add:* "An option shown as unavailable stays focusable
   (`aria-disabled`, not `disabled`), carries a visually-hidden reason, and marks the
   state with a glyph or decoration as well as the fill."

**Confirm**
- Selects: none introduced — §3.1 not engaged.
- One primary per screen: unchanged; the selected chip is a state, not a role.
- Tokens not raw hex: every value in §5.2 is a `variables.scss` / `_dark-tokens.scss` token.
- Single title surface: untouched; the strip renders no heading.
- Keys in en/th/zh: §13, four new keys, all three files.

---

## 17. OPEN DECISIONS

**#1 — Reversing the 2026-08-10 "no jump button on a round trip" call.**
That decision's recorded reason was *"moving the outbound to tomorrow can leave the
return date BEFORE it, and this screen has no say over the return leg"*
(`schedule-booking-list.component.ts:64-67`). This card gives the screen that say —
`carryReturnDate` moves the return leg in the same dispatch — so the premise is gone,
and since OBRS-1185 made round trip the **default**, leaving the guard in place would
mean the strip works for round trips while the empty-state button beside it does not.

- **Recommended (specced above):** delete `canJumpToNextDay` and its guard; both the
  strip and the button work for every trip type, with the return date carried.
  *Downside:* a round-trip customer's return date can be moved for them (only when it
  would otherwise precede the new outbound), which is visible in the filter form and in
  the summary but is not something they typed.
- **Fallback if the owner disagrees:** keep `canJumpToNextDay` exactly as it is
  (one `@if`, one field) and keep the strip working for round trips. Cost: the empty
  state has a hint with no button for the default trip type — the dead end AC-1 exists
  to remove, half-removed.

**#2 — "Nearest day" is nearest *within the 7-day window*.**
If SIT shows routes with gaps wider than a week, the empty state will fall back to
plain `NO_RESULTS` and offer nothing. The fix is a second, wider availability request
fired only when the result is empty (one extra POST, only on the empty path). Not
specced here because it is not required by any AC and a weekly-repeating 6-vehicle
timetable puts every operating weekday inside 7 days. Flagging it so it is a measured
follow-up card rather than a surprise.
