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
 * WHY THE NUMBER IS BEHIND A CLICK (owner's call, 2026-08-19). It is a personal
 * mobile, not a switchboard, and a bare `tel:` on a public page is a free
 * harvest for anyone crawling for numbers. So it is assembled at runtime from
 * {@link PARTS} and reaches the DOM only after a deliberate click.
 *
 * Be honest about what that buys: it keeps the number out of the served HTML,
 * out of the three i18n bundles, and out of a plain-text search of the JS
 * bundle. It does NOT hide it from anyone who runs the page's JavaScript and
 * clicks, or who reads {@link PARTS} in the source. It raises the cost of bulk
 * harvesting; it is not secrecy. The cost paid for it is one extra tap for a
 * real customer, and nothing at all for a visitor with JavaScript disabled.
 */
@Component({
  selector: 'app-charter-cta',
  templateUrl: './charter-cta.component.html',
  styleUrl: './charter-cta.component.scss',
  imports: [TranslateModule],
})
export class CharterCtaComponent {
  /**
   * Split so the number never exists as one searchable literal anywhere in the
   * repo or the shipped bundle. Joining it is the whole of {@link reveal}.
   */
  private static readonly PARTS: readonly string[] = ['081', '428', '4492'];

  protected revealed = false;
  /** "081-428-4492" — empty until the visitor asks for it. */
  protected displayNumber = '';
  /** "tel:0814284492" — empty until the visitor asks for it. */
  protected telHref = '';

  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * Reveals the number and records the lead.
   *
   * The event sits HERE and not on the `tel:` link, because this click is the
   * one step every interested visitor takes. A desktop visitor reads the number
   * and dials a desk phone; someone else photographs it. Measuring the `tel:`
   * tap instead would count only the phone-shaped half of the demand, and
   * phase 0 keeps no other record anywhere in the system to correct it with.
   *
   * Deliberately carries no phone number in the payload: `analytics-pii-guard`
   * refuses a Thai-phone-shaped value and would throw on a dev build — and the
   * number is a constant, so it would measure nothing.
   */
  reveal(): void {
    this.displayNumber = CharterCtaComponent.PARTS.join('-');
    this.telHref = `tel:${CharterCtaComponent.PARTS.join('')}`;
    this.revealed = true;

    this.analytics.track('charter_phone_revealed', { placement: 'home' });
  }
}
