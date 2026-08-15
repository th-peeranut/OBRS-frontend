# E2E lanes

**OBRS-602.** Which Playwright specs run where, why, and which one is actually a merge gate.

## The short version

```bash
npm run e2e:gate       # 191 cases, 10.5 min (measured 2026-08-15), no backend. THIS is the merge gate (runs in CI).
npm run test:e2e-lanes # asserts every spec declares a lane (runs in CI, costs nothing)

npm run e2e            # SIT health check. Not a gate. Expect some red.
npm run e2e:local      # my-bookings-reschedule, against a database it rebuilds itself
```

The registry is `e2e/lanes.json` — one entry per spec, with the reason. It is enforced by
`scripts/check-e2e-lanes.mjs`.

## What was wrong

`playwright.config.ts` declared `testDir: './e2e'` with no `testIgnore`, so it adopted
every spec in the directory: **223 cases across 24 files that nobody had ever seen pass
together.** Meanwhile each card that needed a special environment added its own
`playwright.*.config.ts` beside its spec — a seeded database, a 390px viewport, a backend
started by hand on another port — and ran the spec under that. The spec then belonged to
two configs: the one it was written for, and the default one, which supplied none of what
it needed.

Nine of the twenty-four specs were in that position. `my-bookings-reschedule.spec.ts` is
the clearest case: `playwright.local.config.ts` carries a long header explaining why the
spec had to leave SIT, and the default config ran it against SIT anyway.

The second-order effect is what actually cost time. With no green baseline anywhere, a
red run gives you nothing to diff against, so every failure is triaged as "probably
pre-existing" — which was usually true, and therefore never questioned. OBRS-451 had to
argue from its own change surface that 36 failures were not its fault, because comparing
was not an option.

Two failures found while building the gate lane show what that habit was covering:

- **`b2c-critical-path` had been correctly failing since OBRS-238**, which made the
  booker email required. The spec was never updated, so `.btn-next` stayed disabled. A
  test named "critical path" was reporting a broken critical path and was read as noise.
- **Three specs never mocked `GET /api/routes`**, the call that resolves the slug their
  own `pickup-dropoff` stub is keyed to. SIT answered it for them, so "fully mocked" was
  false in a way nothing could report.

## The lanes

| Lane | Needs | Gate? | Run with |
|---|---|---|---|
| `GATE` | nothing but a browser | **yes** | `npm run e2e:gate` |
| `GATE-BLOCKED` | a SIT-minted admin JWT, nothing else | not yet | `npm run e2e` — **empty since OBRS-618** |
| `SIT-LIVE` | the deployed SIT backend, on purpose | no | `npm run e2e` |
| `OWN-DB` | a database it seeds itself | no | its own config |
| `CAPTURE` | a screenshot script, not a test | no | by hand |

### GATE

Intercepts every call it makes. `playwright.gate.config.ts` enforces that rather than
trusting it, in three ways:

1. **No `globalSetup`.** The default config's global setup logs into live SIT to mint
   `e2e/fixtures/admin-auth.json`. That makes SIT a hard dependency of every test in that
   run, including ones that mock 100% of their own traffic. A gate a cold-starting Koyeb
   instance can turn red is not a gate.
2. **The frontend is served with the `gate` configuration**, which is the default (local)
   environment — `apiUrl` points at `localhost:8080` where nothing is listening, so an
   unintercepted API request gets ECONNREFUSED instead of quietly succeeding against SIT —
   plus web fonts served out of `e2e/fixtures/fonts/` instead of Google's CDN.
   **OBRS-1370 correction:** this bullet used to end "a spec that passes here is *provably*
   hermetic". It was not. A third-party URL written absolutely inside a stylesheet never
   goes near `apiUrl`, so the lane fetched Google Fonts on every page load and a gstatic
   404 turned a `dev` merge red (OBRS-1369). Three things enforce it now instead of
   asserting it: the local fonts above, `--host-resolver-rules` in the config's
   `launchOptions` (Chromium resolves no hostname but localhost), and
   `obrs-1370-lane-offline.spec.ts`, which goes red naming any host outside this machine.
3. **An explicit viewport**, so a Playwright upgrade cannot move what these tests measure.

Shared stubs for the public pages live in `e2e/fixtures/public-page-mocks.ts`. Call it
first in `beforeEach`, then add spec-specific stubs — Playwright matches handlers in
reverse registration order, so later registrations win.

