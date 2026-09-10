import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { isOnlineTicketBookingOpen } from '../lib/online-booking-channel';

/**
 * OBRS-1583 — the route half of the online-booking gate.
 *
 * Exists instead of `featureEnabledGuard('onlineTicketBooking')` because that
 * guard is generic: it also gates `onlineParcelBooking` and `fleetMap`, and
 * teaching it about roles would hand the same staff-preview exception to flags
 * that never asked for one. The flag/role decision itself is NOT duplicated
 * here — {@link isOnlineTicketBookingOpen} is the single predicate, shared with
 * the notice banner and the trip list so all three can never disagree.
 *
 * Redirect target and placement match `featureEnabledGuard`: `parseUrl('/')`
 * rather than a 404 (a closed route reads as "not here", not "broken"), and
 * always AFTER AuthGuard in a route's `canActivate` array so auth runs first.
 *
 * TEMPORARY only in its role arm — when `onlineTicketBooking` is permanently
 * true this collapses back into `featureEnabledGuard('onlineTicketBooking')`.
 */
export const onlineTicketBookingGuard: CanActivateFn = (): boolean | UrlTree => {
  if (isOnlineTicketBookingOpen(inject(AuthService))) {
    return true;
  }
  return inject(Router).parseUrl('/');
};
