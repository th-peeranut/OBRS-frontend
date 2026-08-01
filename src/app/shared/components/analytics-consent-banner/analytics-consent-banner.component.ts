import { Component } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { combineLatest, Observable } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';
import { AnalyticsConsentService } from '../../../services/analytics/analytics-consent.service';
import { AnalyticsRouteScopeService } from '../../../services/analytics/analytics-route-scope.service';
import { isConsentControlRoute } from '../../lib/analytics-consent-control';

/**
 * OBRS-867 — the PDPA ask that stands in front of every measurement tag.
 *
 * DESIGN DECISIONS THAT ARE NOT COSMETIC
 *
 * **It is not a modal and it does not block the page.** A visitor who ignores
 * it entirely can still search, book and pay; they simply are not measured.
 * Consent obtained by making the site unusable until you click yes is not
 * consent, and this is a ticket shop, not a consent-harvesting funnel.
 *
 * **Accept and Decline are the same button.** Same size, same weight, same
 * position in the tab order — no faint text link for "no". That symmetry is the
 * difference between an ask and a dark pattern, and it costs us some accept
 * rate on purpose.
 *
 * **Declining is remembered.** `isUndecided$` is false for BOTH answers, so the
 * bar disappears after either one and never nags. (See the service for why
 * `unset` is a distinct third state rather than a synonym for denied.)
 *
 * **It does not ask on staff or admin pages (OBRS-887).** Not as a layout fix —
 * there is nothing there worth asking for. A salesperson cannot consent to
 * Clarity recording a screen full of a *customer's* name and phone number, and
 * measurement of an internal tool would rest on the employment relationship,
 * not on a bar at the bottom of the screen. An ask whose answer changes nothing
 * is worse than no ask. The tags are off there regardless of what is stored
 * here; see {@link AnalyticsService}.
 *
 * It hides only on a route KNOWN to be restricted, never on `unknown` — the
 * privacy property belongs to the tag loader, and a bar that blinks out while
 * the first route resolves would buy nothing for it.
 *
 * **It also stands down on `/privacy-policy` (OBRS-874).** That page carries the
 * full control — grant AND withdraw — so the bar there is the same question
 * asked twice on one screen. Worse, `withdraw` returns the answer to `unset`, so
 * without this the bar would pop up the instant a visitor withdrew, on the very
 * page they withdrew from. Unlike the staff/admin rule this is purely about not
 * asking twice: the page is still measurable and the tags still load there.
 *
 * The component holds no state of its own: `AnalyticsConsentService` is the
 * single source of truth, consumed through the async pipe so there is nothing
 * to unsubscribe.
 */
@Component({
    selector: 'app-analytics-consent-banner',
    templateUrl: './analytics-consent-banner.component.html',
    styleUrl: './analytics-consent-banner.component.scss',
    standalone: false
})
export class AnalyticsConsentBannerComponent {
  /**
   * True only while the visitor has not answered AND this is a page we would
   * actually measure — i.e. exactly while the bar should be on screen.
   */
  protected readonly isUndecided$: Observable<boolean>;

  constructor(
    private readonly consent: AnalyticsConsentService,
    private readonly scope: AnalyticsRouteScopeService,
    private readonly router: Router
  ) {
    // The URL is read from the navigation event rather than from `router.url`
    // after the fact: both this and `AnalyticsRouteScopeService` subscribe to
    // `router.events`, and which one is notified first is an accident of
    // construction order — the same reason the scope service re-reads the live
    // snapshot. `startWith` covers the window before the first navigation.
    const url$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url)
    );

    this.isUndecided$ = combineLatest([
      this.consent.isUndecided$,
      this.scope.isRestricted$,
      url$,
    ]).pipe(
      map(
        ([undecided, restricted, url]) =>
          undecided && !restricted && !isConsentControlRoute(url)
      )
    );
  }

  protected accept(): void {
    this.consent.grant();
  }

  protected decline(): void {
    this.consent.deny();
  }
}
