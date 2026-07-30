# MANUAL TEST — OBRS-907: shared `<app-loading-state>` primitive (regression, not acceptance)

Worktree `OBRS-frontend-wt-907-loading`, branch `imp/907-loading-primitives`, 4 commits on
`ee6f026d`. **This is a parity pass** — the job is to prove nothing visible moved, not to sign off
new behaviour. It was executed by the QA agent, not handed to a human.

## What changed

- New shared component `src/app/shared/components/loading-state/` (`<app-loading-state>`), three
  variants (`skeleton` / `spinner` / `inline`), two graphics (`ring` / `icon`).
- Exactly **2** call sites migrated onto it: `my-booking-ticket-modal` (the e-ticket load spinner)
  and `notification-inbox-panel` (the notification bell's first-load "sync" icon).
- `.admin-skeleton` (used directly by 30 admin templates) **moved, byte-identical**, from
  `admin-theme.scss` into the new `src/styles/_loading.scss`; its keyframe was renamed
  `admin-skeleton-shimmer` → `loading-state-shimmer` (same declarations).
- Dead `.admin-loading-backdrop` / `.admin-loading-panel` (zero template call sites) deleted.
- `.admin-loading-spinner` (used by `export-button` and, unchanged, by `notification-inbox-panel`)
  was **not** touched.

## Setup

Two setups were used, both hermetic (no live SIT dependency — deliberately, see below):

1. **GATE lane** — `E2E_GATE_PORT=4917 npx playwright test --config=playwright.gate.config.ts`.
   Serves the DEFAULT (local) build (`apiUrl` = `:8080`, nothing listening), so every call must be
   stubbed or the spec fails by name — a spec that passes here is *provably* hermetic.
2. **Before/after evidence capture** — a throwaway config+spec pair written for this card
   (`playwright.obrs907qa.config.ts`, `e2e/tests/obrs-907-qa-parity-capture.spec.ts`), reusing the
   SAME synthetic-session helpers the shipped `obrs-907-loading-state-reduced-motion.spec.ts`
   already uses (`e2e/support/gate-admin-session.ts`, `e2e/support/customer-pages.ts`) rather than
   real SIT logins — deterministic, and directly comparable across the `ee6f026d` / branch
   checkouts since the fixtures don't change between them. Dark mode via the
   `localStorage['app_admin_theme']` key ThemeService itself reads (not the toggle button), same
   convention as `customer-pages.ts`.
3. **SIT-LIVE lane** (informational only, not a gate per its own docstring) —
   `npx playwright test --config=playwright.config.ts`, `npm run start:sit -- --port 4202` (SIT
   CORS accepts any localhost origin). Login `admin@system.local` / `P@ssw0rd` (the only seeded
   admin account — role-gated `/admin/**`, so there is no "distinct" admin login available; the
   customer-facing captures above used the synthetic session instead of a second real login to
   avoid consuming this shared credential twice in one pass).

A fresh worktree needs `src/environments/environment.local.ts` (gitignored) copied from the
`.example` template — blank values pass `check-local-env.mjs`'s shape gate.

## Cases

| # | Surface | Steps | Expected | Automated by |
| --- | --- | --- | --- | --- |
| 1 | Ticket modal spinner | Open My Bookings → view e-ticket on a paid booking, hang the tickets fetch. | `.loading-state-ring` renders at `36×36px`, `4px` border, `border-top-color` blue / `border-color` grey, `0.8s` rotation — identical to the deleted `.ticket-modal__spinner`, screenshot pixel-identical to BEFORE. | `obrs-907-qa-parity-capture.spec.ts` "ticket modal spinner" (light+dark) |
| 2 | Notification panel spinner | Open `/admin`, click the bell, hang `GET .../private/notifications`. | `.admin-loading-spinner` renders at `28×28px`, same colour, `admin-loading-spin` animation (global rule, unchanged) — before/after JSON is **byte-identical**. | same spec, "notification panel spinner"; also pinned by the shipped `obrs-907-loading-state-reduced-motion.spec.ts` (GATE lane) |
| 3 | Admin skeleton — Users, Vehicles, Routes, Bookings | Navigate to each `/admin/*` list page, hang every admin call so the list never resolves. | `.admin-skeleton` renders `12px` tall, same gradient stops, `400% 100%` background-size, `1.4s ease infinite` shimmer, screenshot pixel-identical to BEFORE, both themes. | same spec, "admin-skeleton — {page}" × 4 pages × 2 themes = 8 cases |
| 4 | `prefers-reduced-motion: reduce` | Emulate reduced motion on the admin bell spinner. | Animation freezes (`animationName: none`) without disappearing; a **positive control** first proves the un-reduced case actually rotates. | `obrs-907-loading-state-reduced-motion.spec.ts` (GATE lane, already shipped with the branch) |
| 5 | Full GATE regression | `npm run e2e:gate` (16 spec files, 137 cases as of this run). | No new failures vs. the same lane run against `ee6f026d`. | see Results |
| 6 | Two named pre-existing failures | Re-run `dark-override-effective.spec.ts` and the `staff-sell-walkin.spec.ts` "clearing the filter" case against `ee6f026d` directly. | Both reproduce (or don't) identically on `ee6f026d` — proves they predate this branch. | see Results |
| 7 | Static gates | `npm run test:loading-primitives`, `npm run test:e2e-lanes`. | Both green — no undeclared new rotate/shimmer keyframe, lane registry self-consistent. | see Results |

## Results

### Case 5 — GATE lane, branch `imp/907-loading-primitives` (E2E_GATE_PORT=4917)

**137 tests, 136 passed, 1 failed.** The 1 failure is `dark-override-effective.spec.ts` (case 6,
confirmed pre-existing below). `staff-sell-walkin.spec.ts › clearing the filter restores the full
list` **passed** in this run.

### Case 6 — same two specs, re-run against `ee6f026d` directly (E2E_GATE_PORT=6217)

- `dark-override-effective.spec.ts` — **failed, byte-identical signature**:
  `body.is-dark [_nghost-ng-c2400627997] .btn.dropdown-toggle[_ngcontent-ng-c2400627997]
  .value-text[_ngcontent-ng-c2400627997] :: color` paints `rgb(154,163,184)`, declares
  `rgb(232,234,240)`, same 4 sightings on `home,schedule-booking`. Confirmed pre-existing —
  unrelated to this branch (this branch's diff touches no dropdown/value-text file).
- `staff-sell-walkin.spec.ts › clearing the filter restores the full list` — **passed** on
  `ee6f026d` too. The "load flake" report did not reproduce in either run of this pass; treating it
  as a flake that clears on an uncontended run, not a regression.

### Case 7 — static gates

- `npm run test:loading-primitives` → `loading-primitives gate OK: 19 qualifying rotate/shimmer
  keyframe(s) across 185 stylesheet(s) scanned; 16 known-debt … 2 designated shared-home file(s),
  0 new duplicate(s).`
- `npm run test:e2e-lanes` → `E2E lane gate OK -- 44 specs declared: GATE=16, OWN-DB=9, CAPTURE=11,
  SIT-LIVE=8.`

### Cases 1-3 — before/after computed-style diff (`ee6f026d` vs branch, same script, same fixtures)

Diffed every BEFORE/AFTER JSON pair under `docs/manual-tests/obrs-907-evidence/`:

- **Notification panel** (both themes): **zero diff.** JSON files byte-identical.
- **Admin skeleton** (4 pages × 2 themes = 8 pairs): only `animationName` differs
  (`admin-skeleton-shimmer` → `loading-state-shimmer`, the deliberate rename) — height, width,
  border-radius, gradient stops, background-size, duration, timing-function, iteration-count all
  identical.
- **Ticket modal** (both themes): `animationName` differs (Angular's per-component scoped name,
  expected — it's now a different component instance) and **`display: inline-block` → `block`**.
  Investigated rather than waved through: the ring's own stylesheet still declares
  `display: inline-block` unchanged: the new value comes from CSS **blockification** — the ring is
  now a flex-item child of `<app-loading-state>`'s `.loading-state { display: inline-flex; }`
  wrapper, and a flex item's inline-level display is blockified to `block` per the CSS Display
  spec, regardless of its own declared value. The old bare `.ticket-modal__spinner` had no such
  wrapper. Confirmed inert: the ring is the sole content of that flex box, so block-vs-inline-block
  changes nothing about its box (no siblings to flow around), and the BEFORE/AFTER screenshots are
  pixel-identical. Width/height/border/colour/duration all otherwise identical.

Screenshots opened and compared by eye as well (not just diffed): `notification-panel-dark`,
`admin-skeleton-users-dark`, `admin-skeleton-routes-light`, `ticket-modal-light` pairs — all
pixel-identical between BEFORE and AFTER.

### Detached-checkout hygiene

`git checkout --detach ee6f026d` → captured/re-ran → `git checkout imp/907-loading-primitives`.
Verified with `git log -1 --oneline` (`c15c1f7a`, correct branch) and `git status --porcelain`
(clean except this pass's own untracked QA artifacts) both before detaching and after returning.

## Verdict

No behaviour delta found on any of the 3 migrated/moved surfaces. The one visible-looking
`display` change is CSS-spec blockification with a proven-inert effect, not a regression. The one
GATE failure and the one previously-reported flake both reproduce/resolve identically off
`ee6f026d`, so neither is attributable to this branch.
