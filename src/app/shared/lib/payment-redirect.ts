/**
 * Host allow-list for the one place the app hands the browser to another site: the payment
 * gateway's `authorizeUri` (security review 2026-09, M4).
 *
 * The URL comes from the backend, which relays it from Omise. Nothing on this side can prove
 * it was not altered somewhere along that path, and the moment it is followed the customer is
 * off our page — during payment, when they trust what they see the most. So before
 * `window.location.href` is assigned, the URL must be `https:` on one of exactly two hosts:
 *
 * - `pay.omise.co` — the 3-D Secure and internet-banking authorize pages (and the SIT
 *   bank-transfer mock);
 * - `api.omise.co` — the older `/payments/{id}/authorize` shape (and the SIT PromptPay mock).
 *
 * Exact hosts, not `*.omise.co`: Omise also hosts merchant-created checkout pages on its own
 * domain (payment links), so a suffix rule would let a legitimate-looking Omise page that pays
 * someone else through. A non-default port is refused for the same reason (`host`, not
 * `hostname`, is compared). Adding a payment method whose authorize URL lands elsewhere means
 * extending this set on purpose, in a commit that says so — not widening the check. See
 * `docs/adr/0044-payment-redirect-allowlist.md`.
 */

const TRUSTED_GATEWAY_HOSTS: ReadonlySet<string> = new Set(['pay.omise.co', 'api.omise.co']);

/** True when `url` may be followed as a payment redirect. */
export function isTrustedPaymentRedirect(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  let parsed: URL;
  try {
    // No base: a relative or scheme-less value is not a gateway URL and must not be
    // resolved into one against the current page.
    parsed = new URL(url);
  } catch {
    return false;
  }

  return parsed.protocol === 'https:' && TRUSTED_GATEWAY_HOSTS.has(parsed.host.toLowerCase());
}

/**
 * The part of a refused URL that is safe to log: an Omise authorize URI is a capability URL
 * (whoever holds it can open the page), so support gets the host that was refused, not the
 * token that would have opened it.
 */
export function paymentRedirectOriginForLog(url: string | null | undefined): string {
  if (!url) {
    return '(empty)';
  }
  try {
    return new URL(url).origin;
  } catch {
    return '(unparseable)';
  }
}
