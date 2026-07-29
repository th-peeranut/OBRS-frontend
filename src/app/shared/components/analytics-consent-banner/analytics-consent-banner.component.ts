import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { AnalyticsConsentService } from '../../../services/analytics/analytics-consent.service';

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
 * The component holds no state of its own: `AnalyticsConsentService` is the
 * single source of truth, consumed through the async pipe so there is nothing
 * to unsubscribe.
 */
@Component({
  selector: 'app-analytics-consent-banner',
  templateUrl: './analytics-consent-banner.component.html',
  styleUrl: './analytics-consent-banner.component.scss',
})
export class AnalyticsConsentBannerComponent {
  /** True only while the visitor has not answered — i.e. while the bar shows. */
  protected readonly isUndecided$: Observable<boolean>;

  constructor(private readonly consent: AnalyticsConsentService) {
    this.isUndecided$ = this.consent.isUndecided$;
  }

  protected accept(): void {
    this.consent.grant();
  }

  protected decline(): void {
    this.consent.deny();
  }
}
