# ADR-0030 — Password reset is an emailed-token flow; the phone-OTP entry point is removed

**Date:** 2026-07-21
**Status:** Accepted
**Card:** OBRS-613
**Related:** OBRS-9 (backend password reset), ADR-0029 / OBRS-605, OBRS-610

---

## Context

The backend has had a complete email-token password reset since OBRS-9 — Done, closed,
and unreachable. `POST /api/auth/password-reset/request` issues a single-use UUID token
with an expiry, invalidates any earlier ones, emails a link, and
`POST /api/auth/password-reset/confirm` consumes it. A scheduler sweeps expired tokens.

Nothing in the frontend ever called it. What shipped instead:

- The only "forgot password?" link in the product (`login.component.html:110`) went to
  `/forget-password`, which asked for a **phone number** and routed to
  `/otp/forget-password/<phone>`.
- A real SMS was sent, and entering the correct PIN ran this:
  ```ts
  if (this.option === 'forget-password') {
    // const res = await this.service.forgetPassword(payload);
  }
  ```
  An empty block. No navigation, no message, no request. The user sat on the OTP screen
  with a correct code and nothing to do.
- `forgetPassword()` and `confirmPasswordReset()` existed in `AuthService`, fully written,
  with **zero callers** across `src/` and `e2e/` — the only mention was the commented-out
  line above.
- `EmailService` builds its link from `app.mail.reset-password-path`, i.e.
  `${app.frontend-url}/reset-password?token=`. **No `reset-password` route existed.** Even
  if the email had been triggered, the link would have matched
  `{ path: '**', redirectTo: '/' }` and dropped the user on the home page.

A user who forgot their password could not recover their account by any route. No card
covered it; OBRS-9 was backend-scoped and nothing on the frontend ever picked it up.

## Decision

**Password reset is an emailed-token flow, and the frontend implements the one the
backend already offers.**

- `/forget-password` collects an **email** and calls `POST /password-reset/request`.
- A new public route `/reset-password` reads `?token=` and calls
  `POST /password-reset/confirm` with the new password.
- The `forget-password` option is removed from `otp-validate`, which now serves phone
  **login** only. Together with ADR-0029 that leaves the screen with a single purpose.

Three details are load-bearing rather than incidental:

**The confirmation panel is shown for every submitted address, unconditionally.**
`PasswordResetService.requestPasswordReset` returns the same message whether or not the
address belongs to an account, specifically so the endpoint cannot be used to enumerate
registered emails. Branching on the response in the UI would rebuild that oracle exactly
where an attacker can reach it. The panel is therefore shown even when the request throws.

**The `/reset-password` path is not free to rename.** It is one half of a contract whose
other half lives in `application.yml`. This is the same shape of gap the card fixes, so it
is written into the route as a comment rather than left to be rediscovered.

**The empty-token guard lives in the component, not the template.** The form is hidden in
the `noToken` state, but a rendering decision is not an access control; the check sits in
`submit()` so an empty token cannot be posted. A test asserted this before the guard
existed and failed — the template alone had been doing the work.

## Consequences

- Password recovery works end to end for the first time.
- Reset no longer costs an SMS. It never should have: the code was verified and discarded.
- `RESET_PASSWORD_PATTERN` duplicates the server's `PasswordResetEmailConfirmReqDto`
  regex. Deliberate, and one-directional: the server still enforces it, the copy only
  spares a round trip, and if the two drift the server wins.
- `otp-validate` serves one option. If phone login is ever retired, the whole screen and
  `OtpService.verifyOTP` go with it.
- `FORGET_PASSWORD.PHONE_NO*` / `SEND_OTP` keys are removed from all three locales;
  `RESET_PASSWORD.*` is added to all three.

## Not addressed here

- **`OtpController.verifyOtp` now has no frontend caller at all.** OBRS-605 removed the
  `register` option and this card removed `forget-password`; phone login goes through
  `/auth/login/otp` instead. The endpoint still returns 200 for every vendor outcome and
  still has no test coverage (OBRS-605). It should either reflect the vendor's status or
  be removed — but "no frontend caller" is not by itself proof it is dead, so that needs
  its own look before anything is deleted.
- **Rate limiting on `/password-reset/request` is the shared IP lockout only.** An address
  can be asked for repeatedly from different IPs; each request invalidates the previous
  token, so the ceiling is email volume, not account takeover.
- No SIT end-to-end run. Verified against mocked responses in a real browser; the actual
  email delivery and link round trip have not been exercised.
