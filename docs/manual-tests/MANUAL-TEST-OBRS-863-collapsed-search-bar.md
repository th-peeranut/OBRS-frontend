# OBRS-863 — collapsed search summary on the results page: what was run, and what it showed

Run 2026-09-14 on `ao/obrs-863-collapsible-search-bar`, branched from `origin/dev`
at `b9c4f7c3`. **Every item below was executed here** — none of it is homework.
Each line names the command that produced it, so any number can be re-measured
rather than believed.

## 0) Start

Two trees served at once, both on the DEFAULT (development) configuration —
`apiUrl` points at `:8080` where nothing listens, so anything the harness fails
to stub fails loudly instead of quietly reaching SIT, and `window.ng` exists
(`seedStore` needs it):

```
git -C ../OBRS-frontend worktree add --detach ../OBRS-frontend-wt-obrs-863-before origin/dev
npx ng serve --port 4863     # in …-wt-obrs-863-before  (BEFORE)
npx ng serve --port 4864     # here                      (AFTER)
```

`src/environments/environment.local.ts` is gitignored, so a fresh worktree has
none and the build stops at `Could not resolve "./environment.local"`. The main
clone's copy is **older than `origin/dev`'s contract** (no `mapsMapId`, which
`environment.sit.ts` now reads) — copy the in-tree
`environment.local.example.ts` instead.

## 1) AC#5 — the measurement (`obrs-863-capture.spec.ts`)

```
npx playwright test --config=playwright.obrs863capture.config.ts
```

| | first trip card top | viewport | above the fold |
|---|---|---|---|
| BEFORE | **983px** | 664px | ✗ |
| AFTER | **610px** | 664px | ✓ |

Measured at 390×664 — the repo's phone viewport — as
`card.getBoundingClientRect().top + scrollY` against `window.innerHeight`, where
`card` is the first `.select-btn`'s `.schedule-item`. **Asserted, not just
printed:** the BEFORE case fails if the card ever fits, so a pair that stopped
reproducing the defect fails loudly rather than shipping a misleading picture.

Where the 373px came from, measured with the same probe:

| | BEFORE | AFTER |
|---|---|---|
| `app-schedule-booking-filter` height | 454px | 161px |
| `.booking-card` margin-block / padding-block | 32/32 · 16/16 | 8/8 · 0/0 |
| day strip top | 778px | 405px |

Collapsing the form alone reached 690px — **26px short**. The rest is the card's
own frame, which was sized for a form and still wrapped 96px of margin+padding
around a 65px bar. `.booking-section .booking-card.is-collapsed` gives that up in
the collapsed state only.

## 2) AC#1–#4, #7 — unit (`schedule-booking-filter.component.spec.ts`, 9 new cases)

```
npx ng test --watch=false --browsers=ChromeHeadless --include="src/app/modules/schedule-booking/**/*.spec.ts"
→ Executed 146 of 146 SUCCESS      (137 before this card)
```

| Case | Result |
|---|---|
| AC#1 a restored search renders collapsed, form gone | ✓ |
| AC#1 nothing searched → the form stays open instead | ✓ |
| AC#1 a renderable summary is not enough — no search ran, form stays open | ✓ |
| AC#1 a search with nothing to summarise does not collapse either | ✓ |
| AC#2 opening renders the ONE existing form, never a second copy | ✓ |
| AC#3 a successful search collapses; a refused one does not | ✓ |
| AC#4 summary reads the store, not the form being edited | ✓ |
| AC#4 a one-way search summarises one date, not a range | ✓ |
| AC#7 real `<button type=button>` publishing `aria-expanded` | ✓ |

Rows 3 and 4 were added **after review**, one per half of the collapse condition
— see §6. The first seven all seed an already-complete filter, for which both
halves happen to hold, which is exactly why none of them caught either bug.

⚠️ These are green only because the block uses `provideMockStore`. Written first
with a hand-rolled store stub they passed alone and failed **six ways** in a
whole-module run: the day-strip and list specs override
`selectProvinceWithStation`/`selectScheduleFilter` through `MockStore`, and an
override outlives the file that set it.

## 3) AC#6 — i18n and dark

```
node scripts/check-i18n-parity.mjs
→ all three files share the same key set (en=3776 th=3776 zh=3776)
```

Four new keys per language (`SEARCH_SUMMARY_SEATS/EMPTY/EDIT/COLLAPSE`), inserted
textually so the three files keep their existing formatting — a JSON round-trip
reformatted an unrelated block 40 lines away and was reverted.

Frames captured and asserted, not eyeballed: the Thai shot fails if any
`SCHEDULE_BOOKING.` key leaks through untranslated, and asserts the rendered
`ที่นั่ง`.

- `OBRS-863-AFTER-mobile-thai.png` — `Nong Chak → Mo Chit 2 Terminal · จันทร์ 14 ก.ย. · 2 ที่นั่ง · แก้ไข`
- `OBRS-863-AFTER-mobile-thai-dark.png` — same, `body.is-dark` asserted present

Station names stay English in both because the fixture's stations carry English
labels only — and that is the point of AC#4: the bar and the list below it read
the *same* roster through the *same* resolver, so they cannot disagree.

## 4) Full gates

```
for each of the 23 npm `test:*` scripts CI runs        → 23/23 OK
npx ng test --watch=false --browsers=ChromeHeadless    → Executed 7161 of 7161 SUCCESS
npm run e2e:gate                                       → see §5
```

## 5) The one real finding, and why the fix is in the harness

