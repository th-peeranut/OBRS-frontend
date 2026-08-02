/**
 * OBRS-874 — where the full consent control lives, in one place.
 *
 * The privacy policy page carries a control that can BOTH grant and withdraw
 * (`AnalyticsConsentControlComponent`). While the visitor is standing on it, the
 * fixed bar at the bottom of the screen is not a second chance to ask — it is
 * the same question twice on one screen, and it appears the instant a withdrawal
 * lands, which reads as "the site ignored me".
 *
 * So the banner hides here, and only here. This is NOT the staff/admin rule in
 * `analytics-route-scope.ts`: that one is about pages we may not MEASURE, and it
 * also stops the tags from loading. This one is purely about not asking twice —
 * measurement on this page is fine, and a visitor who never opens the policy
 * page still meets the bar everywhere else.
 */
export const ANALYTICS_CONSENT_CONTROL_ROUTE = '/privacy-policy';

/**
 * `true` when `url` is the page that owns the full consent control.
 *
 * Compares the path only. `Router.url` carries query string and fragment
 * (`/privacy-policy?lang=th#rights`), and a plain `===` against the whole thing
 * would put the bar back on exactly the deep link the policy page uses for its
 * own sections.
 */
export function isConsentControlRoute(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  const path = url.split(/[?#]/)[0].replace(/\/+$/, '');
  return (path === '' ? '/' : path) === ANALYTICS_CONSENT_CONTROL_ROUTE;
}
