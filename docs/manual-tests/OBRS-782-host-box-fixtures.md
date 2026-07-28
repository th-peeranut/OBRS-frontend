# OBRS-782 — the seven screens the sweep could not open

Spinoff from OBRS-776 (`458cb72c`). That card widened `host-box-sweep.spec.ts` to 42 screens
and then said plainly what it had not done: **seven components render a PrimeNG host that no
screen in the lane could make render**, so they were covered by a *variant* argument instead
of by measurement. This card reaches them.

The result is not the tidy one. Opening those screens found **three malformed hosts that no
run in this repo had ever measured**, one of which was not on the card's list at all.

---

## 1. What was actually in the way

The sweep answers `/api/**` with `null` **on principle**, and the principle is right: an empty
table has the same host tree as a full one, so richer fixtures buy nothing and cost a second
copy of a server shape. That is true of every other page in the lane and **false for exactly
these seven** — a `p-tabView` behind `*ngIf="selectedTrip"` does not render a *different* box
when the list is empty, it renders **no box at all**.

So this was never "add seven more pages". It was a change to what the harness assumes.

`SweepPage` gained `fixture?: FixtureRule[]` alongside its existing `act?`: a short list of
`{ match: RegExp, body }` consulted by `mockEmptyBackend` **before** its generic answers, set
by `visit()` on every navigation and therefore **cleared** by the next one. Module state, not a
`page.route` — routes stack, and a handler registered for one screen would still be answering
three screens later, putting rows on a page whose whole point is that it has none.

The bar for a fixture is the same as for an `act`: the **smallest** thing that makes the host
exist. Not a working sales flow — one row, one status, one selectable trip.

## 2. The five screens, and what each one cost

| new screen | reaches | fixture | clicks |
| --- | --- | --- | --- |
| `staff-sell-trip-details` | `app-walk-in-center-panel`, `app-trip-details-edit-form` | one walk-in trip + its route segments | trip row → Trip Details tab |
| `staff-sell-schedule-modal` | `app-sell-page` | **none** | Add schedule |
| `staff-boarding-list-delay` | `app-boarding-list` | `GET /schedules/42` → `status: 'scheduled'` | Mark delayed |
| `admin-vehicles-maintenance` | `app-vehicle-maintenance-panel` | one vehicle + empty maintenance list | Manage maintenance → Add |
| *(none — folded into `admin-promotions`)* | `app-round-trip-promotion-card` | the round-trip singleton | none |

Two things worth keeping:

- **`app-sell-page` needed no fixture at all.** Its calendars are in a modal gated on
  `scheduleStore.hasValue`, and that store resolves on six *empty* lists exactly as it already
  does on `/staff/schedules`. The OBRS-776 entry excusing it named the click and the store, and
  the store half was never true.
- **The round-trip promotion got no page of its own.** It needs no click, so a second visit to
  `/admin/promotions` would have bought one component and paid a full navigation for it.
  Folding the fixture into the existing entry costs nothing.

`app-parcel-trip-form` is deliberately still in `NOT_SWEPT` and needs no card: the case
`the parcel-booking exclusion has not expired` re-reads `onlineParcelBooking` from
`environment.base.ts` on every run, so the entry expires by itself the day the flag flips.

### The selector this quietly broke

`admin-promotions-modal` clicked `app-promotions-page button.admin-btn-primary` and took
`.first()`. That was safe **only while the round-trip card above it rendered nothing**. With its
form populated, the card's own Save button is the first `admin-btn-primary` on the page, and
the click would have submitted a promotion instead of opening the modal. Narrowed to
`.admin-page-intro button.admin-btn-primary`, which the card does not use.

Worth stating because it is the general shape: **a fixture that makes a page fuller can break a
selector written against the empty one**, and the failure would have been an `act` assertion
timing out on a screen nobody was looking at.

## 3. What the five screens turned up

Three malformed hosts — `display: inline` around in-flow block children, the OBRS-753 defect —
none of which any previous run could see:

| component | block child | why nothing had measured it |
| --- | --- | --- |
| `app-reschedule-date-picker-step` | `div.reschedule-step` | step one of a dialog only a reschedulable booking row opens |
| `app-trip-details-edit-form` | `form.trip-edit-form` | second tab of the walk-in centre panel, two clicks past a trip selection |
| `app-passenger-seat-bus` | `div.card-container` | **not on the card's list** |

`app-passenger-seat-bus` is the one to read twice. It has four call sites, two of them on pages
the sweep already reached — and on those it never had the component *on screen*. It came into
view as a **side effect** of reaching `app-walk-in-center-panel`, whose Ticket Sales tab renders
it the moment a trip is selected. A census widened for one reason found a defect for another,
which is the argument for widening rather than for arguing.

All three fixed with `:host { display: block }` and the reason recorded in each stylesheet.
`ALLOW` is empty and `NOT_SWEPT` holds one entry.

## 4. A fourth false-positive source in the geometry diff

The first AFTER run reported **411 moved elements** across three viewports. Not one of them was
layout.

