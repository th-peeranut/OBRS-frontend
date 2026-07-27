# OBRS-776 — the four PrimeNG hosts, and the sweep that had to grow before they could be fixed

Spinoff from [OBRS-775](https://nj-phuyaipu.atlassian.net/browse/OBRS-775). Branch
`ao/obrs-776-primeng-hosts`, off `origin/dev` `467ccbfa`.

## What was left, and why it was left

OBRS-775 swept every Angular component host that was `display: inline` while holding
in-flow block-level children, and fixed 37 of them with `:host { display: block }`. Four
survived on its `ALLOW` list: `p-tabview`, `p-tabpanel`, `p-card` and `p-calendar`.

They are PrimeNG's. `:host` addresses the element a component's *own* stylesheet is
attached to, and these elements belong to a library — nothing we can write in a component
stylesheet reaches them. The only fix is a global rule, and a global rule lands on **every
instance in the app at once**, including the ones on pages nobody swept. OBRS-775's sweep
covered 27 pages; shipping the rule there would have meant asserting a result over a
population it had never measured, which is the specific mistake that card existed to stop
making. So it carded the widening instead. This is the widening.

## The census, and why it is code rather than a paragraph

The card's plan was "grep for the pages that render these four, add them to the sweep". A
grep is the right *tool* here — the question is "which files mention this tag", not "is this
host malformed", and only a browser can answer the second. But a grep run once by hand is
worth nothing a year from now: the twenty-sixth component to render a `p-calendar` will be
added by someone who never read this file.

So the grep lives in `e2e/support/host-boxes.ts` as `primengHostUsers()` and runs on every
gate run. It walks `src/`, finds every template that renders one of the four tags, resolves
which component owns that template, and throws if a template renders one and no component
claims it. The gate spec then compares that list against what the sweep actually saw, because
a clean malformed-host census cannot tell a page that is well-formed from a page nobody
opened.

**The bar is RENDERED, not mounted, and the first draft got that wrong.** `scanPrimengCoverage`
attributes every `p-*` element on the page to its nearest `app-*` ancestor — the component whose
template wrote it, which is the same thing `primengHostUsers()` reads statically. The version
before it only asked whether our component's host element was in the DOM, and
`app-expense-form-modal` is written unconditionally into `expenses-page.component.html` while
its entire template sits behind `<div *ngIf="isOpen">`. It counted as covered on every visit to
`/admin/expenses` with not one `p-calendar` rendered — the exact failure this card exists to
prevent, reproduced inside the check meant to prevent it. That mattered in practice: the expense
modal is the only screen this lane can reach that renders the `schedule-calendar-filter` variant.

The population it found:

| | components |
| --- | --- |
| render `p-calendar` | 22 |
| render `p-tabview` / `p-tabpanel` | 2 |
| render `p-card` | 1 |
| **distinct components total** | **25** |

Twelve pages were added to `ADMIN_SWEEP` to reach them: `/admin/schedules`, `/admin/reports`,
`/admin/settlements`, `/admin/eod-sales-report`, `/admin/refund-void-report`,
`/admin/cash-online-reconciliation-report`, `/admin/expenses`, `/admin/promotions`,
`/admin/vehicles`, `/admin/settings/history`, `/staff/schedules`, `/staff/parcels/consign` —
plus two screens that are the same URL with one click on the page's own **Add** button, which
needs no seeded data: `admin-expenses-modal` and `admin-promotions-modal`. `SweepPage.act` is
that click, and it asserts the modal is visible rather than assuming, because an entry that
silently failed to open would measure the page underneath and file it under the modal's key.

The sweep is 41 screens now: 8 customer, 9 public/auth-entry, 24 admin/staff/session-bound.

## Widening the sweep found two more of ours

Not PrimeNG's — ours, and neither was reachable from anything OBRS-775 visited:

- **`app-settlements-list`** on `/admin/settlements`.
- **`app-config-change-history-page`** on `/admin/settings/history` — which since OBRS-576 is
  a *tab* of `/admin/settings` rather than a route, so a sweep keyed to routes never opened it.

Both got the same `:host { display: block }` the other 37 got. This is the point of the card
stated as a measurement: OBRS-775 finished with a green sweep and a correct census *of the
pages it swept*, and there were still two live instances of the defect it existed to remove.

## What the sweep could not reach, and what covers it instead

Eight components render a PrimeNG host behind data or a selection this lane cannot produce.
Each is named in `NOT_SWEPT` in `e2e/tests/host-box-sweep.spec.ts` with its reason, and
**the exclusions are checked, not promised**:

| component | why unreachable | what covers it |
| --- | --- | --- |
| `app-parcel-trip-form` | only route is `/parcel-booking`, behind `featureEnabledGuard('onlineParcelBooking')`, which is `false` in `environment.base.ts` — the page bounces to `/` in every build | `the parcel-booking exclusion has not expired` re-reads the flag and reds if it is ever turned on |
| `app-sell-page` | its calendars are in the schedule modal, which needs `scheduleStore.hasValue` on top of the click | variant check |
| `app-boarding-list` | delay dialog, behind `canDelaySchedule && tripHeader.statusCode === 'scheduled'` | variant check |
| `app-walk-in-center-panel` | `p-tabView` is `*ngIf="selectedTrip"` — a walk-in trip selection this lane cannot make | variant check |
| `app-round-trip-promotion-card` | form is behind `*ngIf="!isLoading && promotion"` and this sweep answers `/api/**` with nulls on principle | variant check |
| `app-reschedule-date-picker-step` | step 2 of a dialog that only opens from a reschedulable booking row | variant check |
| `app-trip-details-edit-form` | dialog opened from a staff schedule row; same missing data | variant check |
| `app-vehicle-maintenance-panel` | renders only under `activeTab === 'maintenance' && focusedVehicle`, two clicks past a vehicle row | variant check |

Three components were on that list in the first draft and came off it by being measured instead:
`app-expense-form-modal`, `app-promotion-form-modal` and `app-staff-schedules-page` all open from
their page's own **Add** button with an empty backend, so excluding them would have been laziness
rather than a limit. The third of those is why `staff-schedules-modal` exists: it renders a
`<p-calendar>` with **no styleClass at all**, which is the shape four of the eight excluded
components use, and nothing else the sweep can reach renders it.

### The variant check

`no unswept component renders an unmeasured variant` is what makes the eight survivable rather
than a hole. A PrimeNG host is malformed exactly when its inner container is block-level, and the
only thing a call site can do about that is hand the container a `styleClass` that some rule sets
`display` through. So the variant key is the tag plus **only those** styleClasses:

- `app-date-field` counts — `.p-calendar.app-date-field { display: flex; width: 100% }` in
  `styles.scss` is precisely what blockifies PrimeNG's span and makes the host malformed.
- `schedule-calendar-filter` does not — it matches no rule anywhere in the tree.
- `center-tabview` does not — `walk-in-center-panel.component.scss` reaches it through `::ng-deep`
  for background, padding and `flex-wrap`, and never for `display`.

Filtering by `display` rather than by class name is the difference between a check that is right
and one that merely looks strict: keyed on the raw styleClass it would have demanded a screen for
`center-tabview`, a distinction that does not exist, and a check that fails on a correct tree is a
check that gets deleted. `setsDisplayThrough()` errs the other way on purpose — it reads from each
mention of a class to the next `}`, so nested SCSS makes it over-report, and over-reporting only
ever asks for one more screen.

Counted rather than assumed: 39 `<p-calendar>` tags in the tree — 35 `app-date-field`,
4 `schedule-calendar-filter` — collapsing to two variants that matter, both rendered and measured.

## The rule

`src/styles/primeng-host-boxes.scss`, imported from `styles.scss`:

```scss
p-tabview,
p-tabpanel,
p-card,
p-calendar {
  display: block;
}
```

Bound to the **host tag**, deliberately — not to `.p-tabview`, `.p-tabview-panel` or
`.p-calendar`. Those class names are PrimeNG's internal DOM; an upgrade that renames one
would leave the rule matching nothing, silently, with no diff to review. The tag is the
component's public API and is the one thing an upgrade cannot quietly change.

Specificity 0-0-1, the weakest a rule can be, on purpose: everything a component or theme has
to say about these elements outranks it, and all it has to beat is the CSS initial value.

## The cascade, one level further out

`app-route-stop-detail-card` was **well-formed before this card and malformed because of it**. Its
only child is `<p-card>`, and while that was `display: inline` there was no block-level child for
an inline box to hold illegally. Blockifying `p-card` made this the next bad box, and the sweep
caught it on the run straight after the rule landed — not on the census taken before it, which is
the only run a checklist would ever consult. Same shape as `app-home` and `app-schedule-booking`
in OBRS-775, and the second time in two cards that the argument for a gate has been produced by
the gate rather than by argument.

## The evidence that nothing moved

`e2e/tests/obrs-775-geometry.spec.ts` measures the border box of **every** element on all 42
screens at 1280/1024/768/576, before and after, and fails past 0.5px. It reads its page lists from
`host-boxes.ts`, so widening the sweep widened the harness with no edit:

| | OBRS-775 | OBRS-776 |
| --- | --- | --- |
| screens | 108 | **168** |
| boxes | 14,302 | **24,426** |
| moved | 0 | **0** |
| structural | 0 | **0** |

**It fires.** `padding-left: 1px` added to the four-tag rule and nothing else reported
**moved=579** — so the harness catches a one-pixel shift on exactly the elements this rule reaches,
and the zero-area exclusion below does not swallow real ones. The probe was then reverted; the file
that produced `moved=0` is the file that shipped.

### Two exclusions, both named rather than absorbed into the tolerance

- **4 animated.** `/payment/result` renders `.spinner { animation: spin 0.9s linear infinite }`, and
  `getBoundingClientRect` on a rotating box returns axis-aligned bounds that breathe. OBRS-775's
  exclusion, unchanged.
- **11 zero-area**, added here. A box with zero area in **both** phases paints nothing — no
  background, no border (a border would give it height), no text — and cannot take a pointer event,
  so a change to its rect is not a layout change. `<head>` was already skipped on exactly this
  reasoning; this is the same argument for the zero-area nodes inside `<body>`. All eleven are
  accounted for: seven are the **inactive** `p-tabpanel`s on `/`, which hold no panel div while
  hidden and go from 0×0 inline boxes to 246–1008px wide and still 0px tall; four are the
  `<router-outlet>` marker before `app-config-change-history-page`, whose y shifted 16px when that
  host stopped being inline. On both screens every element with actual extent is identical to the
  last hundredth of a pixel, which is what makes them an exclusion and not a finding.

  Note what it does **not** cover: a box that is zero-area in one phase and real in the other falls
  through to the comparison, because that is a box appearing or vanishing, which is what the
  harness is for.

## The harness measures a moving target, and that had to be fixed first

One AFTER run reported **48 moves** that the fix had not caused. Every one was a `width` on the
collapsed admin sidebar's nav labels on a single screen, with heights identical to the pixel —
the signature of a **font swap**, not of layout. `styles.scss` pulls Sarabun from
`fonts.googleapis.com`, and the same tree measured twice disagreed with itself depending on
whether the face had arrived before the measurement.

Two fixes, split so the merge gate gains no network dependency:

- `settle()` now awaits `document.fonts.ready`, which removes the **race** for everything that
  calls it — the gate spec included.
- The geometry harness additionally asserts `document.fonts.check('16px Sarabun')` per screen,
  because `fonts.ready` resolves whether the font arrived *or failed*. A phase measured in the
  fallback face is not comparable to one measured in Sarabun, and this is the CAPTURE lane, run
  by hand, so it can afford to insist and say which screen.

This is the reason the baseline was re-captured rather than reused: a fixed AFTER compared against
a possibly-raced BEFORE is not a comparison of anything.

## Reproducing

```bash
# the gate (hermetic, no backend)
E2E_GATE_PORT=4276 npx playwright test --config=playwright.gate.config.ts host-box-sweep.spec.ts

# the before/after geometry, two runs by hand
OBRS775_PORT=4277 OBRS775_PHASE=before npx playwright test --config=playwright.obrs775.config.ts
#   ... apply or revert src/styles/primeng-host-boxes.scss and the two :host additions ...
OBRS775_PORT=4277 OBRS775_PHASE=after  npx playwright test --config=playwright.obrs775.config.ts
```

Note the BEFORE phase must be captured with the *widened* page list already in place — the two
phases have to measure the same screens, and the harness asserts that rather than trusting it.

## Also verified on this branch

| | result |
| --- | --- |
| `npm run e2e:gate` | **124 passed**, 6.9 min (was 121 / 5.8) |
| `ng test` | **3962/3962** |
| `npm run build:sit` | exit 0 |
| nine static gates | all OK |

The gate lane cost is the number to watch, not the case count. OBRS-767's `seedStore` fix exists
because OBRS-775 added a CPU-heavy spec to a 2-worker lane and lost a race that had always been
there; this card grew the same spec by 15 screens without adding a file, so nothing in
`lanes.json` or `playwright.gate.config.ts` would have conflicted to make anyone look.
`docs/e2e-lanes.md` records it as the fourth count rot in two days and says why the mechanism,
not the edit, is the problem.

## What is left

`app-vehicle-maintenance-panel`, `app-sell-page`, `app-boarding-list`, `app-walk-in-center-panel`,
`app-round-trip-promotion-card`, `app-reschedule-date-picker-step` and `app-trip-details-edit-form`
render a PrimeNG host this lane cannot get on screen, and are covered by variant rather than by
measurement. Reaching them means seeding a booking row, a schedule row, a vehicle row and a
walk-in trip selection — real fixtures, in a sweep whose mock is deliberately dumb because an
empty table has the same host tree as a full one. That reasoning is true of every other page here
and false for exactly these, which is the argument for doing it in its own card rather than
smuggling it into this one.

`app-parcel-trip-form` is a different kind of gap and needs no card: `the parcel-booking exclusion
has not expired` re-reads `onlineParcelBooking` from `environment.base.ts`, so the day that feature
is switched on, the gate asks for the page.
