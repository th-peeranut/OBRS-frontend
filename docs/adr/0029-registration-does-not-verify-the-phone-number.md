# ADR-0029 — Registration does not verify the phone number; the signup OTP step is removed

**Date:** 2026-07-21
**Status:** Accepted
**Card:** OBRS-605
**Related:** backend ADR-0008 (phone verification deferred to MFA enrollment), backend
ADR-0083 (Thai msisdn accept-broadly/store-narrowly), OBRS-610, OBRS-613

---

## Context

Backend ADR-0008 decided that signup requires **email verification only**, and explicitly
accepted the consequence that *"a user can store a phone number they do not own"*. The
backend matches that decision: `SignUpReqDto` has no OTP field and `signUp()` verifies
nothing about the phone.

The frontend did not. `/register` stashed the whole form and routed to
`/otp/register/<phone>`, requested a real SMS, and posted the signup only after the OTP
screen saw a 200. Three parties — ADR, backend, frontend — described three different
systems, which is what OBRS-605 was opened to resolve.

The step also did not do what it appeared to do:

- **The signup request carries no OTP proof.** `AuthService.register()` builds a
  `SignUpPayload` of name/email/phone/password/locale/consent. No token, no pin. The
  backend has no field to receive one.
- **Neither route is guarded.** `/register`, `/otp/:option/:phoneno` and
  `POST /api/auth/signup` are all reachable directly. Skipping the screen required no
  more than not visiting it.
- **The frontend read the wrong signal.** `otp-validate` branched on our own envelope
  `code === 200`, and `OtpController.verifyOtp` returns 200 for every vendor outcome. The
  vendor's `status` field was never inspected. So even for a user who did follow the UI,
  a rejected PIN was not reliably distinguishable from an accepted one. (What ThaiBulkSMS
  returns for a wrong PIN is still unconfirmed — see Not addressed.)
- **It cost money.** `/external/otp/request` is public and unauthenticated; every signup
  attempt, including abandoned ones, billed an SMS for a check with no effect.

So the step was friction with a price tag, not a control.

---

## Decision

**Registration does not verify the phone number.** The frontend now conforms to ADR-0008
rather than contradicting it.

- `RegisterComponent.register()` posts `POST /api/auth/signup` directly and, on 201, swaps
  the form for the "we emailed you a verification link" panel that used to live on the OTP
  screen.
- `'register'` is removed from `otp-validate`'s accepted options.
  `/otp/register/<phone>` now fails `validateRouteError()` and redirects to `/`.
- `ngOnInit` returns after that redirect. It previously fell through to `sendOtp()`, so a
  rejected route still billed an SMS — harmless while every route was accepted, not
  harmless the moment one is not.
- `setRegisterValue` / `getRegisterValue` / `clearRegisterValue` and the `register_value`
  sessionStorage entry are deleted. They existed only to carry the form across the OTP
  screen, and they held the **plaintext password** for as long as that screen was open.

ADR-0008 is **not** superseded. Its decision was already the one we want; only the
frontend disagreed with it.

---

## Consequences

- A user can register with a phone number they do not own. This is ADR-0008's accepted
  risk, now accepted honestly instead of behind a step that did not enforce it.
- The phone number remains a delivery address, not an identity claim. Anything that later
  needs to trust it must verify it at that point.
- `is_phone_number_verify` stays write-only. OBRS-610's amendment to ADR-0008 recorded
  that nothing reads it and that the MFA enrollment ADR-0008 defers to does not exist.
- `THAI_MOBILE_PATTERN` on the register form stays. Its justification changes from "the
  OTP request rejects non-mobiles" to "the column stores a Thai mobile" (OBRS-136 /
  backend ADR-0079); the validation is still correct, only the failure it prevents moved.
- `otp-validate` now serves `login` and `forget-password`. OBRS-613 removes the second
  (its branch is an empty block — verifying a PIN there does nothing at all), after which
  this screen serves phone login only.

---

## Not addressed here

- **What ThaiBulkSMS returns for a wrong or expired PIN is still unconfirmed.** The
  developer reference renders empty, the v2 PDF is not extractable, and the npm mirror
  403s. It no longer affects signup — signup does not consult the OTP at all — but it
  still decides whether `OtpController.verifyOtp` returning 200 unconditionally is a live
  hole or merely a weak contract. Settling it needs a real send on SIT.
- **`OtpController.verifyOtp` still has no test coverage and still ignores the verify
  result.** With `register` gone, its only remaining caller is the `forget-password`
  branch that OBRS-613 deletes. Once that lands the endpoint has no frontend caller at
  all, and the honest options are to make it reflect the vendor's status or to remove it
  — decided on that card, not this one.
- **Phone enumeration.** Unchanged and out of scope; see OBRS-610.