**What stubbing `/api/routes` cost, and why the trade is acceptable.** `route-map.spec.ts`
no longer exercises the real `GET /api/routes` response shape. That coverage moved rather
than died: `direction-selector.spec.ts` is SIT-LIVE and deliberately leaves `/api/routes*`
live, so contract drift on that endpoint still has somewhere to surface. If
`direction-selector` is ever mocked or retired, this trade needs revisiting — say so on
that card rather than discovering it here.

`e2e/fixtures/routes.json` is **captured** from SIT, not hand-written, and its `$comment`
records that. This matters more than it looks: the first draft hand-wrote `status` as the
string `"ACTIVE"`, and `RouteMapService.isActiveStatus` accepts both a string and an
object, so it passed while pinning a branch the server never takes. SIT sends the object
form. Re-capture rather than hand-edit.

**A malformed box is a lane member too.** `review-total-host-box.spec.ts` (OBRS-753)
asserts that no component host in the review module is `display: inline` while wrapping
block-level children, and that Playwright can actually hit `.btn-confirm`. It is here
rather than in a linter because the defect is a *missing* declaration — you get
`display: inline` by writing nothing, so there is no diff line for a reviewer to catch,
and no stylesheet parser can tell an inline host that is fine (all children inline) from
one that is malformed. Only the cascade knows, and the cascade only exists in a browser.
Exactly the argument that put the contrast gate here.

**And a declaration that never applies is a lane member too.**
`dark-override-effective.spec.ts` (OBRS-767) removes each `dark-theme.scss` declaration
from the live CSSOM in turn and fails if nothing on the page changed. Same argument again,
one step further out: the contrast gate asks whether a colour is legible, this one asks
whether the rule that set it ever ran. A global `body.is-dark .a .b` is (0,3,1) and the
component's own `.a[_ngcontent] .b[_ngcontent]` is (0,4,0), so the override parses,
matches its element, and loses — which no stylesheet parser can see and which had hidden
the entire dark footer at 2.40:1 for the life of the feature. Two things it does that are
worth copying if you write a gate that *mutates* the page to measure it: it restores each
rule through `style.cssText` verbatim (removing and re-adding a longhand written with
`var()` destroys the declaration, and the first version of this spec was silently
corrupting the page it was measuring), and it samples every page twice and reports only
what is dead in both (PrimeNG settles some fills after first paint, and a one-sample run
went red at random with no defect behind it). Everything it cannot judge is *counted and
printed*, never folded into the pass: `:hover`-only rules, selectors that matched no
element, and unreadable `var()`s. Known-dead declarations live in
`e2e/support/dark-override-allow.ts` against a card, and an entry that stops matching
fails the build too — so the register cannot rot into a lie.
**And the sweep that generalised it.** `host-box-sweep.spec.ts` (OBRS-775) runs that same
check over all 52 pages this lane can reach — 9 customer, 9 public/auth-entry, 34
admin/staff; 27 when the spec was written, 42 after OBRS-776, 47 after OBRS-782 and 52
after OBRS-941 added the five analytics screens OBRS-151..155 shipped without one — and
fails on any malformed host not on its `ALLOW` list with a reason. The
first run found **39**; 37 were ours and are fixed, 4 are PrimeNG's and are OBRS-776. Two
of those 37 are the argument for having a gate at all: `app-home` and
`app-schedule-booking` were *well-formed until this card* and became malformed **because
of it** — their only children are other component hosts, so while those were inline there
was no block-level child for an inline box to hold illegally. Fixing the children made
these the next bad box. A checklist of "components someone checked" would have shipped two
fresh instances of the defect it was written to remove; the sweep caught them on the run
straight after the batch landed. `ALLOW` cannot rot either: a separate case fails on any
entry the sweep no longer sees malformed.

