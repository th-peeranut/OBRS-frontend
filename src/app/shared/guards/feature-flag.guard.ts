import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { environment } from '../../../environments/environment';

/**
 * OBRS-622 go-live scope cut — a reversible per-feature entry gate.
 *
 * Each flag lives once, in `environment.base.ts`'s `features` block (see the
 * comment there); every `environment.*.ts` inherits it via the `...environmentBase`
 * spread, so flipping a flag back to `true` re-enables the feature everywhere with
 * a single value change — no branch to revert, no code to restore.
 *
 * Deliberately a SEPARATE guard from AuthGuard/the area-based access model
 * (ROLE_GRANTS, canAccessCustomerArea, getHomeRoute in auth.service.ts) — this
 * gates whether a feature is live at all, not who may use it. Always placed
 * AFTER AuthGuard in a route's canActivate array so auth still runs first.
 *
 * Redirect target mirrors AuthGuard's own style (`router.parseUrl(...)`) and goes
 * to home `'/'` (the root route — Home moved off `/home`, see
 * `docs/adr/…-home-route-moved-to-root` precedent), not a 404, so a flagged-off
 * route reads as "not here" rather than "broken".
 */
export function featureEnabledGuard(feature: 'onlineParcelBooking' | 'fleetMap'): CanActivateFn {
  return (): boolean | UrlTree => {
    if (environment.features[feature]) {
      return true;
    }
    return inject(Router).parseUrl('/');
  };
}
