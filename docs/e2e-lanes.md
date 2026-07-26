# E2E lanes

**OBRS-602.** Which Playwright specs run where, why, and which one is actually a merge gate.

## The short version

```bash
npm run e2e:gate       # 102 cases, ~2.9 min, no backend. THIS is the merge gate (runs in CI).
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
2. **The frontend is served with the default (local) configuration**, so `apiUrl` points
   at `localhost:8080` where nothing is listening. An unintercepted request gets
   ECONNREFUSED instead of quietly succeeding against SIT. A spec that passes here is
   *provably* hermetic rather than asserted to be.
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

**Debugging a GATE failure.** A timeout on an unrelated element usually means an
unmocked call: the request fails, the global error interceptor raises a SweetAlert, and
its backdrop swallows every subsequent click. Read the trace's `.network` file, or add
`await page.route('**/api/**', r => { console.log(r.request().url()); r.continue(); })`
as the first handler, to see which URL escaped.

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
| `playwright.gate.config.ts` | 102 in 9 files | the merge gate; hand-written `testMatch` |
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
  the DEFAULT configuration, so `apiUrl` points at a `localhost:8080` where nothing
  listens, and an un-intercepted request gets ECONNREFUSED instead of silently reaching
  live SIT. A cold-starting Koyeb instance therefore cannot turn this job red.
- **`b2c-critical-path` used to click `.btn-confirm` with `force: true`.** This bullet
  already said that "reports success whether or not the click lands" — and OBRS-750 found
  out the hard way that it was worse than that. `force` does not aim the event at the
  element, it only skips the actionability checks, so the mouse event still went to
  whatever was topmost at that point. Something else is: Playwright's hit test there
  resolves to `app-review-schedule-booking-total`, the button's own parent. On this box the
  click still happened to reach the button; the first time the lane ran on a GitHub runner
  it did not, the handler never fired, and the `waitForURL` after it burned the full 60s
  test timeout. **The error named the navigation, not the click** — which is exactly how
  this got mis-filed as CPU contention for as long as it did.
  The spec now uses `dispatchEvent('click')`, which reaches the button deterministically and
  cannot silently deliver the event elsewhere. Measured at 1280x720 before changing it:
  `document.elementFromPoint` at the button's resting centre returns the button, so a real
  user can click it — the interception is an artefact of where Playwright's own scrolling
  puts the element, not a product defect. The underlying cause (a component host with no
  `:host` display rule, therefore `display: inline` around two block children) is filed
  separately.
- **Nothing pins the gate's case count.** `forbidOnly: true` stops the `test.only`
  version of this, but a `describe.skip` still removes a file's worth of coverage from a
  run that exits 0. The count is in the `list` output and no assertion reads it. A
  `--list --reporter=json` check would close it.
- **Three specs are run by no committed config** — `obrs-564-booking-policy`,
  `obrs-576-config-change-history` and `obrs-296-child-fare-qa`. The first two expect a
  hand-built database and say so in their headers. The third is genuinely hermetic and is
  one `testMatch` line from joining the gate; it stays in CAPTURE because its purpose is
  producing the OBRS-296 screenshots, not asserting behaviour.
- **`e2e/lanes.json`'s `config` field is documentation, not enforcement.** Nothing checks
  that the named config can actually run the spec — one entry was wrong on the first pass
  and only a human reading caught it.