The first `e2e:gate` run came back **3 failed / 231 passed**. Re-run isolated
against `origin/dev` (baseline) and against this branch, the three split cleanly:

| Spec | On `origin/dev` | On this branch | Verdict |
|---|---|---|---|
| `obrs-942-non-manual-cancel` | pass | pass isolated, fail in the 2-worker full run | pre-existing load flake, not this card |
| `dark-override-effective` | pass | **fail** | **mine** — fixed, see below |
| `customer-contrast-gate` | pass | **fail** | **mine, in the harness** — see below |

**`dark-override-effective`.** A first cut had the bar give up its border and
fill while the form was open. `.search-summary.is-expanded` outranks this
component's own `:host-context(body.is-dark) .search-summary`, so five dark-mode
declarations became dead on every expanded instance and the gate named them. The
state is already carried by `aria-expanded` and by the Edit/Collapse label, so
the second visual language was deleted rather than re-specified. Green after.

**`customer-contrast-gate`.** `.day-strip__chip.is-unavailable` rendered zero
times on the `schedule-booking-day-strip` entry. Traced rather than guessed —
four measurements, each on both trees:

1. Dispatched actions: **identical**; the store filter is the same object.
2. The day strip's own state: **identical** — `availability` present,
   `effectiveDays: 7`, and `days` = `['selected','available','unavailable',…]`.
3. So the component was right and the **DOM was one render behind it**.
   `ng.applyChanges()` repaints it correctly; so does ONE real Angular-bound
   click; `page.mouse.click` on unbound space does not.
4. No console error, no page error, no `OnPush` anywhere in the app.

`seedStore` dispatches from inside `page.evaluate` — the browser's ROOT zone — so
the availability POST it sets off completes outside the Angular zone and
schedules no tick. That was invisible while `/schedule-booking` also held an
always-mounted PrimeNG form producing in-zone tasks of its own. This card
collapsed that form and the free tick went with it.

So the page is not broken for a customer, who arrives by pressing Search and puts
the whole cascade in the Angular zone. The sweep was scoring a DOM Angular was
never asked to paint. `flushAngular()` (exported beside `seedStore`) is called
once after the sweep's settle wait. It weakens no contrast assertion — it lets
the sweep measure the settled page.

**Rejected alternative:** hide the form with `display:none` instead of unmounting
it, so PrimeNG keeps ticking the app and the gate passes untouched. That buys a
green run by keeping a dependency on an accident, and leaves a heavy form mounted
on every arrival.

```
E2E_GATE_PORT=4233 npx playwright test --config=playwright.gate.config.ts customer-contrast-gate
→ 4 passed
```

## 6) What review found, and what changed after it

`obrs-scrutinize` ran against the first commit and returned `##SELF_FIXED##`.
Two of its three fixes were real defects, not style:

**The collapse fired on paths where no search had run.** The settle was wired to
"a summary can be rendered". `roundTripOnChange$` dispatches
`bookingForm.getRawValue()` on **every** trip-type toggle, ungated — unlike
`onSearch()`, it does not check `isSearchable()`. So a customer who picked both
stations and then touched the round-trip pill before setting a passenger count
wrote a filter that `buildSummary()` renders happily (it checks from/to/date, not
passengers) while `isSearchable()` rejects it: the form collapsed mid-fill, above
an empty result list. Moved into the `isSearchable(payload)` branch that actually
dispatches the search.

**That fix opened the mirror hole, which I then closed.** `isSearchable()` never
looks at the date, so a restored filter carrying a null `departureDate` searches
while `buildSummary()` returns null — collapsing on the search alone would hide
the form behind a bar reading "no route selected yet" over a full result list.
The condition is now **both**: `if (!this.summarySettled && this.summary)`.
`summary` is fresh at that line because the `combineLatest` is subscribed first
and has recomputed off the same store emission.

Two unit cases were added, one per half. Both hold the fixture complete except
for the one field under test, which is why the original seven missed them.

**`summaryStationLabel()` was a duplicate** of `ScheduleBookingListComponent`'s
private `getStationLabelById()` — same guard, same `Number()`, same `.find()`,
same call. Extracted to `station.interface.ts` and both components repointed at
it, which makes AC#4 structural rather than a convention: the bar and the list
now resolve station names through one function.

A contrast comment claiming `5.14:1` was also corrected to the measured `5.33:1`.

**Caught by the capture spec after those fixes, and it was the fixture's fault:**
`obrs-863-capture.spec.ts` seeded `passengerInfo: [{ type: 'adult', … }]`, copied
from the shared `STORE_SEED`. `getPayload()` counts `type === 'ADULT'`, so the
lowercase seed resolves to **0 passengers** — it describes a search that never
ran, which is now exactly the state the page must not collapse in. Fixture fixed
to `'ADULT'`; the measurement is unchanged at 983px → 610px.

One finding was returned as a note rather than fixed: `buildSummary()` returns
null when a store-held station id does not resolve against the current roster (a
deactivated or renamed stop). With the condition above, that leaves the form
**open** — safe, not misleading — because `isSearchable()` resolves the same ids
and so no search runs either. Worth an owner's call only if stale filters
referencing dead stops turn out to be common.

Re-run after all of it: unit 146/146 in the module and 7161/7161 overall, capture
4/4, all 23 CI gate scripts, `e2e:gate` — see the table above.

## 7) Not covered here

- No SIT verification: FE-only, no external integration, nothing deployed.
- The sold-out/no-results empty states keep the form OPEN (their seeded filter
  carries station slugs, which resolve to no station, so no summary resolves) —
  covered by the gate sweep's own entries, not re-measured here.
