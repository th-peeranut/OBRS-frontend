import { ActivatedRouteSnapshot } from '@angular/router';

/**
 * OBRS-887 — the one place that decides whether a route may be measured.
 *
 * WHY THIS IS A DENYLIST ON `requiredRoles` AND NOT AN ALLOWLIST ON `customerArea`
 *
 * Both markers already exist in `app-routing.module.ts`, and picking the wrong
 * one fails silently in opposite directions:
 *
 * - `customerArea: true` is NOT carried by `/login`, `/register`,
 *   `/otp/:option/:phoneno`, `/forget-password`, `/reset-password`,
 *   `/verify-email` or `/change-email/confirm`. Gating on it would switch
 *   analytics off across the entire sign-up funnel — the funnel OBRS-862 and
 *   OBRS-872 are blocked on measuring — and nothing would report that it had.
 *   An allowlist fails closed, which sounds safe and here means "silently stops
 *   answering the question we bought the tags for".
 * - `requiredRoles` is carried by exactly two shells, `/admin` and `/staff`,
 *   and by their children. A census of the repo (2026-07-30) found it in
 *   `app-routing.module.ts`, `admin.module.ts`, `staff.module.ts` and
 *   `system-settings-tabs.ts` and on NO customer route. A new staff page that
 *   forgets it would also be unguarded by `AuthGuard`, so the marker cannot rot
 *   quietly — `nav-reachability.spec.ts` already fails on that drift.
 *
 * So: a route is restricted when ANY node of the activated tree declares
 * `requiredRoles`, and measurable otherwise. New customer routes are measured
 * by default, which is the direction we want to be wrong in.
 */

/** Reads `requiredRoles` off one snapshot node without trusting the prototype. */
function declaresRequiredRoles(node: ActivatedRouteSnapshot): boolean {
  const data = node.data as Record<string, unknown> | undefined;
  if (!data || !Object.prototype.hasOwnProperty.call(data, 'requiredRoles')) {
    return false;
  }

  const roles = data['requiredRoles'];
  return Array.isArray(roles) && roles.length > 0;
}

/**
 * The children of one snapshot node.
 *
 * Prefers `children` over `firstChild` deliberately: a named outlet branches
 * the tree, and a walk that only ever took `firstChild` would read a staff page
 * sitting in a secondary outlet as measurable. `firstChild` is the fallback for
 * snapshot-shaped test doubles that only build the primary chain.
 */
function childrenOf(node: ActivatedRouteSnapshot): ActivatedRouteSnapshot[] {
  if (Array.isArray(node.children) && node.children.length > 0) {
    return node.children;
  }

  return node.firstChild ? [node.firstChild] : [];
}

/**
 * `true` when the activated route belongs to the staff or admin portal, i.e.
 * when nothing about this page may be sent to a third party.
 *
 * An empty/unresolved snapshot answers `false` — "this is not a staff page" is
 * all this function claims. Whether a route has resolved *at all* is a separate
 * question, and {@link AnalyticsRouteScopeService} is where it is answered; the
 * tag loader needs that distinction and this predicate must not smuggle it in.
 */
export function isRestrictedRoute(
  root: ActivatedRouteSnapshot | null | undefined
): boolean {
  const queue: ActivatedRouteSnapshot[] = root ? [root] : [];

  while (queue.length > 0) {
    const node = queue.shift() as ActivatedRouteSnapshot;
    if (declaresRequiredRoles(node)) {
      return true;
    }
    queue.push(...childrenOf(node));
  }

  return false;
}
