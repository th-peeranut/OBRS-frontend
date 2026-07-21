# E2E lanes

**OBRS-602.** Which Playwright specs run where, why, and which one is actually a merge gate.

## The short version

```bash
npm run e2e:gate       # 49 cases, ~1.7 min, no backend. THIS is the merge gate.
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
| `GATE-BLOCKED` | a SIT-minted admin JWT, nothing else | not yet | `npm run e2e` |
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

**Debugging a GATE failure.** A timeout on an unrelated element usually means an
unmocked call: the request fails, the global error interceptor raises a SweetAlert, and
its backdrop swallows every subsequent click. Read the trace's `.network` file, or add
`await page.route('**/api/**', r => { console.log(r.request().url()); r.continue(); })`
as the first handler, to see which URL escaped.

### GATE-BLOCKED

Mocks all of its own API traffic, but boots with a session minted from live SIT. One
committed synthetic `storageState` away from joining the gate — except
`staff-sell-walkin`, whose own comments record that a fake token changes behaviour, so
its dependency on a real JWT is load-bearing rather than inherited.

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

## Known gaps

- **The 214/223 hang has not been reproduced.** It was reported on a full-sweep run and
  is not seen in the gate lane. The `html` reporter's `open: 'on-failure'` default does
  block on a server after a failing run, but it is gated on `process.stdin.isTTY` and a
  coding-agent check, so it cannot explain an agent run; both configs now use the `list`
  reporter anyway. The remaining hypothesis is headless Chrome dying under CPU contention
  from parallel sessions on this box, which is a measured failure mode here — untested.
- **The gate lane is not wired into CI.** Actions on this repo is a hard $0 ceiling of
  2000 minutes/month shared with the SIT deploy, so a per-push browser job is a budget
  decision for the owner. Only the free membership check runs in CI today.
- **`b2c-critical-path` clicks `.btn-confirm` with `force: true`**, which reports success
  whether or not the click lands. It passes, but the assertion after it is what proves
  anything.