`html`'s own **height was identical to the hundredth of a pixel** in both phases
(1650.86 / 2200.59 / 2366.09) and only its `y` differed — and `app-reschedule-date-picker-step`,
the host whose display had actually changed, **appeared nowhere in the diff**. It was one scroll
delta wearing 411 costumes: `getBoundingClientRect` is viewport-relative, and a screen reached
by *clicking* is measured from wherever the scrolling left it.

This is the fourth such source after animation, `<head>` growth and the webfont, and it is the
only one a tolerance could never separate from a real move — it displaces **everything by the
same amount**, which is exactly what a page that shifted looks like.

**Three attempts to fix it by scrolling back to the top all failed**, and the failures are the
useful part:

| attempt | measured at |
| --- | --- |
| `window.scrollTo(0,0)` in `settle()`, before its two frames | 402 px |
| same, after the two frames | 192 px |
| same, inside `measureAll`'s own `page.evaluate` | 192 px |

A different number each time is the tell that something asynchronous was scrolling back —
`p-menu` restores focus to its trigger when it hides (`MyBookingsComponent.onActionMenuHide`),
and focusing an off-screen element scrolls it into view. **A reset that has to win a race
against the page is not a reset.**

The fix is not to depend on it. `measureAll` now records **document coordinates** for in-flow
content and **viewport coordinates** for anything inside a `position: fixed` subtree — a fixed
box is already scroll-invariant, so adding the offset to it would have traded this false
positive for a new one on every navbar, modal and FAB.

Two edges, both handled explicitly rather than absorbed:

- **`position: sticky`** is viewport-relative while stuck and in-flow while not, so it is
  recorded per box and dropped **only** on a screen whose two phases were scrolled differently.
  Printed, like every other exclusion. Zero fired.
- **An element with no layout box at all** (`display: none`, an empty `<script>`) returns an
  all-zero rect, which is not a position. The first run without that guard gave 27 such nodes a
  phantom `y` equal to the scroll; they were caught by the zero-area exclusion and changed no
  verdict, but **a harness that manufactures its own exclusions is one nobody can read**. Guarded
  — zero-area exclusions went 27 → **0**.

The diff now prints `screens-whose-phases-scrolled-differently`, so the fact that this mattered
stays on the record instead of being something a reader has to take on trust:

```
my-bookings-reschedule@768 phases scrolled 446 vs 139; compared in document coordinates
```

## 5. Measurements

| | OBRS-776 | OBRS-782 |
| --- | --- | --- |
| screens in the sweep | 42 | **47** |
| geometry screens (× 4 widths) | 168 | **188** |
| boxes compared | 24,426 | **29,194** |
| `moved` | 0 | **0** |
| `structural` | 0 | **0** |
| excluded as animated | 8 | 8 |
| excluded as zero-area | 11 | **0** |
| excluded as sticky at differing scroll | — | 0 |
| `NOT_SWEPT` entries | 8 | **1** |
| `ALLOW` entries | 0 | 0 |

**The harness still fires.** `padding-left: 1px` injected into
`app-reschedule-date-picker-step`'s `:host` produced **`moved=28`** at 1.00 px precision on
exactly the probed subtree, at all four viewports, on the click-reached screen — then reverted
and re-run clean. That check mattered more than usual here, because this card *changed how the
measurement works*: a sign error in the normalisation would have zeroed the whole diff and
looked like success.

**Lane cost: `npm run e2e:gate` = 124 passed**, with `host-box-sweep.spec.ts` alone at
9 passed / 1.9 min. Wall clock, same branch, twice:

| run | total |
| --- | --- |
| on `458cb72c` (OBRS-776's tip) | 6.3 min |
| rebased onto `origin/dev` = `8bf7b356` (picks up OBRS-778) | **7.2 min** |

The case count did not move because the five screens were added to cases that already existed.
And **do not read either number against OBRS-776's 6.9 min as a change this card caused**: the
same content measured 6.3 and then 7.2 depending only on what else was in the tree and what else
the box was doing. The run-to-run spread here is wider than a five-screen change, so a single
total is evidence of nothing on its own — which is worth writing down, because "the lane got
faster" is exactly the conclusion a table of one number per card invites.

Everything above was re-measured on the rebased base before pushing: `origin/dev` moved under
this card and the moving commit (OBRS-778) changes login CSS, which is a page in the sweep. The
geometry pair was re-captured there rather than carried over.

## How to re-run

```powershell
$env:E2E_GATE_PORT='4782'; npx playwright test --config=playwright.gate.config.ts host-box-sweep

# geometry, two phases, the second is the assertion
git stash push -- src/app/modules/my-bookings/components/reschedule-dialog/reschedule-date-picker-step/reschedule-date-picker-step.component.scss src/app/modules/staff/components/trip-details-edit/trip-details-edit-form/trip-details-edit-form.component.scss src/app/modules/passenger-info/components/passenger-seat-bus/passenger-seat-bus.component.scss
$env:OBRS775_PHASE='before'; $env:OBRS775_PORT='4783'; npx playwright test --config=playwright.obrs775.config.ts
git stash pop
$env:OBRS775_PHASE='after';  npx playwright test --config=playwright.obrs775.config.ts
```
