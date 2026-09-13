/**
 * Allow-list for the map links an admin types into a stop/station record and the app later
 * opens with `window.open` (security review 2026-09, FE-5).
 *
 * `window.open` is not run through Angular's URL sanitizer, so whatever an admin saved on the
 * stop is what a visitor's browser is sent to. A `javascript:` URL is inert under `noopener`, but
 * an ordinary `https://` link to a phishing page is not, and a public stop card is a trusted place
 * for one to sit. The link is therefore followed only when it is `https:` on a Google Maps host:
 *
 * - `maps.app.goo.gl` — the share links the Maps app produces;
 * - `goo.gl` — only under `/maps/`: the bare host was Google's general shortener and still
 *   resolves old links to arbitrary destinations, so it is an open redirector on its own;
 * - `maps.google.<tld>` — the classic maps host;
 * - `google.<tld>` / `www.google.<tld>` — only under the `/maps` path.
 *
 * Anything else is refused and the button does nothing; the value stays on the record for an
 * admin to correct.
 */
const SHARE_HOST = 'maps.app.goo.gl';
const SHORTENER_HOST = 'goo.gl';
const MAPS_HOST = /^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/;
const GOOGLE_HOST = /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/;

/** True when `url` may be opened as a "view on map" link. */
export function isTrustedMapsUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return false;
  }
  const host = parsed.host.toLowerCase();
  if (host === SHARE_HOST || MAPS_HOST.test(host)) {
    return true;
  }
  if (host === SHORTENER_HOST) {
    return parsed.pathname.startsWith('/maps/');
  }
  return GOOGLE_HOST.test(host) && parsed.pathname.startsWith('/maps');
}
