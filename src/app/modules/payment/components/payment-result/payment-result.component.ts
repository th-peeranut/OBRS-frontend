import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { BookingService } from '../../../../services/booking/booking.service';
import { PaymentService } from '../../../../services/payment/payment.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { PaymentByBookingIdResponse } from '../../../../shared/interfaces/payment.interface';

@Component({
  selector: 'app-payment-result',
  templateUrl: './payment-result.component.html',
  styleUrl: './payment-result.component.scss',
})
export class PaymentResultComponent implements OnInit, OnDestroy {
  protected isChecking = true;
  protected countdown = '00 : 30';

  private pollingIntervalId?: ReturnType<typeof setInterval>;
  private countdownIntervalId?: ReturnType<typeof setInterval>;
  private remainingSeconds = 30;
  private attempts = 0;
  private readonly maxAttempts = 10;
  private readonly pollingIntervalMs = 3000;
  private isRequestInFlight = false;

  constructor(
    private readonly router: Router,
    private readonly bookingService: BookingService,
    private readonly paymentService: PaymentService,
    private readonly alertService: AlertService
  ) {}

  ngOnInit(): void {
    const bookingId = this.bookingService.getActiveBookingId();
    if (!bookingId) {
      this.alertService.error('Booking ID not found');
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
        this.paymentService.getBookingPayments(bookingId).pipe(take(1))
      );

      if (this.isPaymentConfirmed(response.data)) {
        this.completePayment();
        return;
      }

      if (this.isPaymentFailed(response.data)) {
        this.failPayment();
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
        transaction.status?.toLowerCase() === 'success'
      ) ?? false;

    return summaryStatus === 'fully_paid' || hasSuccessfulTransaction;
  }

  private isPaymentFailed(payment: PaymentByBookingIdResponse | null | undefined): boolean {
    const latestStatus = payment?.transactions?.[0]?.status?.toLowerCase();
    return latestStatus === 'failed' || latestStatus === 'cancelled' || latestStatus === 'expired';
  }

  private completePayment(): void {
    this.isChecking = false;
    this.clearPolling();
    this.clearCountdown();
    this.alertService.success('Payment success');
    this.router.navigate(['/e-ticket']);
  }

  private failPayment(): void {
    this.isChecking = false;
    this.clearPolling();
    this.clearCountdown();
    this.alertService.error('Payment failed');
    this.router.navigate(['/payment']);
  }

  private timeoutPayment(): void {
    this.isChecking = false;
    this.clearPolling();
    this.clearCountdown();
    this.alertService.info('Payment is pending confirmation');
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
