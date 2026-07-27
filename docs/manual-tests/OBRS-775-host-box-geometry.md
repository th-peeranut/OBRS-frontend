# OBRS-775 — the codebase-wide `display: inline` host sweep, and the proof it moved nothing

Measured 2026-07-27 on `imp/obrs-775-host-box-sweep`, branched from `origin/dev`
at `9c8d4366` (the OBRS-753 fix).

## What was wrong

An Angular component whose SCSS never writes `:host { display: ... }` renders as
`display: inline`, because that is the CSS initial value and Angular adds
nothing. When such a host holds block-level children, CSS requires the browser to
split the inline box and wrap the children in **anonymous block boxes** — after
which the host's own border box stops describing anything you can reason about.
On OBRS-753 that made Playwright's hit test at a button resolve to the button's
own parent, which is what turned `b2c-critical-path` red on the first CI run of
the gate lane (OBRS-750) and cost a 60-second timeout on every run after.

The defect is a **missing declaration**. Nothing in any diff says "this host is
inline" — you get it by not writing anything. No reviewer sees it and no
stylesheet parser can tell an inline host that is fine (all children inline, or
the host is a flex/grid item its parent blockifies) from one that is malformed.
Only the cascade knows, and the cascade only exists in a browser.

## The count

`e2e/tests/host-box-sweep.spec.ts` visits 27 pages the hermetic GATE lane can
reach — 8 customer, 9 public/auth-entry, 10 admin/staff/session-bound — and
reports every custom-element host that is `display: inline` while holding at
least one **in-flow** block-level child.

| | hosts |
|---|---|
| First run, 2026-07-27 | **39** |
| Ours, fixed on this branch | **37** |
| PrimeNG's, allow-listed → OBRS-776 | **4** |

37 + 4 = 41, not 39, because two hosts became malformed *because of* this card —
see "The cascade" below.

### Two corrections to the numbers on the card

1. **`app-report-usability-fab` is not a defect.** The card lists it among 25.
   Its only child is `.report-fab { position: fixed }`, and an out-of-flow box is
   removed from the flow *before* the inline box would be split, so the host is
   well-formed. Absolutely positioned, fixed and floated children are excluded by
   the detector for this reason, and the exclusion is asserted (`x-probe-absolute`,
   `x-probe-float` in the must-not cases). Counting it would have put a fictional
   entry on the allow-list.

2. **The admin/staff group the card called unsurveyed holds 6, not the thickest
   share.** `app-staff-layout`, `app-walk-in-center-panel`, `app-walk-in-checkout`,
   `app-boarding-list`, `p-calendar`, plus `app-root` on every `/admin/*` route.
   The static census pointed at this group because it counts *root children*, and
   an admin page with 8 of them looks worse on paper than a customer page with 1.
   Only the runtime sweep can tell those apart. The 14 hosts the card had not seen
   are mostly the **public/auth-entry** pages it never listed: the four policy
   pages, `forget-password`, `reset-password`, `login-mobile`, `register`,
   `otp-validate`, `payment-result`.

## The cascade — why this needed a gate and not a checklist

After the first 35 fixes landed, the sweep went red on **`app-home`** and
**`app-schedule-booking`**, which had been clean an hour earlier. Neither was
touched. Their only children are other component hosts, and while those children
were inline there was no block-level child for an inline box to hold illegally.
Making the children well-formed made these two the next malformed box.

That is the whole argument for the gate in one run: a list of "components someone
checked" would have shipped with two fresh instances of the defect it was written
to remove. Both are fixed and the sweep converges — the run after them reports
only the four PrimeNG hosts.

## The evidence that nothing moved

`e2e/tests/obrs-775-geometry.spec.ts` (CAPTURE lane,
`playwright.obrs775.config.ts`) measures the border box of **every element** on
all 27 pages at the four media-query widths — 1280, 1024, 768, 576 — once with
the `:host` additions absent and once with them applied, and fails on any box
that moved more than 0.5 px.

```
OBRS775 phase=before screens=108 boxes=16483   # pre-schema; head/anim not yet excluded
OBRS775 phase=after  screens=108 boxes=14306
OBRS775 compared=14302 excluded-as-animated=4 moved=0 structural=0
```

**108 screens, 14,302 boxes compared, 0 moved, 0 structural changes.**

Measuring every element rather than a selector list is deliberate. A selector
list can only confirm what its author already suspected, and this card exists
because a defect nobody could see in a diff survived a green CI. AC3 asks for
before/after coordinates at each component's media-query widths; this is that,
made exhaustive.

### The harness fires — must-catch

