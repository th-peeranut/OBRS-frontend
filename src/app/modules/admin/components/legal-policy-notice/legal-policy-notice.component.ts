import { Component, Input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { OwnerCancelReschedulePolicyDto } from '../../../../services/admin/admin-api.service';
import { formatMoney } from '../../../../shared/lib/money-display';

/**
 * OBRS-1434 AC-4 — the standing notice that the cancel/reschedule money rules are
 * stricter than BKS shared-bus regulation 2547 clauses 78/79 allow, and that this is
 * a DECISION (owner, 2026-08-19, option ข) rather than a misconfiguration.
 *
 * <p>One component, two renderings, because the values it talks about and the page the
 * owner lands on are not the same page: `booking-policy` is first in the
 * `SALES_POLICY` group and holds none of these numbers, so it gets the compact box
 * whose whole job is to point (AC-4.2/AC-4.4); `cancel-reschedule-policy` holds all of
 * them and gets the full box above the fields (AC-4.1). Two components would be two
 * copies of the same sentence, free to drift — the reason AC-4.6 asks for one message
 * set.
 *
 * <p>The numbers in the full box are the LIVE config, not the platform defaults spelt
 * into the translation. The box sits directly above the inputs that set them, so a
 * fixed "20% / 50%" would start lying the moment an owner saved anything else — and
 * the mock the owner approved says the same ("ไม่ได้พิมพ์ค่าซ้ำแบบ hardcode ถ้าอ่านจาก
 * config ได้จริง"). The regulation's own figures (10%, 1 hour, clause 97's penalty)
 * ARE fixed and stay in the string.
 *
 * <p>Deliberately has NO dismiss control (AC-4.5): dismissed once and gone forever is
 * the state this card exists to leave, and a remembered dismissal would need the owner
 * to say how long it lasts.
 *
 * <p>OBRS-1720 will collapse `/admin/settings` into one scrolling document with no tab
 * strip, at which point the two SALES_POLICY pages become two sections of one page:
 * keep the FULL box, drop the compact one, and `cancelPolicyLink` becomes an in-page
 * anchor instead of a route. Nothing else about this component has to change — which
 * is why the two renderings differ by an input rather than by a file.
 */
@Component({
  selector: 'app-legal-policy-notice',
  templateUrl: './legal-policy-notice.component.html',
  styleUrl: './legal-policy-notice.component.scss',
  standalone: false,
})
export class LegalPolicyNoticeComponent {
  constructor(private readonly translate: TranslateService) {}

  /** True on a page that does not hold the values — render the pointer, not the detail. */
  @Input() compact = false;

  /** The live policy, for the detail line. Absent on the compact rendering. */
  @Input() policy: OwnerCancelReschedulePolicyDto | null = null;

  /** The deduction the customer feels, from the refund rate the API speaks in. The fee
   * goes through `formatMoney` and the unit stays out of the sentence (OBRS-1592): Thai
   * and Chinese put the unit after the number and English puts a code in front, which is
   * a pattern no single i18n unit word can carry. */
  protected get detailParams(): Record<string, number | string> {
    const policy = this.policy;
    return {
      earlyDeductPct: Math.round((1 - (policy?.cancelRefundRateEarly ?? 0)) * 100),
      lateDeductPct: Math.round((1 - (policy?.cancelRefundRateLate ?? 0)) * 100),
      earlyWindowHours: policy?.earlyWindowHours ?? 0,
      rescheduleFee: formatMoney(policy?.rescheduleFeeLateThb, this.translate.currentLang),
    };
  }
}
