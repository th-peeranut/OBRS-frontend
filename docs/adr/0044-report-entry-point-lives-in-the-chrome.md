# The report entry point lives in the chrome, not over the page (OBRS-1832)

Supersedes [ADR-006](./ADR-006-global-fab-report-usability-modal.md) in one part only:
where the control that opens the usability-report modal lives. Everything else ADR-006
decided — anonymous submit, the inline body-scroll lock, synchronous open with no
pre-flight HTTP, the admin triage store, the error-code mapping — is unchanged, and the
modal is still mounted as a sibling of `<router-outlet>` exactly as that ADR put it.

## Context

ADR-006 mounted `<app-report-usability-fab>` above the router outlet as a
`position: fixed` pill in the bottom-right corner. That corner belongs to no page, so the
button and the app coexisted by **guessing at runtime**: on every `requestAnimationFrame`
that followed a scroll, resize or DOM mutation, the component ran `elementsFromPoint` at
nine points and faded itself out (`pointer-events: none`) when it covered another
clickable element's **centre**.

The threshold was not arbitrary, and loosening it is not the fix. OBRS-1207 measured it:
yielding on *any* overlap left the button inert at **54%** of reachable scroll offsets on
`/schedule-booking` and **37%** on `/` (20px sampling at 1280×720). Centre-coverage was
the least-bad line to draw.

But every threshold leaves a remainder, and the remainder is a defect with a card number.
OBRS-1828: at 390px and 360px on `/my-bookings`, `button.actions-menu-btn` still lost
hit-test probes to the pill — the button clips a corner of the control without covering
its centre, so the heuristic correctly decides not to yield and the user still cannot
reach part of the target. The owner closed OBRS-1828 as **decided, not fixed**, and
explicitly forbade adding those four controls to an audit allow-list: a silenced gate
would leave the shape of the defect in place.

Three rounds (OBRS-1207, OBRS-640, OBRS-1828) tuned a heuristic without ending the class
of defect it manages.

## Decision

**Chrome owns its own pixels. No control floats over pixels another element owns.**

The floating button is deleted. The entry point becomes a piece of each shell's chrome,
in one position stated as a single rule with no exceptions:

> The `flag` icon is the **left-most item of the tools cluster at the top right**, in
> every shell, at every width.

That cluster already existed everywhere, which is what makes the rule affordable:

| shell | cluster | note |
|---|---|---|
| customer | the theme/language/account group in `<app-navbar>` | measured: `.button-container` is inside `.navbar-desktop-only`, which is `display:none` at ≤992px — so the trigger sits OUTSIDE it, in a new `.navbar-tools` wrapper, next to the hamburger |
| staff / admin | `.admin-topbar-actions` | measured: never hidden by width, only `flex-wrap` |
| auth pages (8 routes, no navbar) | `.change-language` | login, login-mobile, register, otp, forget-password, reset-password, verify-email, change-email/confirm |

A second, **labelled** entry point is added inside the menus that slide open, where there
is room for words and the user is least likely to know what an icon means: the customer
mobile panel (end of the links group) and the staff/admin sidebar footer, which is the
off-canvas drawer at ≤1100px (`src/styles/admin-theme.scss`).

Both entry points stay on screen at once while a menu is open. Hiding the icon then was
considered and rejected: a control that appears and disappears with state is the class of
behaviour this ADR exists to remove.

### How the mount points stay in sync

ADR-006 rejected per-shell mounting because it "requires three separate mount points that
must stay in sync and cannot serve anonymous routes that have no shell". Both objections
are answered structurally, not by discipline:

- **One component, two variants.** `<app-report-trigger variant="icon" | "row">` is the
  only implementation. It knows how to *ask*; `ReportUsabilityModalService` carries the
  ask; the single `<app-report-usability-modal>` answers. A fourth shell needs one line.
- **`buttonClass` instead of a fourth skin.** The staff/admin mounts pass
  `admin-icon-btn` / `admin-nav-link` — global classes — so the trigger wears that
  shell's own hover, focus and dark treatment. The component's own skin stands down when
  a class is supplied.
- **Each mount point is pinned by a spec**, in the shell's own spec file, asserting the
  *position* (first child of the cluster; outside `.navbar-desktop-only`) rather than
  mere presence.
- **The anonymous routes are served**, because they turned out to have the same cluster.

### What was deleted with it

- the rAF loop, `MutationObserver`, `ResizeObserver`, `elementsFromPoint` hit-test and
  `isClickableUnderFab` in the component;
- `scripts/check-fab-yield-selector.mjs` and its CI step, which existed only to keep the
  component's "what counts as clickable" list in sync with the gate's copy;
- `e2e/tests/obrs-1207-fab-occlusion.spec.ts` and the hit-test half of
  `e2e/support/fab-occlusion.ts` (the file's scroll helpers survive as
  `e2e/support/viewport-scroll.ts`, still used by three other specs);
- `.inspection-bottom-bar`'s 210px / 88px right padding, which existed so the staff
  inspection form's primary Submit button could not grow into the pill's footprint;
- the `body.has-sticky-cta` class that `/schedule-booking` and `/passenger-info` set on
  the body to push the pill higher — with the pill gone it had no reader left.

None of these were deleted for being red. Each is listed with the reason it has no
subject any more: **nothing floats, so nothing has to yield.**

## Consequences

**The defect class is closed, not narrowed.** There is no threshold left to tune, and no
gate left that has to agree with a runtime heuristic about what "blocked" means.

**Fewer moving parts.** One rAF-driven hit test, two observers, one parity script and one
E2E sweep are gone; what replaces them is markup and one 20-line service.

**Discoverability drops, and by how much is not known.** The FAB was deliberately in the
way — that was its job. There is no telemetry on report submissions, so the size of the
drop cannot be stated, only that there is one. The owner accepted this unknown when
choosing this direction on 2026-09-11; the labelled menu rows are the mitigation.

**Two entry points are visible at once on a customer phone with the menu open.** Accepted
deliberately (see above).

**A new shell must remember one line.** The counter-measure is the per-shell spec: a
layout that renders a topbar cluster without a trigger fails its own spec file, not a
distant global one.
