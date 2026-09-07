# MANUAL-TEST OBRS-714 — public auth pages have an in-tab way home

Branch `ao/obrs-714-auth-page-exits` · commit `e1359251` · base `origin/dev` @ `5950c448` · PR [#412](https://github.com/th-peeranut/OBRS-frontend/pull/412)

**Every item below was executed by this session on 2026-09-05.** Nothing here is homework — it is
the script that was run, kept so the next person can re-run it. Ticks record what was *observed*;
each one names the command or the measured value it came from.

## 0) Start

Frontend only — no backend is needed and none was running. That is deliberate: with the API dead,
`/otp/login/<phone>` raises the shared error alert, which is the owner's exact 2026-07-26 report.

```bash
# AFTER (this branch)
cd ../OBRS-frontend-wt-obrs-714 && npx ng serve --port 4365

# BEFORE (a throwaway worktree checked out at origin/dev, own port)
git -C ../OBRS-frontend worktree add --detach ../OBRS-frontend-wt-obrs-714-before origin/dev
cd ../OBRS-frontend-wt-obrs-714-before && npx ng serve --port 5274
```

Both servers were killed and the BEFORE worktree removed with
`.claude/agent-office/scripts/safe-worktree-remove.ps1` when the run finished.

## 1) Unit gate

```bash
npx ng test --watch=false --browsers=ChromeHeadless
```

- [x] **TOTAL: 6716 SUCCESS**, exit 0 — the whole suite, not a narrowed run.

## 2) Reachability matrix — 8 pages × 2 viewports × 3 languages × 2 themes

```bash
OBRS_BASE_URL=http://localhost:4365 OBRS_VARIANT=AFTER  node e2e/capture-obrs-714-auth-exits.mjs
OBRS_BASE_URL=http://localhost:5274 OBRS_VARIANT=BEFORE node e2e/capture-obrs-714-auth-exits.mjs
```

Asserted by measurement, never by eye: `getBoundingClientRect` for "is it on screen",
`document.elementFromPoint` at the element's own centre for "would a finger hit it". The script
exits non-zero on any AFTER failure, so a typo'd selector goes red instead of passing silently.

- [x] **BEFORE: 96 of 96** combinations reported `no in-tab link to /`.
- [x] **BEFORE:** `otp-validate`, `verify-email`, `change-email/confirm` rendered `hrefs=[]` — not one
      in-tab anchor.
- [x] **AFTER: 96 of 96 pass, 0 failures.** Every page has `href="/"`, `inViewport=true`,
      `hitTestable=true`.
- [x] `target="_blank"` links are excluded from the count, so `/privacy-policy` never masks a dead end.

Measured caveat, recorded rather than hidden: at **390×844** the `otp-validate` **text** exit sits
below the fold (`inViewport=false` in all 6 language/theme combinations) while the page's own submit
button is in view (`submitInVP=true`). The **logo** exit at the top is in view and hit-testable in
every mobile combination.

## 3) Real touch, not a scroll-then-click

Same script, `tapProof()` — a touch-enabled 390×844 context, `page.tap()` with no `force`,
then a URL assertion. This is the only step that proves the links *navigate*.

- [x] tap the logo → landed `/`
- [x] tap the text exit → landed `/login-mobile`

## 4) Keyboard — the proof a screenshot cannot give

The fix wraps the logo in an `<a>` and moves no pixel, so BEFORE/AFTER stills of `/login` are
byte-identical. Focus is what changed.

```bash
OBRS_BASE_URL=http://localhost:4365 OBRS_VARIANT=AFTER  node e2e/capture-obrs-714-focus-proof.mjs
OBRS_BASE_URL=http://localhost:5274 OBRS_VARIANT=BEFORE node e2e/capture-obrs-714-focus-proof.mjs
```

- [x] **BEFORE:** 25 Tab presses cycle the page twice and never reach the logo — nothing focusable there.
- [x] **AFTER:** Tab #3 lands on `A[href=/]`, with Chrome's own focus ring (not drawn by the script).

## 5) The gate can fail (AC-4)

- [x] Removed the wrapper from `login.component.html` → `1 FAILED`,
      `Expected $.length = 1 to equal 0`. File restored.
- [x] Removed the wrapper from `register`'s **second** logo (the `registrationEmailSent` screen) →
      `1 FAILED`, `registrationEmailSent branch: Expected [ '/login' ] to contain '/'`. File restored.
- [x] Recorded because it nearly slipped: with only the *transitive* spec, removing `login`'s wrapper
      stayed green at 26/26 — `login` still reached `/` via `/register`. That is why the per-page
      direct-exit spec exists.

## Regression checklist for later runs

1. `npx ng test --watch=false --browsers=ChromeHeadless` — `nav-reachability.spec.ts` fails closed on a
   new top-level route that nobody classified, in either direction.
2. Re-run §2 whenever an auth template changes; the script's own exit code is the gate.
3. If a new public auth page is added, it must appear in `AUTH_PAGES` **and** carry
   `<app-auth-home-link>`, or both the partition sweep and the direct-exit spec go red.