A comparison that reports zero is worth nothing until you have seen it report
something. `padding-left: 1px` added to one host (`app-business-policy`) and
nothing else:

```
OBRS775 compared=14302 excluded-as-animated=4 moved=408 structural=0
  business-policy@1280 .../app-business-policy/0:app-navbar moved by 1.00px
    before=[0,0,1280,80] after=[1,0,1279,80]
```

408 boxes reported from a one-pixel change to a single component. The probe was
reverted; `git log -p` on this branch contains no `padding-left`.

### Two exclusions, both stated rather than absorbed into the tolerance

- **`<head>`** is not walked. Adding a stylesheet makes Angular inject one more
  `<style>` element, so the first run reported 116 zero-sized `<head>` children
  as "appeared" and buried the two findings that mattered.
- **Elements with a running CSS animation** are skipped and listed by name in
  `e2e-evidence/obrs775-geometry-diff.txt`. Exactly one qualifies:
  `/payment/result` renders `.spinner { animation: spin 0.9s linear infinite }`,
  and `getBoundingClientRect` on a rotating box returns its axis-aligned bounds,
  which breathe between 50.98 px and 60.11 px as it turns. The first run reported
  it as a 6.86 px move in one direction at 1280 and the *other* direction at 576
  — the signature of animation phase, not of layout. Widening the tolerance to
  swallow it would have blinded the harness to every real move under 7 px.

## The one real regression the harness caught

`app-walk-in-center-panel` collapsed from **548 px to 185 px** at 1280 and from
**628 px to 185 px** at 1024, with `display: block` alone.

Its template root is `.center-panel.h-100` — Bootstrap's `height: 100%` — and a
percentage height resolves against the **containing block**. While the host was
inline it established none, so `h-100` reached past it to `.card-body`, which
`.card { display: flex; flex-direction: column }` gives a definite height.
`display: block` makes the host that containing block with `height: auto`, at
which point the percentage has nothing to resolve against and computes to auto.
The empty-state panel stopped filling its column.

This is precisely the failure the card predicts for a blanket edit, and it is the
reason the card forbids one. Fixed with `:host { display: block; height: 100% }`
and re-measured to 0.

A static census of all 37 templates for a percentage-height or flex-fill root
found **exactly one** — the same component. The static and runtime answers agree,
which is the only reason to trust either.

## Reproducing

```powershell
# the gate (hermetic, no backend)
npm run e2e:gate                       # 119 cases

# the before/after geometry, two runs by hand
$env:OBRS775_PHASE='before'; npx playwright test --config=playwright.obrs775.config.ts
#   ... apply or revert the :host additions ...
$env:OBRS775_PHASE='after';  npx playwright test --config=playwright.obrs775.config.ts
```

Artefacts land in `e2e-evidence/` (gitignored): `obrs775-geometry-before.json`,
`obrs775-geometry-after.json`, `obrs775-geometry-diff.txt`.

## Also verified on this branch

| check | result |
|---|---|
| `ng test` | 3884 of 3884 SUCCESS |
| `npm run e2e:gate` | 121 passed |
| `npm run build:sit` | exit 0 |
| the nine `npm run test:*` static gates | all OK, including `test:auth-layout` over the 7 auth pages whose SCSS this card edits |

### Everything above was re-measured after a rebase, not carried over

This branch started at `9c8d4366` and OBRS-767 landed three commits on `dev`
underneath it — including `a991782a`, which rewrites `seedStore`, the helper this
card's geometry harness calls on four of its pages. A baseline captured against
the old helper compared to an AFTER captured against the new one would have
reported timing as layout. Both phases were re-captured on the rebased base
(`f69b74e7`) and the numbers above are from that run, not the first one.

That commit is also *this card's fault*, and the connection is worth keeping:
`seedStore` raced Angular's bootstrap and had always won on a light lane.
`host-box-sweep.spec.ts` is the second CPU-heavy spec in a 2-worker lane, and
adding it is what made the race lose. Putting a spec in the gate changes the
timing budget of every spec already in it.

## What is left, and why

The four PrimeNG hosts — `p-tabview`, `p-tabpanel`, `p-card`, `p-calendar` — are
on `ALLOW` in the sweep with a reason each. The host element belongs to a library
component, so no `:host` rule of ours reaches it: the fix is a global rule in
`styles/`, which lands on **every** instance in the app at once, including those
on pages this sweep does not visit. Shipping it here would mean asserting
something over a population that was never measured. **OBRS-776** widens the
sweep first, then fixes them.

`ALLOW` is not a parking space: `no stale ALLOW entries` fails on any entry the
sweep no longer sees malformed, so the list cannot quietly outlive the problem.
