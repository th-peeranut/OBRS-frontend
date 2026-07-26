import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { BookingService } from '../../../../services/booking/booking.service';
import { PaymentService } from '../../../../services/payment/payment.service';
import {
  OmiseTokenService,
  isCardEntryCancelled,
} from '../../../../services/payment/omise-token.service';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  PaymentByBookingIdResponse,
  PaymentPayload,
  PaymentResponse,
} from '../../../../shared/interfaces/payment.interface';
import { generateIdempotencyKey } from '../../../../shared/lib/idempotency-key';

type PaymentTab = 'creditcard' | 'qrcode';

@Component({
  selector: 'app-payment-creditcard',
  templateUrl: './payment-creditcard.component.html',
  styleUrl: './payment-creditcard.component.scss',
})
export class PaymentCreditcardComponent implements OnInit, OnDestroy {
  @Input() activeTab: PaymentTab = 'creditcard';
  /**
   * Route to navigate to on a completed payment. Defaults to the existing
   * `/e-ticket` behavior so every current call site stays byte-identical
   * (design-system §10 "extend, don't fork"). Pass `null` to suppress
   * navigation entirely — e.g. the reschedule dialog embeds this component
   * as an inline step and reacts to `(paymentCompleted)` instead.
   */
  @Input() successRedirect: string[] | null = ['/e-ticket'];
  /**
   * OBRS-415: forwarded to `<app-payment-summary>` — see that component's own
   * doc comment. Optional, null-default so every existing call site stays
   * byte-identical.
   */
  @Input() amountOverride: number | null = null;
  @Output() tabChange = new EventEmitter<PaymentTab>();
  @Output() back = new EventEmitter<void>();
  @Output() paymentCompleted = new EventEmitter<void>();

  readonly cardBrands = [
    { name: 'Visa', icon: 'icons/payment-brand-visa.svg' },
    { name: 'Mastercard', icon: 'icons/payment-brand-mastercard.svg' },
    { name: 'UnionPay', icon: 'icons/payment-brand-unionpay.svg' },
  ];
  countdown = '15 : 00';
  isSubmittingPayment = false;
  isWaitingForConfirmation = false;
  private paymentIdempotencyKey = '';

  private countdownTotalSeconds = 15 * 60;
  private countdownIntervalId?: ReturnType<typeof setInterval>;
  private paymentPollingIntervalId?: ReturnType<typeof setInterval>;
  private isCheckingPaymentStatus = false;
  private readonly paymentPollingIntervalMs = 3000;

  constructor(
    private translate: TranslateService,
    private router: Router,
    private bookingService: BookingService,
    private paymentService: PaymentService,
    private omiseTokenService: OmiseTokenService,
    private alertService: AlertService,
  ) {}

  ngOnInit(): void {
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.clearCountdown();
    this.clearPaymentPolling();
  }

  selectTab(tab: PaymentTab): void {
    if (tab === this.activeTab) {
      return;
    }

    this.tabChange.emit(tab);
  }

  async submitPayment(): Promise<void> {
    if (this.isSubmittingPayment || this.isWaitingForConfirmation) {
      return;
    }

    const bookingId = this.bookingService.getActiveBookingId();
    if (!bookingId) {
      this.alertService.error(
        this.translate.instant('PAYMENT.ALERT.BOOKING_NOT_FOUND')
      );
      return;
    }

    const idempotencyKey =
      this.paymentIdempotencyKey || generateIdempotencyKey();
    this.paymentIdempotencyKey = idempotencyKey;

    this.isSubmittingPayment = true;
    try {
      const cardToken = await this.resolveCardToken(bookingId);
      const payload: PaymentPayload = {
        bookingId,
        paymentMethod: 'card',
        cardToken,
      };
      const request = environment.useMockPayments
        ? this.paymentService.createMockPayment(payload, idempotencyKey)
        : this.paymentService.createPayment(payload, idempotencyKey);
      const response = await firstValueFrom(
        request.pipe(take(1)),
      );

      if (this.isSuccessfulResponse(response?.code)) {
        this.handlePaymentResponse(response.data);
      } else {
        this.alertService.error(this.translate.instant('PAYMENT.ALERT.FAILED'));
      }
    } catch (error) {
      // Closing Omise's card dialog is not a failure — nothing was charged and
      // nothing was even sent. Telling someone their payment failed because they
      // changed their mind is how a booking gets abandoned, so this returns to the
      // untouched payment page in silence and `finally` re-enables the button
      // (OBRS-391).
      if (isCardEntryCancelled(error)) {
        return;
      }

      // This catch also swallows the Omise tokenize rejection raised by
      // OmiseTokenService.requestCardToken (its only call site is resolveCardToken
      // above). That rejection carries Omise's own English text — replacing it
      // here is what keeps a third-party string off a Thai user's screen, so the
      // service can keep throwing a developer-readable Error for the console
      // (OBRS-569).
      this.alertService.error(this.translate.instant('PAYMENT.ALERT.FAILED'));
      console.error('Payment request failed', error);
    } finally {
      this.isSubmittingPayment = false;
    }
  }

