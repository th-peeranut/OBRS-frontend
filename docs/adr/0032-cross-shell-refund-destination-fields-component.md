# ADR 0032 — `AppRefundDestinationFieldsComponent`: the first cross-shell dumb INPUT component, and its `--rdf-*` token-override pattern

**Date:** 2026-07-27
**Status:** Accepted
**Branch:** `ao/obrs-286-manual-refund`

## Context

OBRS-286 (manual refund mechanism) needs a bank-account/PromptPay
destination-capture form in **two** places that share no ancestor styling:

1. `CancelRefundDestinationModalComponent` — customer shell, a hand-rolled
   backdrop modal off My Bookings (Flow A1). No `.admin-shell` ancestor;
   `--admin-*`/`--accent*` custom properties resolve to nothing here.
2. `OverrideCancelModalComponent` — admin shell, inside `.admin-shell` (Flow
   A3). `.admin-field`'s pill input styling is themed entirely through
   `--admin-*`/`--accent*`.

A third consumer is already committed: the UI spec requires the component be
"shell-agnostic so OBRS-766 [a future staff act-on-behalf cancel screen] can
reuse it unchanged."

Prior cross-shell reuse in this codebase (`ParcelTrackingPageComponent`,
OBRS-305; `MyReportsComponent`, OBRS-433) is all **status chips** — read-only
output, re-declaring the SAME `--admin-*-bg`/`-text` custom property *values*
at a customer `:host` so the shared `.admin-status.is-*` markup renders
correctly outside `.admin-shell`. None of them is an **input control**, and
none needs the admin shell's own runtime theming (light/dark accent
switching) to also apply correctly to a customer-shell instance of the same
component.

## Decision: the component declares its own `--rdf-*` custom properties, defaulted to the customer brand, overridden by ancestor

`AppRefundDestinationFieldsComponent` (`src/app/shared/components/refund-destination-fields/`)
declares seven component-scoped CSS custom properties (`--rdf-text`,
`--rdf-muted`, `--rdf-border`, `--rdf-surface`, `--rdf-accent`,
`--rdf-accent-contrast`, `--rdf-danger`) and styles its own markup
(a hand-rolled 2-segment toggle + pill text inputs — **not** `.admin-field`,
**not** `.form-control`) exclusively through them. Four rules, in this order:

1. `:host` — customer-shell light defaults (`$text-black`, `$brand-customer-strong`, …).
2. `:host-context(body.is-dark)` — customer-shell dark. `dark-theme.scss`'s
   `$dk-*` SCSS variables are file-private (importing the whole file into a
   component's scoped stylesheet would pull its entire global ruleset along
   with it), so these are the same values **copied verbatim** — the same
   "own token names, values copied" idiom OBRS-426 established for a Leaflet
   marker's injected HTML, applied here for the same underlying reason
   (no cross-file SCSS-variable sharing mechanism exists for the customer
   dark palette, unlike the admin shell's runtime `--admin-*` vars).
3. `:host-context(.admin-shell)` — admin shell, **both** themes at once: each
   `--rdf-*` **aliases** the corresponding runtime `var(--admin-*)`/
   `var(--accent*)` token rather than copying a value, because those admin
   tokens are already dark-aware (`admin-theme.scss`'s own
   `.admin-shell.is-dark` block redefines them) — the alias resolves
   correctly under either theme with one rule.
4. `:host-context(.admin-shell.is-dark)` — a **required safety net**, not a
   cosmetic duplicate of (3). `ThemeService` writes `is-dark` on
   `document.body` **unconditionally**, regardless of which shell is active
   (confirmed against `theme.service.ts`; also documented in
   `src/app/testing/contrast.ts`'s `mountInChain` comment). That means rule
   (2) above — a class-plus-element context selector — can outrank the
   single-class rule (3) by CSS specificity and repaint the admin surface
   with customer-dark values while the admin shell is dark. Repeating (3)'s
   identical values under the two-class `.admin-shell.is-dark` selector
   guarantees admin-dark always wins, independent of stylesheet source
   order.

Contrast is measured, not assumed, in all four combinations (customer
light/dark × admin light/dark) via `mountInChain`/`effectiveBg` from
`src/app/testing/contrast.ts` — `refund-destination-fields.component.spec.ts`
is the regression test, following the `override-cancel-modal.component.spec.ts`
working reference cited in the office's FRONTEND-GOTCHAS.

## Alternatives rejected

- **Reuse `.admin-field` directly, guard with `*ngIf="!isCustomerShell"` and a
  second customer-only template branch.** Doubles the markup/validation
  wiring for a single dumb component and still requires solving the same
  "no shared cross-shell token source" problem for the customer branch's own
  styling — strictly more code for the same result.
- **Style purely via `:host-context(.admin-shell)` overrides on top of a
  customer-first stylesheet, with no dedicated `--rdf-*` namespace.** Leaves
  the component's own rules entangled with whichever shell happens to be
  live, and reintroduces exactly the `.admin-field`-depends-on-`--admin-*`
  coupling this component exists to avoid — a future third shell (OBRS-766's
  staff surface) would need a third bespoke override block instead of
  inheriting the existing customer-light default for free.
- **Skip rule (4), trust rule (3) alone.** Works today only because every
  `--rdf-*` alias in (3) happens to point at an already dark-aware admin
  token; a future edit that copies a *value* instead of an alias into rule
  (3) (e.g. to introduce a genuinely admin-only color with no runtime
  counterpart) would silently regress under dark mode with no test catching
  it, because rule (2) would then win by specificity. Cheap insurance, kept.

## Consequences

- The next cross-shell **input** component (not just a status chip) has a
  worked pattern to copy: own token namespace, four ordered rules, the
  specificity safety net, and a `mountInChain`-based four-combination
  contrast spec.
- `docs/design-system.md` §12's "New pattern log" gets an entry pointing back
  here (see that file's OBRS-286 entry) so `obrs-ux`/`obrs-scrutinize` don't
  re-derive this from scratch on the next cross-shell input.
- OBRS-766 (staff act-on-behalf cancel) can mount
  `AppRefundDestinationFieldsComponent` inside a staff-shell surface with
  **zero** changes to this component — only a new `:host-context(.staff-shell)`
  rule (or reuse of rule 3, if the staff shell's tokens are named the same
  way) needs adding, if the customer-light default doesn't already suffice.
