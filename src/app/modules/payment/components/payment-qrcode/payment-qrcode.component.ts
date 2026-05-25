import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { Router } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { combineLatest, firstValueFrom, Subject } from 'rxjs';
import { distinctUntilChanged, map, take, takeUntil } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { Schedule } from '../../../../shared/interfaces/schedule.interface';
import { ScheduleFilter } from '../../../../shared/interfaces/schedule.interface';
import { ScheduleBooking } from '../../../../shared/interfaces/schedule-booking.interface';
import { selectScheduleBooking } from '../../../../shared/stores/schedule-booking/schedule-booking.selector';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { BookingService } from '../../../../services/booking/booking.service';
import { PaymentService } from '../../../../services/payment/payment.service';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  PaymentByBookingIdResponse,
  PaymentPayload,
  PaymentResponse,
} from '../../../../shared/interfaces/payment.interface';
import { generateIdempotencyKey } from '../../../../shared/lib/idempotency-key';

type PaymentTab = 'creditcard' | 'qrcode';

@Component({
  selector: 'app-payment-qrcode',
  templateUrl: './payment-qrcode.component.html',
  styleUrl: './payment-qrcode.component.scss',
})
export class PaymentQrcodeComponent implements OnInit, OnDestroy {
  @Input() activeTab: PaymentTab = 'qrcode';
  @Output() tabChange = new EventEmitter<PaymentTab>();
  @Output() back = new EventEmitter<void>();

