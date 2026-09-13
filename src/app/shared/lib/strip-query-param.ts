/**
 * Removes one query parameter from the address bar and the current history entry, without a
 * router navigation (security review 2026-09, FE-2).
 *
 * The three public pages that arrive with a one-time credential in the URL
 * (`/reset-password?token=`, `/verify-email?token=`, `/change-email/confirm?token=`) read the
 * token once, in `ngOnInit`, and never need it in the URL again. Leaving it there keeps a live
 * credential in browser history, in anything that reads `document.location` (extensions,
 * screenshots, a shared screen) and in the referrer of any same-origin navigation.
 *
 * `history.replaceState` rather than `router.navigate([], { queryParams: { token: null } })`:
 * the router form is a real navigation - it re-runs guards and resolvers, re-renders the outlet,
 * and in the component specs it collides with a stubbed `Router.navigate` whose call count the
 * tests assert. The router's own snapshot still carries the token it already handed out; that is
 * in memory, not on screen, and is exactly where the value belongs.
 *
 * A no-op when the parameter is absent (the specs run on a URL with no `token`), and silent when
 * the History API is unavailable.
 */
export function stripQueryParamFromAddressBar(name: string): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(name)) {
      return;
    }
    url.searchParams.delete(name);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch {
    // Not a browser, or a restricted context: nothing to clean.
  }
}
