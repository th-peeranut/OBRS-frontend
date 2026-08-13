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
 * (ROLE_GRANTS, getHomeRoute in auth.service.ts; `canAccessCustomerArea` was
 * deleted by OBRS-1001) — this
 * gates whether a feature is live at all, not who may use it. Always placed
 * AFTER AuthGuard in a route's canActivate array so auth still runs first.
 *
 * Redirect target mirrors AuthGuard's own style (`router.parseUrl(...)`) and goes
 * to home `'/'` (the root route — Home moved off `/home`, see
 * `docs/adr/…-home-route-moved-to-root` precedent), not a 404, so a flagged-off
 * route reads as "not here" rather than "broken".
 */
/**
 * Every key of the `features` block, read off the object itself rather than
 * retyped here (OBRS-1302). The hand-written union this replaced had to be
 * edited in lockstep with `environment.base.ts`, and a flag added without that
 * edit is not a compile error at the flag — it is a compile error at the call
 * site, far from the change, or no error at all if nobody guards on it yet.
 */
export type FeatureFlag = keyof typeof environment.features;

export function featureEnabledGuard(feature: FeatureFlag): CanActivateFn {
  return (): boolean | UrlTree => {
    if (environment.features[feature]) {
      return true;
    }
    return inject(Router).parseUrl('/');
  };
}
