import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CancellationPolicyService } from '../../services/cancellation-policy/cancellation-policy.service';

/**
 * The values POLICY.REFUND.RATES and POLICY.REFUND.MANUAL_TIMING interpolate.
 * Percentages, not the 0.0-1.0 rates the API serves -- see toPercent below for
 * why the conversion lives here.
 */
export interface RefundPolicyParams {
  cancelWindowHours: number;
  earlyWindowHours: number;
  refundRateEarlyPercent: string;
  refundRateLatePercent: string;
  /**
   * OBRS-1136 AC-1 -- the wait for a refund nobody can automate, in calendar days.
   * Null when the server did not send it; MANUAL_TIMING is gated on that, because the
   * OBRS-627 rule this whole file exists to enforce cuts both ways: a number a customer
   * relies on before paying must come from the server, and if the server did not say it,
   * the page says nothing rather than a default somebody typed here.
   */
  manualRefundDueDays: number | null;
}

// OBRS-627: /refund-policy described a refund this system has never performed. It
// demanded the original paper ticket plus two ID copies, promised payment "within 3
// business days of receiving complete documents", told the passenger to come and
// collect the money in person, and reserved the right to keep it if they did not
// come within 7 business days. The app has always let the customer cancel from My
// Bookings and refund automatically, e-tickets have no original to hand in, and no
// forfeiture rule exists anywhere in the code. The page also never mentioned the
// refund rates the system does apply, so a customer could read the whole thing and
// still not know what cancelling costs.
//
// The numbers now come from the public GET /api/cancellation-policy, reading the
// same system_configs keys CancellationService reads when it computes a real refund
// (pinned by CancellationServiceTest's OBRS-627 pair on the backend). This is the
// OBRS-564 rule the sibling /business-policy page already follows: a policy number
// a customer reads is never hardcoded in i18n.
@Component({
  selector: 'app-refund-policy',
  templateUrl: './refund-policy.component.html',
  styleUrl: './refund-policy.component.scss',
  standalone: false,
})
export class RefundPolicyComponent implements OnInit, OnDestroy {
  // Assigned ONCE when the API resolves, never rebuilt per change-detection cycle:
  // TranslatePipe is impure and re-subscribes to onLangChange itself, so a language
  // switch re-interpolates the new string against this SAME object. The template's
  // @if gate is what guarantees a customer can never see a raw
  // {{refundRateEarlyPercent}}, and a failed fetch must NEVER fall back to a
  // hardcoded number -- publishing a wrong refund rate is worse than publishing
  // none, because the customer relies on it before paying. Inline error + retry
  // instead (same precedent as business-policy.component.ts).
  protected policyParams: RefundPolicyParams | null = null;
  protected policyLoadFailed = false;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly cancellationPolicyService: CancellationPolicyService) {}

  ngOnInit(): void {
    this.loadPolicyParams();
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
    this.cancellationPolicyService
      .getCancellationPolicy()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const data = response.data;
          if (data) {
            this.policyParams = {
              cancelWindowHours: data.cancelWindowHours,
              earlyWindowHours: data.earlyWindowHours,
              refundRateEarlyPercent: RefundPolicyComponent.toPercent(data.refundRateEarly),
              refundRateLatePercent: RefundPolicyComponent.toPercent(data.refundRateLate),
              manualRefundDueDays:
                typeof data.manualRefundDueDays === 'number' && data.manualRefundDueDays > 0
                  ? data.manualRefundDueDays
                  : null,
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
   * 0.8 -> "80", 0.505 -> "50.5". The API serves the stored 0.0-1.0 rate because
   * that is the number the money path multiplies by; serving a second, percentage
   * copy would be a second representation to drift. The x100 therefore lives at the
   * one place that displays it, and trailing zeros are dropped so the ordinary case
   * reads "80%" rather than "80.00%".
   */
  private static toPercent(rate: number): string {
    return String(Number((rate * 100).toFixed(2)));
  }
}
