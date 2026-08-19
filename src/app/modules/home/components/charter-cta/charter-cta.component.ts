import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { AnalyticsService } from '../../../../services/analytics/analytics.service';

/**
 * OBRS-380 Phase 0 — the charter ("เหมาคัน") offer, as a phone number and
 * nothing else.
 *
 * The shape is not a shortcut, it is the only shape allowed. A charter takes a
 * bus OFF its scheduled route, and the affiliate contract `E-51-29` ข้อ 8
 * requires บขส.'s **written** permission three days ahead before that may
 * happen; a "book it now" button on this page would be selling something the
 * operator cannot promise. So: no booking flow, no state, no request — the
 * quote conversation happens on the phone, where a human can check the bus and
 * the permission first. (Constraint written up in the obrs-agent-office repo,
 * `docs/regulatory/LAND-TRANSPORT-ACT-SERVICE-CONSTRAINTS.md` §5.)
 *
 * The one thing this component does own is `charter_call_click`. Without it a
 * lead leaves no trace anywhere in the system — there is no booking row, no
 * enquiry record, nothing — and "did anyone actually want this?" would have no
 * answer at all when Phase 1 is costed.
 */
@Component({
  selector: 'app-charter-cta',
  templateUrl: './charter-cta.component.html',
  styleUrl: './charter-cta.component.scss',
  imports: [TranslateModule],
})
export class CharterCtaComponent {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * Fires on the tap, not on the call. The browser hands `tel:` to the dialer
   * and the page never learns whether the customer pressed the green button, so
   * this counts *intent to call* — read it that way in GA4.
   *
   * Deliberately carries no phone number: `analytics-pii-guard` refuses a
   * Thai-phone-shaped value and would throw on a dev build, and the number is
   * a constant anyway — it would measure nothing.
   */
  onCallClick(): void {
    this.analytics.track('charter_call_click', { placement: 'home' });
  }
}
