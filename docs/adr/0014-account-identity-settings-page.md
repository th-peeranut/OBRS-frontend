# ADR-0014: `/account` customer identity-settings page + verified email change

## Status
Accepted (OBRS-84)

## Context
The app had no self-service place for a signed-in customer to change their
login email. Support had to do it manually. OBRS-84 adds a minimal `/account`
page with a "Change email" action that starts a verify-then-apply flow: the
user enters their current password + a new email, gets a confirmation link at
the new address, and the change only takes effect once they click it.

This is the first "account settings" surface in the app — a small new
`account` module, plus a second public confirmation route
(`/change-email/confirm`) alongside the existing `/verify-email`.

## Decision

- **New customer module `account`** (`src/app/modules/account/`), a normal
  authenticated customer route — same guard/route shape as `/my-bookings`
  (`AuthGuard`, `data: { customerArea: true, requireAuth: true }`). It does
  **not** touch the area-based access model (`ROLE_GRANTS` / `PORTAL_ONLY_ROLES`
  / `canAccessCustomerArea` / `getHomeRoute` / `auth.guard.ts`) — no new role,
  no new confinement.
- **Page shell reuses the `/my-bookings` pattern**: `<app-navbar>` + its own
  `<h1>`/subtitle + a card (design-system §7's "single surface" rule is
  specific to the admin/staff shell's route-driven topbar title — the
  customer shell has no such topbar, and `my-bookings.component.html` already
  establishes the "page renders its own `<h1>`" pattern for this shell).
- **`ChangeEmailDialogComponent`** reuses the hand-rolled modal chrome from
  `ChangeStopDialogComponent` (ADR-0010) — backdrop, `role="dialog"
  aria-modal="true"`, top-right ×, Escape-to-close — rather than a fourth
  modal pattern. It reuses `register.component.ts`'s debounced
  duplicate-email check pipeline and `login.component.html`'s
  `.password-container` masked-password markup, rather than re-deriving
  either.
- **New public route `/change-email/confirm`** mirrors `/verify-email`'s
  shape exactly: no guard, reads `?token=` from the snapshot query map on
  init, and reuses `VerifyEmailComponent`'s spinner + state-machine shell
  (`ProgressSpinnerModule`, the same `.state-container`/`.state-icon`
  layout). It adds one visual state `/verify-email` didn't need: an
  **invalid/expired token renders NEUTRAL** (a muted icon/copy, not the red
  `fail-icon`) because this link is expected to be clicked twice in normal
  use (the user may already be signed in with the new email in another tab)
  — a scary red error on a non-error is worse than the small inconsistency
  of adding a third icon tone.
- **Shared `trimmedRequiredValidator`** is promoted from
  `verify-email.component.ts` into `src/app/shared/validators/` — a second
  feature (the dialog's current-password field) needs the exact same
  whitespace-only rejection `Validators.required` doesn't provide, so this
  is now the single source rather than a second local copy.
- **AuthService HttpContext tokens** (per `src/app/shared/interceptors/http-context-tokens.ts`,
  OBRS-187 lesson): the initiate call
  (`requestEmailChange`, `POST /api/private/users/me/email/change-request`)
  sets **both** `SKIP_AUTH_LOGOUT` and `SKIP_GLOBAL_ERROR_ALERT` — a
  wrong-current-password response must render inline under the password
  field, not force the user out of their own account settings and not double
  up with a global toast. `confirmEmailChange` (public,
  `POST /api/auth/change-email/confirm`) sets `SKIP_GLOBAL_ERROR_ALERT` only
  — its confirm page renders its own inline state machine (including the
  deliberately neutral "already used/expired" state), so the global toast is
  suppressed the same way `verifyEmail()` already does for the sibling
  `/verify-email` flow. `resendEmailChangeVerification` (authenticated,
  `POST /api/auth/change-email/resend`) does **not** set `SKIP_AUTH_LOGOUT` —
  a genuine 401 there means a dead session, and force-logout is correct (note:
  this endpoint is also under the `/api/auth/` prefix, which
  `auth.interceptor.ts` already exempts from the force-logout path
  entirely — the omission here is belt-and-suspenders, matching
  `resendVerification`'s existing shape rather than a functional change).
- **Old-JWT invalidation on confirm success**: the backend stops honoring the
  pre-change JWT once the email change is confirmed. The confirm page calls
  `authService.clearAuthData()` on the success branch *before* redirecting to
  `/login?reason=email-changed` (+ `&email=` when the backend returns the new
  address), so a stale token in localStorage can't later 401 with a confusing
  toast on some unrelated page.
- **Login banner**: `LoginComponent` now reads `?reason=` / `?email=` on
  init (a new `ActivatedRoute` constructor dependency) and shows
  `LOGIN.EMAIL_CHANGED_BANNER` + prefills the email field when
  `reason=email-changed`. This is the same query-param-driven banner
  mechanism already used for post-login redirects elsewhere in this app,
  applied to a new reason rather than inventing a toast-based alternative.

## Consequences
- A fourth SCSS-declared modal now exists (`change-email-dialog.component.scss`),
  all reusing the same backdrop/close-button/fade-in shape as
  `change-stop-dialog.component.scss` — no visual drift.
- `AuthService.confirmEmailChange` deliberately diverges from the terser
  "confirmPasswordReset shape" (no context tokens at all) that the original
  UX brief called for, by adding `SKIP_GLOBAL_ERROR_ALERT`. Rationale: the
  brief's own state-machine spec for this exact page requires a NEUTRAL,
  non-scary rendering of an expired/used token, which a simultaneous global
  red toast would undercut. `confirmPasswordReset` itself is currently
  unconsumed by any component in this codebase, so there was no existing UI
  precedent to break by adding the token here — this ADR is that
  documentation trail.
- `/account` and `/change-email/confirm` are new routes; both are covered by
  the app-routing spec suite's existing shape (guarded customer route /
  public route) with no new guard logic.
