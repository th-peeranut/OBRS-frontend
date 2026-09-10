import { Component } from '@angular/core';
import { map, Observable } from 'rxjs';
import { AuthService } from '../../../auth/auth.service';
import { AnalyticsRouteScopeService } from '../../../services/analytics/analytics-route-scope.service';
import {
  isOnlineTicketBookingOpen,
  NJ_FACEBOOK_PAGE_URL,
} from '../../lib/online-booking-channel';

/**
 * OBRS-1302 — the notice that stands in for the booking button while online
 * booking is closed.
 *
 * DESIGN DECISIONS THAT ARE NOT COSMETIC
 *
 * **It is in normal document flow, not fixed, and it is rendered ABOVE the
 * router outlet.** A fixed bar would have to win a z-index argument with the
 * PDPA consent bar (fixed, bottom, z-index 1000, OBRS-867/1179) and with the
 * usability FAB (900), and an element that floats over the page is one that can
 * sit on top of a button — which is exactly how a banner turned
 * `npm run e2e:gate` red once already (OBRS-882). In flow it cannot overlap
 * anything, and it costs only that the notice scrolls away. That cost is paid
 * for separately: the trip list replaces its own "choose this trip" button with
 * the same call to action, so the answer is present at the moment of intent as
 * well as on arrival.
 *
 * **It is not a modal and it blocks nothing.** OBRS-642 had just been closed for
 * being an overlay in the way; repeating that here would trade one complaint for
 * the same complaint.
 *
 * **It disappears entirely when the flag is on** — not hidden by CSS. The two
 * arms of `isVisible$` are what the spec asserts in both directions: with
 * `features.onlineTicketBooking` true the host renders no banner element at all,
 * so a reopened site carries no trace of the close.
 *
 * **Never on staff or admin pages.** Staff are not the audience — they are the
 * people the closure is waiting for — and `/staff/sell` must keep reading as a
 * working till. The staff/admin test is `isRestrictedRoute`, the repo's single
 * definition of "portal page" (`shared/lib/analytics-route-scope.ts`), reached
 * through {@link AnalyticsRouteScopeService}. It is named for analytics because
 * that is what first needed it; the predicate itself is about route shape
 * (`requiredRoles`), not measurement.
 *
 * **It waits for `measurable` rather than merely "not restricted".** That is the
 * opposite choice from the consent bar, deliberately. The consent bar shows
 * during the pre-first-navigation `unknown` window because hiding it there buys
 * no privacy; here the same window is a staff member's deep link to
 * `/staff/sell`, and showing a customer notice on their screen — even for one
 * frame — is the thing AC-6 forbids. Erring towards showing nothing costs a
 * frame of a strip that was never urgent.
 */
@Component({
  selector: 'app-booking-closed-notice',
  templateUrl: './booking-closed-notice.component.html',
  styleUrl: './booking-closed-notice.component.scss',
  standalone: false,
})
export class BookingClosedNoticeComponent {
  /** True only on a resolved customer-side route while booking is closed. */
  protected readonly isVisible$: Observable<boolean>;

  /** Bound into the template so the URL is never spelled twice. */
  protected readonly facebookUrl = NJ_FACEBOOK_PAGE_URL;

  constructor(
    private readonly scope: AnalyticsRouteScopeService,
    private readonly auth: AuthService
  ) {
    this.isVisible$ = this.scope.isMeasurable$.pipe(
      // `isOnlineTicketBookingOpen()` is called inside the pipe, not captured
      // outside it, so a spec that flips the flag between arms re-reads it.
      map((onCustomerPage) => onCustomerPage && !isOnlineTicketBookingOpen(this.auth))
    );
  }
}
