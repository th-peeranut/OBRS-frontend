# A payment redirect is followed only to an allow-listed host (security review 2026-09, M4)

## Context

Two components hand the browser to another site during payment: the card flow follows
`payment.authorizeUri` when Omise asks for 3-D Secure, and the PromptPay flow follows
`qrPaymentUrl` (the same `authorizeUri`) when the passenger taps "I have paid". Both did it with
a bare `window.location.href = …`.

The value comes from the backend, which relays it from Omise. The frontend cannot prove that
chain was not altered anywhere along the way — a compromised response, a mis-set gateway
account, a future backend change that starts passing through a wallet's own deep link — and the
moment the URL is followed the passenger is off our page, at the point in the journey where they
are most willing to type card details into whatever loads next. The 2026-09 frontend review
rated this Medium (M4) and asked for a host allow-list before the navigation.

## Decision

`isTrustedPaymentRedirect(url)` in `src/app/shared/lib/payment-redirect.ts` is the one
predicate, and both components call it immediately before `navigateToGateway(url)` — the single
method that assigns `window.location.href`, kept as a method so the specs can spy on it. A URL
is followed only when it is

- `https:` (never a scheme handler, never plain http), and
- on exactly `pay.omise.co` (the 3-D Secure and internet-banking authorize pages, and the SIT
  bank-transfer mock) or `api.omise.co` (the older `/payments/{id}/authorize` shape, and the SIT
  PromptPay mock). `host` is compared, so a non-default port is refused too.

A refused URL is treated like a failed payment: an alert is shown, only the refused *origin* is
logged (an Omise authorize URI is a capability URL — whoever holds it can open the page — so the
token-bearing path never reaches the console), and nothing is navigated. The two flows get two
messages because their truth differs: on the card path the charge is still awaiting 3-D Secure,
so `PAYMENT.ALERT.REDIRECT_BLOCKED` may say no money has been taken; on the PromptPay path the
passenger may already have paid by scanning before tapping "I have paid", so
`PAYMENT.ALERT.REDIRECT_BLOCKED_QR` says the payment is still recorded once the bank confirms it
(the Omise webhook does that server-side, independent of this navigation). Both keys exist in
all three locales.

**Why exact hosts and not `*.omise.co`.** The review's own threat model is a tampered or
mis-issued response, and Omise hosts merchant-created checkout pages on its own domain. A suffix
rule would follow a legitimate-looking Omise page that pays a different merchant; an exact set
of the two hosts the system actually produces does not. `netlify.toml` names `https://*.omise.co`
in `frame-src`, but a top-level navigation is not governed by CSP at all — the header protects
what our page loads, not where the browser goes when we send it away.

**Why no same-origin arm.** Nothing produces a same-origin `authorizeUri` (the return URI is
passed *to* Omise, never relayed back), so the list is the two hosts and nothing else.

**Why only the first hop.** 3-D Secure ends on a bank's ACS page that is not on this list. That
hop is made by Omise from its own page, not by us; the allow-list guards the one navigation we
initiate.

## Consequences

- A new payment method whose authorize URL lands on a host other than those two (a wallet deep
  link, a bank app scheme) will be refused until this list is extended — on purpose, in a commit
  that names the host. The backend's mock fixtures for TrueMoney / LINE Pay / ShopeePay already
  return such URLs; those methods are not offered by this frontend today, and the guard is what
  will say so if one is added without this ADR being revisited.
- The predicate is pure and covered by `payment-redirect.spec.ts` (accepted and refused shapes,
  including other `omise.co` hosts, look-alike hosts, ports, userinfo / backslash /
  percent-encoding tricks and non-https schemes). The component specs spy on
  `navigateToGateway` and assert both the accepted and the refused path.
- `auth.service.ts`, `auth.guard.ts` and the interceptors are untouched; this ADR is confined to
  the two payment components and one shared lib file.