  private async resolveCardToken(bookingId: number): Promise<string> {
    // Unchanged and load-bearing: local, SIT and the whole E2E suite run with
    // useMockPayments and never reach a real Omise dialog. Keeping this branch
    // ABOVE the OmiseCard call is what stops those environments from trying to
    // open a modal against a public key they do not have (OBRS-391 AC 6).
    if (environment.useMockPayments) {
      return 'mock_card_token';
    }

    // Nothing here carries card data — there is none to carry. Omise's hosted
    // iframe collects the number, expiry and CVV on cdn.omise.co and hands back
    // only the token (OBRS-391). Everything passed is presentation.
    const due = await this.resolveAmountDue(bookingId);

    return this.omiseTokenService.requestCardToken({
      language: this.translate.currentLang,
      submitLabel: this.translate.instant('PAYMENT.CREDIT_CARD.PAY_NOW'),
      amountSubunits: due.amountSubunits,
      currency: due.currency,
    });
  }

  /**
   * What Omise's dialog should say is owed, in satang.
   *
   * Read from the SERVER (`paymentSummary.outstandingAmount` on the endpoint this
   * component already polls) rather than re-derived in the browser. The
   * seat-booking total is computed inside <app-payment-summary>'s template from
   * three NgRx stores; a second copy of that arithmetic here would be a second
   * thing that can disagree about money, and it would also be wrong for the
   * reschedule and change-stop dialogs, where what is due is a difference rather
   * than a fare.
   *
   * Failing here aborts the payment instead of opening a dialog with a wrong
   * total on it. That is deliberate and costs nothing real: if this call cannot
   * reach the backend, the charge that follows it could not have either — so the
   * passenger sees the same failure, just before typing a card number rather than
   * after.
   */
  private async resolveAmountDue(
    bookingId: number
  ): Promise<{ amountSubunits: number; currency: string }> {
    const response = await firstValueFrom(
      this.paymentService.getBookingPayments(bookingId).pipe(take(1))
    );
    const summary = response?.data?.paymentSummary;

    const outstanding = Number(summary?.outstandingAmount);
    if (!Number.isFinite(outstanding) || outstanding <= 0) {
      throw new Error(
        `No outstanding amount to charge for booking ${bookingId}: ` +
          `${String(summary?.outstandingAmount)}`
      );
    }

    // Omise wants the smallest currency unit, and the x100 below is only correct
    // for a 2-decimal currency. This system is THB throughout — the fares, the
    // Omise merchant account and the contract behind it are all Thai — so rather
    // than silently mis-scaling by 100x if that ever stops being true, refuse.
    const currency = String(summary?.currency ?? 'THB').toUpperCase();
    if (currency !== 'THB') {
      throw new Error(`Unsupported currency for card payment: ${currency}`);
    }

    return { amountSubunits: Math.round(outstanding * 100), currency };
  }

  private handlePaymentResponse(payment: PaymentResponse | null | undefined): void {
    if (this.isPaidStatus(payment?.status)) {
      this.completePayment();
      return;
    }

    if (payment?.authorizeUri) {
      window.location.href = payment.authorizeUri;
      return;
    }

    if (payment?.status === 'pending') {
      this.isWaitingForConfirmation = true;
      this.startPaymentPolling();
      this.alertService.success(this.translate.instant('PAYMENT.ALERT.PENDING'));
      return;
    }

    // `payment.failureReason` is the gateway's own wording, relayed by the backend
    // (Omise codes such as "insufficient_fund" / "invalid_security_code"). It is
    // English, and it names things the passenger has no way to act on — so it goes
    // to the console for support, never to the dialog (OBRS-569).
    console.error('Payment failed', payment?.failureReason);
    this.alertService.error(this.translate.instant('PAYMENT.ALERT.FAILED'));
  }

  private startCountdown(): void {
    this.clearCountdown();
    this.countdownTotalSeconds = 15 * 60;
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

  private completePayment(): void {
    this.paymentIdempotencyKey = '';
    this.isWaitingForConfirmation = false;
    this.clearPaymentPolling();
    this.alertService.success(this.translate.instant('PAYMENT.ALERT.SUCCESS'));
    this.paymentCompleted.emit();
    if (this.successRedirect) {
      this.router.navigate(this.successRedirect);
    }
  }

  private isSuccessfulResponse(code: number | null | undefined): boolean {
    return code === 200 || code === 201;
  }

  onBack(): void {
    this.back.emit();
  }
}
