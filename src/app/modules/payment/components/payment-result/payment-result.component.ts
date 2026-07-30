import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { BookingService } from '../../../../services/booking/booking.service';
import { PaymentService } from '../../../../services/payment/payment.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { PaymentByBookingIdResponse } from '../../../../shared/interfaces/payment.interface';
import { AnalyticsService } from '../../../../services/analytics/analytics.service';
import { normalizeAnalyticsPaymentMethod } from '../../../../shared/lib/analytics-payment-method';

@Component({
  selector: 'app-payment-result',
  templateUrl: './payment-result.component.html',
  styleUrl: './payment-result.component.scss',
})
export class PaymentResultComponent implements OnInit, OnDestroy {
  protected isChecking = true;
  protected countdown = '15 : 00';

  private pollingIntervalId?: ReturnType<typeof setInterval>;
  private countdownIntervalId?: ReturnType<typeof setInterval>;
  private readonly timeoutSeconds = 15 * 60;
  private remainingSeconds = this.timeoutSeconds;
  private attempts = 0;
  private readonly pollingIntervalMs = 3000;
  private readonly maxAttempts = Math.ceil(
    (this.timeoutSeconds * 1000) / this.pollingIntervalMs
  ) + 1;
  private isRequestInFlight = false;

  constructor(
    private readonly router: Router,
    private readonly bookingService: BookingService,
    private readonly paymentService: PaymentService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    const bookingId = this.bookingService.getActiveBookingId();
    if (!bookingId) {
      this.alertService.error(
        this.translate.instant('PAYMENT.ALERT.BOOKING_NOT_FOUND')
      );
      this.router.navigate(['/payment']);
      return;
    }

    this.startCountdown();
    void this.checkPaymentStatus();
    this.pollingIntervalId = setInterval(() => {
      void this.checkPaymentStatus();
    }, this.pollingIntervalMs);
  }

  ngOnDestroy(): void {
    this.clearPolling();
    this.clearCountdown();
  }

  private async checkPaymentStatus(): Promise<void> {
    if (this.isRequestInFlight) {
      return;
    }

    const bookingId = this.bookingService.getActiveBookingId();
    if (!bookingId) {
      return;
    }

    this.isRequestInFlight = true;
    this.attempts += 1;

    try {
      const response = await firstValueFrom(
        this.paymentService.getBookingPayments(bookingId, {
          skipGlobalLoadingAlert: true,
        }).pipe(take(1))
      );

      if (this.isPaymentConfirmed(response.data)) {
        this.completePayment(response.data);
        return;
      }

      if (this.isPaymentFailed(response.data)) {
        await this.failPayment();
        return;
      }

      if (this.attempts >= this.maxAttempts) {
        this.timeoutPayment();
      }
    } catch (error) {
      console.error('Payment result check failed', error);
      if (this.attempts >= this.maxAttempts) {
        this.timeoutPayment();
      }
    } finally {
      this.isRequestInFlight = false;
    }
  }

  private isPaymentConfirmed(payment: PaymentByBookingIdResponse | null | undefined): boolean {
    const summaryStatus = payment?.paymentSummary?.status?.toLowerCase();
    const hasSuccessfulTransaction =
      payment?.transactions?.some((transaction) =>
        this.isPaidStatus(transaction.status)
      ) ?? false;

    return summaryStatus === 'fully_paid' || hasSuccessfulTransaction;
  }

  /**
   * Backend renamed the settled payment status `'success'` -> `'paid'`
   * (see docs/handoff.md 2026-06-15). Accept both, case-insensitively, so
   * legacy rows and casing variants don't regress (OBRS-177).
   */
  private isPaidStatus(status: string | null | undefined): boolean {
    return ['success', 'paid'].includes(
      String(status ?? '').trim().toLowerCase()
    );
  }

  private isPaymentFailed(payment: PaymentByBookingIdResponse | null | undefined): boolean {
    const latestStatus = payment?.transactions?.[0]?.status?.toLowerCase();
    return latestStatus === 'failed' || latestStatus === 'cancelled' || latestStatus === 'expired';
  }

  private completePayment(
    payment: PaymentByBookingIdResponse | null | undefined
  ): void {
    this.isChecking = false;
    this.clearPolling();
    this.clearCountdown();
    // OBRS-867 funnel step 6 — the redirect-back branch.
    //
    // This used to send a hardcoded `qr_promptpay`, justified by a comment
    // saying the page "only ever runs after a PromptPay hand-off to the bank".
    // That was never measured, and OBRS-902 measured it false: a card payment
    // that needs 3DS also leaves the site for Omise and also lands here, so
    // every 3DS card booking was reported to GA4 as PromptPay. Thai issuers
    // largely mandate 3DS, which makes that the main card path rather than an
    // edge case — and it failed silently, producing a plausible chart nobody
    // had reason to doubt. The method is read from the settled transaction now
    // (see `settledPaymentMethod`); no page may assert how the customer got to
    // it.
    //
    // Placed in `completePayment` and NOT in the poller: `checkPaymentStatus`
    // runs every 3s, and this is the one path that can only be taken once
    // (`clearPolling` above stops the next tick).
    this.analytics.track('booking_completed', {
      payment_method: this.settledPaymentMethod(payment),
    });
    this.alertService.success(this.translate.instant('PAYMENT.ALERT.SUCCESS'));
    this.router.navigate(['/e-ticket']);
  }

  /**
   * The method the *settled* transaction was paid with, in the API's own
   * vocabulary (OBRS-902).
   *
   * `find(isPaidStatus)` and not `transactions[0]`: a booking can carry a
   * failed attempt alongside the one that went through — a declined card
   * followed by a successful PromptPay is an ordinary customer recovery — and
   * the array's order is the server's business, not a contract. The paid row is
   * the only one that describes how the money actually arrived.
   *
   * Falls back to `unknown` rather than to a plausible default: `isPaymentConfirmed`
   * also accepts a `fully_paid` summary with no paid transaction in the list,
   * and a guess is exactly the failure this card exists to remove.
   */
  private settledPaymentMethod(
    payment: PaymentByBookingIdResponse | null | undefined
  ): string {
    const settled = payment?.transactions?.find((transaction) =>
      this.isPaidStatus(transaction.status)
    );
    return normalizeAnalyticsPaymentMethod(settled?.paymentMethod);
  }

  private async failPayment(): Promise<void> {
    this.isChecking = false;
    this.clearPolling();
    this.clearCountdown();
    await this.alertService.error(
      this.translate.instant('PAYMENT.RESULT.FAILED_REDIRECT')
    );
    this.router.navigate(['/schedule-booking']);
  }

  private timeoutPayment(): void {
    this.isChecking = false;
    this.clearPolling();
    this.clearCountdown();
    this.alertService.info(this.translate.instant('PAYMENT.ALERT.PENDING'));
    this.router.navigate(['/payment']);
  }

  private startCountdown(): void {
    this.updateCountdown();
    this.countdownIntervalId = setInterval(() => {
      this.remainingSeconds = Math.max(this.remainingSeconds - 1, 0);
      this.updateCountdown();
    }, 1000);
  }

  private updateCountdown(): void {
    const minutes = Math.floor(this.remainingSeconds / 60);
    const seconds = this.remainingSeconds % 60;
    this.countdown = `${this.padTime(minutes)} : ${this.padTime(seconds)}`;
  }

  private padTime(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
  }

  private clearPolling(): void {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = undefined;
    }
  }

  private clearCountdown(): void {
    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = undefined;
    }
  }
}