**And "can the visitor reach it at all" is a lane member too.**
`obrs-1372-consent-banner-reachability.spec.ts` sweeps the same eleven customer pages at
the iPhone 14's 390×664 in Thai, with the PDPA question deliberately UNanswered, and
fails if any in-flow control cannot be scrolled clear of the consent bar. It is not the
FAB question one file over: the bar is full-width and opaque **on purpose**, so "does it
cover anything" is answered yes by design and could only be satisfied by shrinking the
ask. What was false is reachability — the bar is `position: fixed` and nothing reserved
room for it, so the document ended where it always had and the last 246px of every page
was gone until the question was answered. Measured on the pre-fix tree: **14 controls
across 11 of 11 pages**, including the whole lower half of `/login` (the
sign-in-by-phone button, the PDPA checkbox, the privacy-policy link and the register
link — a signed-out visitor's first screen) and the footer phone number on every page.
The spec carries its own must-catch/must-not-catch fixture first, and that fixture's
`<!DOCTYPE html>` is load-bearing: without it `setContent` renders in quirks mode, where
`documentElement.clientHeight` is the document's height rather than the viewport's, the
solver computes `maxScroll = 0` and the sweep reports a clean page. That was the first
run's actual result.

**`force: true` is banned in this lane, and the ban is enforced** (OBRS-775 AC5, rule 5 in
`scripts/check-e2e-lanes.mjs`). `force` does not aim the event — it skips the
actionability checks and dispatches at the coordinates regardless, so the click lands on
whichever element is topmost. That is exactly how OBRS-750 stayed hidden for as long as it
did. The rule blanks comments before matching, because `b2c-critical-path.spec.ts` quotes
the forbidden call in its own header while explaining why it no longer makes it, and a
gate that reds on a correct file gets deleted rather than obeyed.

**Debugging a GATE failure.** A timeout on an unrelated element usually means an
unmocked call: the request fails, the global error interceptor raises a SweetAlert, and
its backdrop swallows every subsequent click. Read the trace's `.network` file, or add
`await page.route('**/api/**', r => { console.log(r.request().url()); r.continue(); })`
as the first handler, to see which URL escaped.

A SweetAlert in the way is **not** always an escaped call, and assuming it is will send
you looking for a stub that is not missing. The same interceptor opens a "Loading…" modal
on *every* `/api/` request and closes it in `finalize`; its container is `position: fixed`,
covers the viewport, and keeps `pointer-events: auto` all the way through the closing
transition. A hit test a few frames early therefore reports `div.swal2-container` as the
topmost element over a perfectly healthy page. Check the container's text and classes
before hunting a fixture: `swal2-backdrop-hide` plus "Loading…" is a modal on its way out,
and the cure is `await expect(page.locator('.swal2-container')).toHaveCount(0)`, not
another `page.route`.

### GATE-BLOCKED

Mocks all of its own API traffic, but boots with a session minted from live SIT.

**Empty since OBRS-618, and that is the point of the lane** — it exists to name a spec
that is one dependency away from the gate, so the dependency gets removed instead of
becoming permanent. All four members moved to `GATE`: `focus-retention`,
`stop-filter-route-pair`, `trip-details-edit` and `staff-sell-walkin` (49 → **102**
gated cases). If a new spec lands here, it should leave again.

What actually blocked them, since the file recorded the wrong reason for two years'
worth of reading:

- **The storageState.** `test.use({ storageState: fixtures/admin-auth.json })` — a
  gitignored file only `e2e/global-setup.ts` can mint, by logging into live SIT. The
  replacement is `e2e/support/gate-admin-session.ts`, which seeds `auth_token` /
  `auth_username` / `auth_roles` via `addInitScript`. Deliberately **not** a committed
  `storageState` JSON: that keys its localStorage to an absolute `origins` entry, so it
  would silently apply to nothing the day `E2E_GATE_PORT` changed.
- **Not the token being fake.** `staff-sell-walkin` carried a comment saying a fake
  token "changes behaviour", and the card that opened this work repeated it, guessing
  that something decodes the JWT's claims. Nothing does: `AuthService.isAuthenticated()`
  is `!!getToken()`, roles come from a separate `auth_roles` key, and no JWT decoder is
  imported anywhere under `src/app`. The real mechanism is the OBRS-535 one — an
  **unmocked** authenticated call 401s against SIT and `authInterceptor` force-logs-out
  before the assertion runs — and it cannot occur in a lane with no backend to answer.
- **Calls nobody had stubbed.** All four specs described themselves as fully mocked and
  none of them were: `GET /private/users/me`, `/private/route-stops/{slug}`,
  `/private/schedules/{id}`, `/private/schedules/{id}/boarding-list` (all four specs),
  plus `/private/vehicle-types`, `/private/vehicles`, `/private/users/drivers` and
  `/private/bookings/{id}/{tickets,payments}` in two `staff-sell-walkin` cases. Against
  SIT they simply succeeded, so nothing ever reported them. They were found by aborting
  every unstubbed authenticated call and **recording** it, which is what
  `expectNoEscapedGateCalls` now asserts in `afterEach` — an abort otherwise shows up as
  a control that never renders, i.e. a timeout pointing at the wrong thing.

The shared stubs' bodies are deliberately empty rather than invented. Each consumer is
written to tolerate no data (`getMe` maps failure to `null`; `routeStops?.data?.stops ??
[]`; `getScheduleById`'s error branch "keeps fallback values silently"), so an empty body
matches the state the assertions were actually written against. Fabricating plausible
rows would put page state under those assertions that no server ever produced.

### SIT-LIVE

Deliberately hits the deployed backend, per
[ADR-0001](adr/0001-admin-e2e-hits-real-sit-backend.md): the point is catching
frontend/backend contract drift, which a mock cannot do by definition. Not a gate — SIT
is shared and mutable, several sessions write to it at once, and cold starts are routine.

`admin-critical-paths` leaves data behind on purpose (`afterAll` intentionally omitted).
That litter is visible in production code: `RouteMapService.isTestRoute()` exists to hide
`TEST-e2e-schedules-route` from real users. Worth cleaning up; not this card.

### OWN-DB

Needs booking or report states that can only exist by construction — an already
rescheduled booking, a cancelled one, a seat collision. On a shared environment those can
only be produced by running the spec, which spends them, so the next run finds them gone.
`playwright.local.config.ts` and `playwright.obrs483.config.ts` provision their own
database; `obrs-564` and `obrs-576` expect one built by hand and provision nothing, which
is why neither has a committed config.

### CAPTURE

Screenshot scripts kept for reproducing card artefacts. They assert little and are not
expected to pass unattended. Their output goes to `e2e-evidence/` (gitignored) — until
OBRS-602 two of them wrote to an absolute path inside a *different* git repository,
hardcoded down to one developer's username, and the office repo really was carrying
modified PNGs from an unrelated run.

## Adding a spec

Add it to `e2e/lanes.json` with a lane and a `why`. `npm run test:e2e-lanes` fails until
you do — a spec that belongs to no lane runs in no lane, which is the same failure as the
old sweep wearing the opposite sign.

To put it in the gate, also add it to `testMatch` in `playwright.gate.config.ts`; the
check asserts the two agree. That list is spelled out by hand on purpose, because adding
a spec to the merge gate is a claim about that spec someone should make deliberately. The
SIT config derives its list from the registry instead — it is long, changes often, and
getting it wrong costs a skipped health check rather than a false green.

## The configs

Ten `playwright*.config.ts` files live at the repo root. Two of them ran whole lanes; the
rest are per-spec.

| Config | Runs | Note |
|---|---|---|
| `playwright.gate.config.ts` | 124 in 13 files | the merge gate; hand-written `testMatch` |
| `playwright.config.ts` | 68 in 7 files | SIT lane, :4202; list derived from the registry |
| `playwright.qa.config.ts` | 68 in 7 files | same lane on :4201 for when ports are contended |
| `playwright.local.config.ts` | `my-bookings-reschedule` | rebuilds its own database |
| `playwright.obrs483.config.ts` | `obrs-483-open-seating` | own database + a specific backend branch |
| `playwright.obrs433.config.ts` | `obrs-433-my-reports` | 1536×864; expects `obrs433qa` on :8080 |
| `playwright.obrs561.config.ts` | `obrs-561-mobile-dropdown-overflow` | 390px — the whole point |
| `playwright.obrs575.config.ts` | `obrs-575-{qa,capture}` | **no `webServer`**; servers started by hand |
| `playwright-route-map.config.ts` | `route-map` | superseded: the spec is now in the gate lane |
| `playwright-direction-selector.config.ts` | `direction-selector` | :4201 |

`playwright.qa.config.ts` had the *same* directory sweep as the default config. Fixing only
the one named on the card would have left an identical trapdoor one `--config` flag away —
so `scripts/check-e2e-lanes.mjs` now refuses any root config that declares a directory
without declaring what it runs, which closes the family rather than the two instances.

## Known gaps

- **The 214/223 hang has not been reproduced.** It was reported on a full-sweep run and
  is not seen in the gate lane. The `html` reporter's `open: 'on-failure'` default does
  block on a server after a failing run, but it is gated on `process.stdin.isTTY` and a
  coding-agent check, so it cannot explain an agent run; both configs now use the `list`
  reporter anyway. The remaining hypothesis was headless Chrome dying under CPU
  contention from parallel sessions on this box — **and OBRS-618 observed it directly.**
  Growing the lane from 49 to 60 cases at `workers: 3` made `b2c-critical-path` — which
  the card never touched, and which passed in the 49-case baseline in 18.9 s — time out
  at 60 s waiting for a navigation, twice in a row; run alone under the same config it
  takes 7.8 s. The gate now uses `workers: 2` and the full 102 cases pass in ~2.9 min.
  So the failure mode is real, it presents as a timeout on an unrelated spec, and the
  first thing to suspect when the gate reds on something you did not change is the load
  on the box — not that spec.
- **The gate lane runs in CI** as the `e2e-gate` job in `.github/workflows/ci.yml`
  (OBRS-750), and it blocks: no `continue-on-error`, no `retries` override. Before that
  card it ran only on developer machines, which made it a convention rather than a gate.
  Two earlier versions of this bullet were wrong in sequence and both are worth knowing
  about, because the same mistake is easy to make again:
  - It first said Actions on this repo is a hard $0 monthly minute ceiling shared with
    the SIT deploy — **both halves false** (OBRS-735). `th-peeranut/OBRS-frontend` is
    PUBLIC, so its Actions minutes are unmetered; the free-tier ceiling belongs to the
    PRIVATE `OBRS-backend`. And no SIT deploy runs in `ci.yml` at all — the SIT frontend
    deploys from **Netlify** (`netlify.toml`), a separate product on a separate budget.
  - It then said not wiring the lane in was "an open owner decision" — true when written,
    false the moment OBRS-750 landed. A doc that records a *pending* decision has to be
    revisited when the decision is made; nothing enforces that, so treat any "open
    decision" sentence here as unverified until you check the file it describes.
  The cost of the lane was always wall-clock, never quota. It is safe as a blocking gate
  because it is hermetic by construction — `playwright.gate.config.ts` serves the app with
  the `gate` configuration, so `apiUrl` points at a `localhost:8080` where nothing
  listens, and an un-intercepted request gets ECONNREFUSED instead of silently reaching
  live SIT. A cold-starting Koyeb instance therefore cannot turn this job red. **Until
  OBRS-1370 that sentence covered less than it sounded like** — see bullet 2 above: the
  lane also reached `fonts.googleapis.com`, `fonts.gstatic.com`, `accounts.google.com`,
  `ssl.gstatic.com` and `placehold.co`, none of which travel through `apiUrl`, and any of
  their outages could turn this job red. Measured, then closed.
- **`b2c-critical-path` used to click `.btn-confirm` with `force: true`.** This bullet
  already said that "reports success whether or not the click lands" — and OBRS-750 found
  out the hard way that it was worse than that. `force` does not aim the event at the
  element, it only skips the actionability checks, so the mouse event still went to
  whatever was topmost at that point. Something else was: Playwright's hit test there
  resolved to `app-review-schedule-booking-total`, the button's own parent. On this box the
  click still happened to reach the button; the first time the lane ran on a GitHub runner
  it did not, the handler never fired, and the `waitForURL` after it burned the full 60s
  test timeout. **The error named the navigation, not the click** — which is exactly how
  this got mis-filed as CPU contention for as long as it did.
  OBRS-750 could not fix a stylesheet from a spec file, so it settled for
  `dispatchEvent('click')` — deterministic, and unlike `force` it cannot deliver the event
  elsewhere, but it asserts nothing about whether a user could reach the button.
  **OBRS-753 closed it properly and the line is a plain `click()` again.** Adding
  `:host { display: block }` to the three hosts in the review module removed the
  interception, and `review-total-host-box.spec.ts` pins it with `click({ trial: true })`
  on the same button in this same lane — that check failed with "intercepts pointer
  events" before the change and passes after. The two measurements that look
  contradictory are both true and worth carrying forward: at the same instant
  `document.elementFromPoint` at the button's centre returned the **button** — a person
  could always click it — while Playwright's hit test returned its **parent**. "A user can
  click this" and "Playwright can click this" are different questions, and only the second
  was ever broken.
- **Nothing pins the gate's case count.** `forbidOnly: true` stops the `test.only`
  version of this, but a `describe.skip` still removes a file's worth of coverage from a
  run that exits 0. The count is in the `list` output and no assertion reads it. A
  `--list --reporter=json` check would close it.
  **It had already rotted when OBRS-753 arrived.** The table above read "102 in 9 files";
  the tree that card branched from (`f6e053b5`) actually ran **104 in 10** — OBRS-584 put
  `customer-contrast-gate.spec.ts` in the lane the same day and left the table alone. It
  is now **115 in 12**, measured from Playwright's own `Running N tests` line rather than
  counted by hand. Two things follow. A number here goes stale the moment a card adds a
  spec, and it stays wrong silently — which is the argument for the assertion, not for
  another careful edit. And do not try to recover the count by grepping the `list`
  reporter's output: it prints two lines per case, so on OBRS-753's tree that grep gave
  123 for a run Playwright itself called 113.
  **Then it rotted again the same day.** OBRS-753 wrote "113 in 11" on 2026-07-27;
  OBRS-767 merged two more cases in hours later, off the same base commit `f6e053b5`.
  Neither branch could see the other's spec until the merge, and both conflicted on
  exactly the two files that name a lane member (`e2e/lanes.json`,
  `playwright.gate.config.ts`) — which is the only reason anyone noticed. Two branches off
  one base each adding a gate member is the normal shape of this repo, not an unlucky day.
  Read every count in this file as *the last measurement*, not as the current truth.
  **And again, same day, third time.** OBRS-775 branched from `9c8d4366` while OBRS-767
  was still landing, conflicted on the same two files for the same reason, and took the
  count to **121 in 13**. That is three rots in one day from the same mechanism. It also
  cost more than a table edit: OBRS-767's `seedStore` fix (`a991782a`) exists *because*
  this card added a second CPU-heavy spec to a 2-worker lane and lost a race that had
  always been there. Adding a gate member changes the timing budget of every other
  member, which no count in a table can tell you.
  **A fourth rot, and this one added no file.** OBRS-776 widened
  `host-box-sweep.spec.ts` from 27 screens to 42 and added three cases to it, taking the
  lane to **124 in 13** and **6.9 min** — up from 5.8. So the count went stale without a
  new spec, a new lane member or a conflict in either of the two files that would have
  made anyone look. Cost is what moves here, and cost has no registry: a spec that grows
  its own page list spends the lane's budget exactly as a new spec would.
  **A fifth, and it moved the count not at all.** OBRS-782 widened the same spec again,
  from 42 screens to 47, and the lane is still **124 in 13** because the five new screens
  were added to cases that already existed rather than as cases of their own. Measured at
  **6.3 min** against OBRS-776's 6.9, which is a DROP and must not be read as one: the
  five screens cost `host-box-sweep.spec.ts` real time (1.9 min for the spec alone), and
  the lane total moves by more than that between runs on this box. The honest reading is
  that lane cost here has run-to-run noise wider than a five-screen change, so a single
  total is evidence of nothing on its own -- which is one more reason the count in a table
  was never the thing to watch.
  **A sixth, and this one turned `dev` red.** The five screens OBRS-782 added took the
  `admin, staff and session-bound pages` case from **41.6s to 58.7s** against the config's
  flat `timeout: 60_000` -- 98% of its ceiling, still green, and therefore invisible. The
  next commit to land (OBRS-794, which touched one admin component and no page list) went
  **red on the clock alone**: it swept the same 47 pages and ended on the same one as the
  green run before it. Nothing about that commit was wrong.
  This is the lesson above with a bill attached. Cost has no registry, and a fixed
  per-test ceiling is a registry entry nobody updates -- while the sweep is *required* to
  grow, because `primeng host users are all swept` fails anyone who adds an admin screen
  without adding it to `ADMIN_SWEEP`. OBRS-798 replaced the flat ceiling with
  `sweepBudgetMs()`, which derives the budget from the list's own length, so growth pays
  for itself. Note which knob moved: no assertion was relaxed, every page still gets
  `PAGE_READY_TIMEOUT_MS` to come up, and a new case proves a stuck page is still reported
  by name -- because "the gate went red so we raised the limit" is otherwise
  indistinguishable from muting it.
- **Three specs are run by no committed config** — `obrs-564-booking-policy`,
  `obrs-576-config-change-history` and `obrs-296-child-fare-qa`. The first two expect a
  hand-built database and say so in their headers. The third is genuinely hermetic and is
  one `testMatch` line from joining the gate; it stays in CAPTURE because its purpose is
  producing the OBRS-296 screenshots, not asserting behaviour.
- **`e2e/lanes.json`'s `config` field is documentation, not enforcement.** Nothing checks
  that the named config can actually run the spec — one entry was wrong on the first pass
  and only a human reading caught it.
