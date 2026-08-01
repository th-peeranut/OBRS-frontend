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

### 6. Staff and admin routes are not measured at all (OBRS-887 — supersedes a decision made here)

**This section reverses a bullet that was in Consequences below.** It read:

> Staff and admin traffic is measured too. It is separable in GA4 (`page_path` starts
> `/admin` or `/staff`) rather than excluded, because excluding it would need a second
> gate that could itself drift.

Both halves of that reasoning fail, and it is worth recording why rather than just
deleting it — the same argument will be offered again for the next vendor.

**"Separable in GA4" answers the wrong question.** It is true, and it is about
*attribution*: which numbers belong to customers. The problem is not attribution. Clarity
does session **replay** — it uploads what was on the screen — and a POS or admin screen is
full of passenger names, phone numbers, bookings and receipts. Being able to filter those
recordings out of a report afterwards does not unsend them. §1 chose Clarity precisely
*because* it records rather than counts, so the property that makes it valuable on a
customer page is the property that makes it unacceptable on a staff one.

**Consent cannot be obtained from the person at the keyboard.** A salesperson pressing
accept consents for themselves. The data subject in the recording is the customer standing
at the counter, who is not present in the interaction and cannot be asked. Nothing in §2's
gate — which is sound for the visitor measuring their own session — supplies a basis for
that. Separately, measurement of an internal work tool would rest on the employment
relationship, not on consent at all; an ask whose answer changes nothing is a worse
artefact than no ask.

**"A second gate that could itself drift" — the drift concern is real and is answered by
which marker the gate reads.** The gate is a denylist on `data.requiredRoles`, the same
marker `AuthGuard` enforces access control with. A new staff page that forgot it would be
publicly reachable, and `nav-reachability.spec.ts` already fails on exactly that drift. So
the gate cannot rot quietly in the dangerous direction; it can only rot in the direction of
a *customer* page accidentally declaring roles, which measures less, not more.

Not an allowlist on `customerArea`, for the symmetric reason: `/login`, `/register`,
`/otp/:option/:phoneno`, `/forget-password`, `/reset-password`, `/verify-email` and
`/change-email/confirm` do **not** carry it. Gating on it would switch analytics off across
the whole sign-up funnel — the funnel OBRS-862 and OBRS-872 are blocked on — and nothing
would report that it had.

Shape, because "don't send events" is not enough on its own:

1. `AnalyticsTagsService.load()` is not called while the route is restricted — and not
   called before ANY route has resolved either. The `unknown` window is where a deep link
   to `/staff/sell` lands, carrying a `granted` answer from a previous visit.
2. Navigating from a customer page into a staff page suspends the already-loaded tags at
   the vendor (`clarity('stop')`, `window['ga-disable-<id>']`). This is the common path,
   and §2's loader could never have covered it: there is no teardown for either script.
3. `track()` drops every event on a restricted route, `page_view` included. A single admin
   path is not personal data; a stream of them describes how a named employee spent a
   shift.
4. The banner does not render there. That is a consequence of having nothing to ask for,
   not a layout fix — OBRS-878 already solved the covered button.

If staff-usage numbers are wanted later, the answer is GA4 only, under a notice in the
staff handbook, never Clarity. That is a new decision, not this one.

### 7. The banner says "we record your screen", because we do (OBRS-874 — corrects §3's copy)

`ANALYTICS_CONSENT.BODY` used to open with *"we collect anonymous usage data only"*. The
second half of that sentence — name, phone, email and seat number are never sent — is true
and is enforced by `sanitizeAnalyticsParams` plus 104 specs. The first half was not: §1
bought Clarity **for** session replay, and a reader of "usage statistics" does not conclude
that someone can watch where their mouse went.

This is OBRS-631 AC-14's rule arriving on a different surface. That AC forbids the word
*anonymised* anywhere a `booking_id` still joins back to a name; the same standard applied
to a banner forbids *anonymous* where a recording exists. A consent obtained by a
description narrower than the processing is defective at the moment it is given, however
well the policy page is written afterwards — the banner is what the customer actually read.

So the copy now names the recording (mouse movement, clicks, scrolling) in all three
languages, and OBRS-631 §3 declares the same category in the notice. **The two must be
compared sentence by sentence whenever either changes**; they are the same promise written
twice, and the version that is easier to edit is the one that will drift.

The owner's decision on 2026-08-01 was to keep Clarity and describe it honestly, rather
than drop it and keep the old wording — the alternative that was on the table. Replay is
the only tool that answers *why* a customer dropped out, which is the question that bought
this ADR its two vendors.

### 8. Withdrawal needs a surface, not only a method (OBRS-874)

§2 shipped `AnalyticsConsentService.reset()` and nothing called it. PDPA ม.19 วรรคห้า says
withdrawing must be as easy as consenting was; a method reachable only from devtools is not
that, and OBRS-631 could not publish a notice declaring the right while the app could not
perform it (the OBRS-627 defect, spelled differently).

The control lives on `/privacy-policy` — the page the banner already links to — and it
states the current answer even when there is none, because a control that appears only
after consent is a control nobody can find. Withdrawing returns the answer to `unset`, not
to `denied`: a withdrawal removes consent, it does not record a refusal on the visitor's
behalf. The visible consequence is that the control goes back to offering "accept", which
is honest — that IS the state.

The bar stands down on that one route (`shared/lib/analytics-consent-control.ts`). Unlike
§6 this is not a privacy rule and does not stop the tags loading there: it is that
withdrawing would otherwise make the bar appear the instant the button was pressed, on the
page it was pressed on, which reads as the site ignoring the request.

---

## Consequences

- Consent must be described accurately in `/privacy-policy` before this goes live with a
  real ID — including the cross-border transfer named above. **Not done in this card.**
- ~~Staff and admin traffic is measured too. It is separable in GA4 (`page_path` starts
  `/admin` or `/staff`) rather than excluded, because excluding it would need a second
  gate that could itself drift.~~ **Superseded by §6 (OBRS-887).** Struck through rather
  than deleted: this is the argument to answer, not to forget. Staff and admin traffic is
  now not collected at all — GA4 will show no `/admin` or `/staff` rows, and their absence
  is the intended state, not a broken tag.
- Withdrawing consent stops future collection and cannot un-send what was already
  delivered. ~~Nor unload an already-injected tag without a reload; a page reload is the
  honest answer.~~ **Corrected by OBRS-874, using OBRS-887's machinery.** The tag element
  does stay in the document — there is still no teardown — but collection stops in the same
  tick via `setSuspended(true)` (`window['ga-disable-<id>']`, `clarity('stop')`), and on the
  next load the scripts are not injected at all. The strike-through matters: the customer
  copy on `/privacy-policy` promises "immediately, with no need to reload", and it may only
  say that while both halves above hold.
- OBRS-867 AC-6 — seeing events arrive in a real dashboard on SIT before prod gets a tag
  — is **not satisfiable from the codebase**. It needs the owner to create the two
  properties and set `GA4_MEASUREMENT_ID` / `CLARITY_PROJECT_ID` on the SIT Netlify site
  (then `PROD_*` on prod). Until then the shipped behaviour is: no tag, no network call,
  no banner cost — and the moment the variables exist, the next deploy starts recording.
