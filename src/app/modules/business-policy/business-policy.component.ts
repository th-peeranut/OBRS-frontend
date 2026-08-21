import { Component, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { forkJoin, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BookingPolicyService } from '../../services/booking-policy/booking-policy.service';
import { CancellationPolicyService } from '../../services/cancellation-policy/cancellation-policy.service';
import {
  ReschedulePolicyDto,
  ReschedulePolicyService,
} from '../../services/reschedule-policy/reschedule-policy.service';
import {
  BUSINESS_POLICY_EFFECTIVE_DATE,
  BUSINESS_POLICY_VERSION,
} from './business-policy.version';

export interface BusinessPolicyParams {
  maxAdvanceDays: number;
  cutoffMinutes: number;
  rescheduleWindowHours: number;
  rescheduleMaxDaysAhead: number;
  rescheduleFeeLateThb: number;
  earlyWindowHours: number;
  cancelWindowHours: number;
  /** Percentages, not the 0.0-1.0 rates the API serves -- see toPercent below. */
  refundPercentEarly: string;
  refundPercentLate: string;
  /** An already-translated sentence, not a number -- see rescheduleCountRule below. */
  rescheduleCountRule: string;
}

// OBRS-564: policy item 1 ("Ticket sales are divided into 2 types") used to
// hardcode "60 days advance / 12 hours cutoff" in i18n — neither number was
// real (no advance cap existed in the code at all; the real cutoff is 20
// minutes). Fix: item 1 moved to its own key (POLICY.BUSINESS.SALES_CHANNELS,
// see business-policy.component.html) rendered ONLY from this component's
// `policyParams`, fetched from the PUBLIC `GET /api/booking-policy` endpoint
// (BookingPolicyService) — the same two numbers an owner edits at
// admin/settings/booking-policy. The rule going forward: these numbers are
// NEVER hardcoded in i18n again.
//
// OBRS-623/659 extended that rule to the REST of the terms, which had been
// exempt from it only because nobody had gone back for them. Items 2-5 stated
// the reschedule and cancellation rules as prose, and after OBRS-655/657 shipped
// none of those numbers matched what the server enforced. They now interpolate
// from two further public endpoints, so this component reads three:
//
//   GET /api/booking-policy       -> advance cap + cutoff        (item 1)
//   GET /api/reschedule-policy    -> window, horizon, fee, cap   (item 2)
//   GET /api/cancellation-policy  -> window, boundary, 2 rates   (item 4)
//
// forkJoin, not three independent subscriptions: the terms are one document and
// a half-rendered set of them is a worse answer than the inline error, because a
// customer cannot tell which half is missing. One failure fails the block.
@Component({
    selector: 'app-business-policy',
    templateUrl: './business-policy.component.html',
    styleUrl: './business-policy.component.scss',
    standalone: false
})
export class BusinessPolicyComponent implements OnInit, OnDestroy {
  // Assigned when the APIs resolve (never rebuilt on every change-detection
  // cycle). The template's `@if="policyParams"` gate is what guarantees a user
  // can never see a raw `{{maxAdvanceDays}}` literal — showing a WRONG policy
  // number was the actual defect reported against this page, so a failed fetch
  // must NEVER fall back to a hardcoded number; it shows an inline error +
  // retry instead (see html).
  protected policyParams: BusinessPolicyParams | null = null;
  protected policyLoadFailed = false;

  // OBRS-658 AC 2 (ADR-0125): read from the version module, never re-typed into i18n — a date
  // living in three translation files drifts into three different dates (the same rule
  // privacy-policy.component follows). Rendered unconditionally, NOT inside the policyParams
  // gate above: the version identifies the WORDING, which is on the page whether or not the live
  // config fetch succeeded, and a customer reading the terms during an outage still needs to know
  // which terms they are reading.
  protected readonly version = BUSINESS_POLICY_VERSION;
  protected readonly effectiveDate = BUSINESS_POLICY_EFFECTIVE_DATE;

  // OBRS-657 shipped `reschedule_max_count = 0` meaning UNLIMITED, so this one config value is
  // the only one on the page that cannot be interpolated as a number: "changed 0 times" says the
  // opposite of what 0 means. Kept so the last server payload can be re-worded on a language
  // switch without re-fetching.
  private lastRescheduleMaxCount: number | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly bookingPolicyService: BookingPolicyService,
    private readonly cancellationPolicyService: CancellationPolicyService,
    private readonly reschedulePolicyService: ReschedulePolicyService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.loadPolicyParams();

    // TranslatePipe re-subscribes to onLangChange on its own, so the string around the values
    // re-interpolates for free. `rescheduleCountRule` cannot ride on that: it is a translated
    // SENTENCE already substituted into the params object, so it would keep the old language's
    // wording inside the new language's paragraph. Rebuilding the object on a language change is
    // what keeps it in step, and it costs no HTTP call.
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.policyParams && this.lastRescheduleMaxCount !== null) {
        this.policyParams = {
          ...this.policyParams,
          rescheduleCountRule: this.rescheduleCountRule(this.lastRescheduleMaxCount),
        };
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected retryPolicyParams(): void {
    this.loadPolicyParams();
  }

  private loadPolicyParams(): void {
    this.policyLoadFailed = false;
    forkJoin({
      booking: this.bookingPolicyService.getBookingPolicy(),
      reschedule: this.reschedulePolicyService.getReschedulePolicy(),
      cancellation: this.cancellationPolicyService.getCancellationPolicy(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ booking, reschedule, cancellation }) => {
          const b = booking.data;
          const r = reschedule.data;
          const c = cancellation.data;
          if (b && r && c) {
            this.lastRescheduleMaxCount = r.rescheduleMaxCount;
            this.policyParams = {
              maxAdvanceDays: b.maxAdvanceDays,
              cutoffMinutes: b.cutoffMinutes,
              rescheduleWindowHours: r.rescheduleWindowHours,
              rescheduleMaxDaysAhead: r.rescheduleMaxDaysAhead,
              rescheduleFeeLateThb: r.rescheduleFeeLateThb,
              // OBRS-656: read from the CANCELLATION payload, and the choice is no longer
              // arbitrary — it is the only endpoint that still serves it. The reschedule fee lost
              // its time boundary with that card, so /api/reschedule-policy stopped publishing
              // early_window_hours rather than keep announcing a free window nothing honours.
              // It is used below only in item 4, where it is a real cancellation rule.
              earlyWindowHours: c.earlyWindowHours,
              cancelWindowHours: c.cancelWindowHours,
              refundPercentEarly: BusinessPolicyComponent.toPercent(c.refundRateEarly),
              refundPercentLate: BusinessPolicyComponent.toPercent(c.refundRateLate),
              rescheduleCountRule: this.rescheduleCountRule(r.rescheduleMaxCount),
            };
          } else {
            this.policyLoadFailed = true;
          }
        },
        error: () => {
          this.policyLoadFailed = true;
        },
      });
  }

  /**
   * The published sentence for {@link ReschedulePolicyDto.rescheduleMaxCount}. `0` (and anything
   * below it) is UNLIMITED, matching the `n <= 0` test at the read site in RescheduleService —
   * so a negative left behind by a bad config edit reads as unlimited here too rather than as a
   * cap of minus one.
   */
  private rescheduleCountRule(maxCount: number): string {
    return maxCount > 0
      ? this.translate.instant('POLICY.BUSINESS.RESCHEDULE_COUNT_LIMITED', {
          rescheduleMaxCount: maxCount,
        })
      : this.translate.instant('POLICY.BUSINESS.RESCHEDULE_COUNT_UNLIMITED');
  }

  /**
   * 0.8 -> "80", 0.505 -> "50.5". Identical to refund-policy.component's conversion and for the
   * identical reason: the API serves the stored 0.0-1.0 rate because that is what the money path
   * multiplies by, so the x100 lives at each place that displays it rather than becoming a second
   * representation on the wire. Trailing zeros dropped so the ordinary case reads "80%".
   */
  private static toPercent(rate: number): string {
    return String(Number((rate * 100).toFixed(2)));
  }
}
