# Code Audit — Security, Performance & Clean Code

**Date:** 2026-06-16
**Scope:** OBRS Frontend, `dev` branch baseline (`origin/dev` @ `b7e0a5e`), reviewed on branch `claude/pensive-ritchie-yre1tt`
**Reviewer:** Automated scheduled audit (Claude Code)
**Build status at audit:** `ng build --configuration production` → exit 0, no errors. Initial bundle 1.33 MB (over 900 kB warning budget, under 1500 kB error budget).
**Test status:** `ng test` NOT run — ChromeHeadless not available in this environment. Manual verification required for test suite.

This document records the findings and the actions taken so the team has a reference for follow-up. Fixes were limited to **low-risk (R2) changes** per the CLAUDE.md §13 AI Action Protocol. Anything touching auth/payment/booking sensitive flows (R0/R1) is **recorded only, not changed** — those require explicit human review.

---

## 1. Actions Taken (applied on this branch)

| # | File | Change | Risk | Category |
|---|------|--------|------|----------|
| A1 | `src/app/modules/otp-validate/otp-validate.component.ts:184` | Removed `console.log(resVerify)` — leaked the OTP/login response **including the access token** to the browser console | R2 | Security (HIGH) |
| A2 | `src/app/modules/otp-validate/otp-validate.component.ts:190` | Removed `console.log(registerValue)` — leaked the registration payload **including the user's plaintext password** and PII to the console | R2 | Security (HIGH) |
| A3 | `src/app/modules/home/components/station-home/station-home.component.ts:78` | Added `noopener,noreferrer` to `window.open(url, '_blank')` to prevent reverse-tabnabbing | R2 | Security (MED) |

These three changes are behavior-preserving and verified against a clean production build.

---

## 2. Security Findings — Recorded for Review (NOT changed)

### HIGH
- **Sensitive console logging (FIXED — A1/A2 above).** The OTP verification flow logged both the auth token and the plaintext registration password to the console. Direct violation of CLAUDE.md §11 ("Never log auth tokens, OTPs, or payment details to the console").

### MEDIUM — payment/booking flows (R0 sensitive — needs human review)
- `console.error('...', error)` passes the full error object to the console in payment, booking and e-ticket flows. May expose payment/booking detail in browser logs. Files:
  - `src/app/modules/payment/components/payment-qrcode/payment-qrcode.component.ts:152, 503`
  - `src/app/modules/payment/components/payment-creditcard/payment-creditcard.component.ts:170, 301`
  - `src/app/modules/payment/components/payment-result/payment-result.component.ts:86`
  - `src/app/modules/passenger-info/passenger-info.component.ts:127`
  - `src/app/modules/e-ticket/e-ticket.component.ts:491`
  - **Recommendation:** log a generic message only (drop the `error` object), or route through a logging service that strips sensitive fields. Not changed here because these are payment/booking sensitive flows (R0) requiring manual review.

### MEDIUM — dependency vulnerabilities (R1)
- `npm audit` reports **83 vulnerabilities: 1 critical, 48 high, 26 moderate, 8 low.** Affected packages include `@angular/*`, `@angular-devkit/build-angular`, `@ngrx/*`, `@babel/plugin-transform-modules-systemjs`.
  - **Recommendation:** schedule a dependency upgrade pass (`npm audit fix`, then targeted majors). This is an R1 change (`package.json`) — requires approval before applying.

### Acceptable / by-design (no action)
- Auth token in `localStorage` (`auth.service.ts`) — documented architecture (CLAUDE.md §11). XSS would still expose it; the console-logging fixes above reduce one exposure vector.
- Registration value (incl. password) in `sessionStorage` — cleared after use; session-scoped.
- Omise key is a **test publishable** key (`pkey_test_…`) — public by design, safe in source.
- No `innerHTML`, `bypassSecurityTrust*`, `eval`, or hardcoded `apiUrl` found.

---

## 3. Clean Code Findings — Recorded for Review (NOT changed)

These are real but either broader-than-R2 or touch sensitive flows. Recorded as a backlog.

### CLAUDE.md convention violations
- **`.toPromise()` usage (7 occurrences), all in `src/app/auth/auth.service.ts`.** Explicitly forbidden by CLAUDE.md §2 ("No `.toPromise()` — services must return `Observable<T>`"). Refactoring auth to Observables is an R0 sensitive-flow change → **flag for manual review**, do not refactor unilaterally.
- **`any` type (~52 non-spec occurrences),** notably `loginWithOtp(): Promise<ResponseAPI<any>>` and `forgetPassword`/`confirmPasswordReset` in `auth.service.ts`. Violates the strict-mode "No `any`" rule. Should be typed against the documented `ResponseAPI<T>` contract.
- **Hardcoded user-facing strings** in `otp-validate.component.ts:207,211` — `alertService.success('succ')` / `alertService.error('error')` bypass `ngx-translate`. Should use translation keys across all three locale files (`en`, `th`, `zh`).

### Performance
- **Missing `trackBy` on `*ngFor`** (~25 instances across shared dropdown components and lists). Causes full DOM re-creation on change detection. Add `trackBy` functions returning stable ids.
- **Function calls in templates** — `dropdown-group-obrs.component.html` calls `getValue()`, `getGroupStations()`, `isGroupedOptions()` in bindings; these re-run every CD cycle. Pre-compute in the component.
- **`AppComponent` subscription not cleaned up** (`app.component.ts:22-24`) — `translate.get('CALENDAR').subscribe(...)` with no `ngOnDestroy`/`takeUntil`. Minor (root component) but violates the project's subscription rule.
- **Subscription reassigned without unsubscribe** — `schedule-booking-list.component.ts:107` reassigns `scheduleList$` without unsubscribing the prior subscription; can leak if invoked repeatedly.
- **CommonJS bailouts** — `dayjs`, `qrcode`, `sweetalert2` flagged as non-ESM, causing optimization bailouts. Consider ESM-compatible imports or the `allowedCommonJsDependencies` config.

### Low
- Commented-out debug logs in `schedule-filter.effect.ts:22`, `schedule-list.effect.ts:24`, `schedule-booking.effect.ts:21` — remove.
- `station-home.component.scss` and several component SCSS files exceed the 3.07 kB per-component budget (warnings only).

---

## 4. Recommended Next Steps (priority order)
1. **Human-review the payment/booking `console.error(error)` calls** (Section 2 MED) and apply the generic-message fix.
2. **Plan a dependency-security upgrade** to clear the 1 critical / 48 high npm audit findings (R1 — needs approval).
3. **Refactor `auth.service.ts`** off `.toPromise()` and `any` toward `Observable<T>` + typed responses (R0 — sensitive, needs review).
4. Add `trackBy` and de-template the dropdown helper functions for CD performance.
5. Fix the `AppComponent` and `schedule-booking-list` subscription cleanup gaps.
6. Replace the hardcoded `'succ'`/`'error'` alert strings with i18n keys (all three locales).

*Items 2–3 and 6 require approval / human review before implementation per CLAUDE.md §9 and §13.*
