# ADR-0034 — Analytics provider (GA4 + Microsoft Clarity) and the PDPA consent gate

**Date:** 2026-07-29
**Status:** Accepted
**Card:** OBRS-867 (AC-5 requires the provider choice and its reasoning to be recorded)

---

## Context

Before this change, `grep` for `gtag` / `googletagmanager` / `google-analytics` /
`posthog` / `mixpanel` / `hotjar` / `clarity` / `plausible` / `umami` / `fbq` across
`src/` returned **zero matches**. The only third-party script in `index.html` was Google
Identity Services for the login button. The app measured nothing.

That is only a mild problem while nobody is buying. It stops being mild at go-live:
prod is deployed but `schedules = 0` (OBRS-850), so the first day tickets go on sale is
the first day there are real customers — and **that day's behaviour cannot be collected
retroactively**. Every UX card opened alongside this one (OBRS-860…865) is prioritised
by guesswork without it, and two of them are explicitly blocked on numbers only this
can produce:

- **OBRS-862** — how often does a search return nothing, and on which route/date?
- **OBRS-872** — how many customers reach the forced-registration wall and leave?

The constraint that shapes the rest of this ADR: we must not simply paste a tag in.
There is no cookie-consent mechanism in this app, and PDPA applies. The project already
settled how strict it wants to be about consent — OBRS-628 gates Google sign-in behind a
mandatory checkbox with a real click-swallowing overlay, not a decorative one.

---

## Decision

### 1. GA4 for the funnel, Microsoft Clarity for the reason behind it

**GA4** answers *how many, from where, and where did they drop out*. **Clarity** answers
*why* by replaying the session. They are complements, not alternatives: a funnel chart
tells you 40% abandon at passenger details and cannot tell you it is because the seat
picker does not respond to a tap.

Reasoning, in the order it actually mattered:

| Factor | Verdict |
|---|---|
| **Cost as traffic grows** | Both free at our volume and at ten times it. Clarity is free with no event cap at any volume. This is the factor that eliminated Plausible Cloud (~$9/mo) and self-hosted Umami (needs a server and an owner). |
| **npm dependency** | Neither needs one. `CLAUDE.md` §2 forbids adding a dependency without prior approval; both tags load from a `<script src>` we inject ourselves — which is also what makes refusing to load them possible. |
| **Session replay** | Only Clarity offers it free. In the first week after go-live a recording is worth more than a number, because we will not yet know which numbers to look at. |
| **Data location** | Both are US/global. **This is the real cost of this decision** and it is accepted, not overlooked: it means a cross-border transfer that the privacy policy must disclose and the consent gate must cover. A self-hosted alternative would have avoided it and was rejected on operational cost, not on privacy grounds. |

Rejected: **PostHog** (funnel + replay in one, but the free tier's event cap becomes a
bill precisely when traffic grows, and the JS SDK is an npm dependency);
**Plausible/Umami** (privacy-strongest, and genuinely tempting, but no session replay and
either a subscription or a server to own).

### 2. Consent gates the tag, and consent means an explicit yes

`AnalyticsConsentService` stores the answer under a **versioned** key
(`obrs_analytics_consent_v1`). Three states, not two: `granted`, `denied`, `unset`.
Every failure path — nothing stored, unreadable storage, a corrupted value, a value some
other code wrote — resolves to `unset`, and `unset` sends nothing. There is no code path
that produces `granted` other than the visitor pressing accept.

`AnalyticsTagsService.load()` is the only place a script element is created, and
`AnalyticsService` calls it only from a `filter(granted => granted)` subscription. So the
answer to "could a tag fire before consent?" is not "we checked" — there is no reachable
call.

The version in the key is the migration strategy: when what we ask for changes, the old
answer is simply not found and the banner returns. Carrying an old consent forward to
cover a new purpose is the thing PDPA exists to prevent.

### 3. The banner is an ask, not a dark pattern

Accept and Decline are the same button — same size, same weight, same class-driven
geometry — and **Decline comes first in the DOM**, so it is also first in the tab order.
The banner does not block the page: a visitor who ignores it can search, book and pay,
and is simply not measured. Consent obtained by making a ticket shop unusable until you
say yes is not consent.

A decline is remembered and the banner never asks again.

### 4. A blank ID is a no-op, not a broken tag

`environment.analytics.{ga4MeasurementId,clarityProjectId}` default to `''` in
`environment.base.ts`, exactly like `maptilerKey` (OBRS-424). Blank means no script is
injected at all, which is the path CI, every fresh clone and every local `npm start`
takes — so no developer needs a real property ID to run the app, and no local session
pollutes the production funnel. Neither is on `prod-config-guard.ts`'s refuse-to-boot
list: that guard exists for values whose absence means the bundle cannot take real
money, and a missing measurement ID costs a chart, not a baht.

### 5. Personal data is refused in code, not in a rule

`sanitizeAnalyticsParams` screens every payload after it is assembled and before a
provider sees it: forbidden key names (exact and substring), non-primitive values, and
values whose *shape* is personal under an innocent key (an email, a Thai phone number, a
13-digit national ID). It strips and reports; `AnalyticsService` logs the violations and,
on a non-production build, rethrows so the developer meets the failure immediately. In
production it strips and continues — analytics must never break a checkout.

Two consequences worth stating plainly:

- **`page_view` reports the route pattern, never the URL.** `/otp/sms/0812345678` is a
  real reachable path in this app, and `/reset-password?token=…` a real query string.
  Sending either verbatim would leak through the one parameter nobody thinks of as a
  payload.
- **No `transaction_id` on `booking_completed`.** GA4's `purchase` convention wants one
  for de-duplication; the booking reference is a per-customer ticket identifier and
  AC-4 forbids it. We accept losing GA4's purchase de-duplication for it.

The deny list errs toward blocking: it will also refuse a future `station_name`. A false
positive costs one chart column; a false negative costs a PDPA incident.

---

## Consequences

- Consent must be described accurately in `/privacy-policy` before this goes live with a
  real ID — including the cross-border transfer named above. **Not done in this card.**
- Staff and admin traffic is measured too. It is separable in GA4 (`page_path` starts
  `/admin` or `/staff`) rather than excluded, because excluding it would need a second
  gate that could itself drift.
- Withdrawing consent (`AnalyticsConsentService.reset()`) stops future collection and
  cannot un-send what was already delivered, nor unload an already-injected tag without a
  reload. The tag vendors offer no teardown; a page reload is the honest answer.
- OBRS-867 AC-6 — seeing events arrive in a real dashboard on SIT before prod gets a tag
  — is **not satisfiable from the codebase**. It needs the owner to create the two
  properties and set `GA4_MEASUREMENT_ID` / `CLARITY_PROJECT_ID` on the SIT Netlify site
  (then `PROD_*` on prod). Until then the shipped behaviour is: no tag, no network call,
  no banner cost — and the moment the variables exist, the next deploy starts recording.