  amountDisplay = '0.00';
  readonly qrImageAlt = 'PromptPay QR code';
  qrImageUrl = '';
  referenceNo = '';
  countdown = '10 : 00';
  isSubmittingPayment = false;
  isWaitingForConfirmation = false;
  private hasRequestedQrCode = false;
  private paymentIdempotencyKey = '';
  private countdownTotalSeconds = 10 * 60;
  private countdownIntervalId?: ReturnType<typeof setInterval>;
  private paymentPollingIntervalId?: ReturnType<typeof setInterval>;
  private isCheckingPaymentStatus = false;
  private readonly paymentPollingIntervalMs = 3000;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private store: Store,
    private router: Router,
    private bookingService: BookingService,
    private paymentService: PaymentService,
    private alertService: AlertService
  ) {}

  ngOnInit(): void {
    this.startCountdown();
    this.watchAmount();
  }

  ngOnDestroy(): void {
    this.clearCountdown();
    this.clearPaymentPolling();
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectTab(tab: PaymentTab): void {
    if (tab === this.activeTab) {
      return;
    }

    this.tabChange.emit(tab);
  }

  onQrError(): void {
    this.qrImageUrl = '';
    this.hasRequestedQrCode = false;
    this.isWaitingForConfirmation = false;
    this.clearPaymentPolling();
  }

  async refreshQrCode(): Promise<void> {
    if (this.isSubmittingPayment || this.isWaitingForConfirmation) {
      return;
    }

    this.qrImageUrl = '';
    this.hasRequestedQrCode = false;
    await this.ensurePromptPayQrCode(true);
  }

  private async ensurePromptPayQrCode(showMissingBookingAlert = false): Promise<void> {
    if (
      this.hasRequestedQrCode ||
      this.qrImageUrl ||
      this.isSubmittingPayment ||
      this.isWaitingForConfirmation
    ) {
      return;
    }

    const bookingId = this.bookingService.getActiveBookingId();
    if (!bookingId) {
      if (showMissingBookingAlert) {
        this.alertService.error('Booking ID not found');
      }
      return;
    }

    this.hasRequestedQrCode = true;
    const payload: PaymentPayload = {
      bookingId,
      paymentMethod: 'qr_promptpay',
      qrReferenceNumber: this.referenceNo || this.generateReferenceNo(),
    };
    const idempotencyKey =
      this.paymentIdempotencyKey || generateIdempotencyKey();
    this.paymentIdempotencyKey = idempotencyKey;

    this.isSubmittingPayment = true;

    try {
      const request = environment.useMockPayments
        ? this.paymentService.createMockPayment(
            payload,
            idempotencyKey,
            'promptpay_pending'
          )
        : this.paymentService.createPayment(payload, idempotencyKey);
      const response = await firstValueFrom(
        request.pipe(take(1))
      );

      if (this.isSuccessfulResponse(response?.code)) {
        this.handlePromptPayResponse(response.data);
      } else {
        this.alertService.error('Payment failed');
      }
    } catch (error) {
      this.hasRequestedQrCode = false;
      this.alertService.error('Payment failed');
      console.error('Payment request failed', error);
    } finally {
      this.isSubmittingPayment = false;
    }
  }

  downloadQrCode(): void {
    if (!this.qrImageUrl) {
      return;
    }

    window.open(this.qrImageUrl, '_blank', 'noopener');
  }

  private handlePromptPayResponse(payment: PaymentResponse | null | undefined): void {
    if (payment?.status === 'success') {
      this.completePayment();
      return;
    }

    if (payment?.authorizeUri) {
      this.qrImageUrl = payment.authorizeUri;
      this.referenceNo = payment.transactionId ?? this.referenceNo;
      this.isWaitingForConfirmation = true;
      this.startCountdown();
      this.startPaymentPolling();
      return;
    }

    if (payment?.status === 'pending') {
      this.isWaitingForConfirmation = true;
      this.startPaymentPolling();
      return;
    }

    this.alertService.error(payment?.failureReason ?? 'Payment failed');
  }

  private watchAmount(): void {
    combineLatest([
      this.store.pipe(select(selectScheduleBooking)),
      this.store.pipe(select(selectScheduleFilter)),
    ])
      .pipe(
        map(([booking, filter]) =>
          this.calculateAmount(booking, filter)
        ),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((total) => {
        this.amountDisplay = this.formatAmount(total);
        if (total > 0) {
          void this.ensurePromptPayQrCode();
        }
      });
  }

  private calculateAmount(
    booking: ScheduleBooking | null,
    filter: ScheduleFilter | null
  ): number {
    const scheduleTotal = this.sumScheduleFare(booking?.schedule);
    const passengerTotal = this.sumPassengers(filter?.passengerInfo);
    const total = scheduleTotal * passengerTotal;
    return Number.isFinite(total) ? total : 0;
  }

  private sumScheduleFare(items?: Schedule[] | null): number {
    return (
      items?.reduce((total, item) => total + this.getPricePerSeat(item?.pricePerSeat), 0) ??
      0
    );
  }

  private getPricePerSeat(value: string | number | null | undefined): number {
    const parsed = typeof value === 'string' ? parseFloat(value) : value ?? 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private sumPassengers(items?: { type: string; count: number }[]): number {
    return items?.reduce((total, item) => total + item.count, 0) ?? 0;
  }

  private formatAmount(value: number): string {
    return Number.isFinite(value) ? value.toFixed(2) : '0.00';
  }

  private startCountdown(): void {
    this.clearCountdown();
    this.countdownTotalSeconds = 10 * 60;
    this.updateCountdownLabel();

    this.countdownIntervalId = setInterval(() => {
      if (this.countdownTotalSeconds <= 0) {
        this.clearCountdown();
        return;
      }

      this.countdownTotalSeconds -= 1;
      this.updateCountdownLabel();
    }, 1000);
  }

  private updateCountdownLabel(): void {
    const minutes = Math.floor(this.countdownTotalSeconds / 60);
    const seconds = this.countdownTotalSeconds % 60;
    this.countdown = `${this.padTime(minutes)} : ${this.padTime(seconds)}`;
  }

  private padTime(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
  }

  private generateReferenceNo(): string {
    const timestamp = Date.now().toString();
    const randomSuffix = Math.floor(10 + Math.random() * 90).toString();
    return `RQ${timestamp}${randomSuffix}`;
  }

  private clearCountdown(): void {
    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = undefined;
    }
  }

  private startPaymentPolling(): void {
    this.clearPaymentPolling();
    void this.checkPaymentStatus();
    this.paymentPollingIntervalId = setInterval(() => {
      void this.checkPaymentStatus();
    }, this.paymentPollingIntervalMs);
  }

  private clearPaymentPolling(): void {
    if (this.paymentPollingIntervalId) {
      clearInterval(this.paymentPollingIntervalId);
      this.paymentPollingIntervalId = undefined;
    }
    this.isCheckingPaymentStatus = false;
  }

  private async checkPaymentStatus(): Promise<void> {
    if (this.isCheckingPaymentStatus) {
      return;
    }

    const bookingId = this.bookingService.getActiveBookingId();
    if (!bookingId) {
      return;
    }

    this.isCheckingPaymentStatus = true;
    try {
      const response = await firstValueFrom(
        this.paymentService.getBookingPayments(bookingId).pipe(take(1))
      );

      if (this.isPaymentConfirmed(response.data)) {
        this.completePayment();
      }
    } catch (error) {
      console.error('Payment status polling failed', error);
    } finally {
      this.isCheckingPaymentStatus = false;
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

  private completePayment(): void {
    this.hasRequestedQrCode = false;
    this.paymentIdempotencyKey = '';
    this.isWaitingForConfirmation = false;
    this.clearPaymentPolling();
    this.alertService.success('Payment success');
    this.router.navigate(['/e-ticket']);
  }

  private isSuccessfulResponse(code: number | null | undefined): boolean {
    return code === 200 || code === 201;
  }

  onBack(): void {
    this.back.emit();
  }
}
