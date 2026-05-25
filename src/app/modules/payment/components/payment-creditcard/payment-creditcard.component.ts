import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { BookingService } from '../../../../services/booking/booking.service';
import { PaymentService } from '../../../../services/payment/payment.service';
import { OmiseTokenService } from '../../../../services/payment/omise-token.service';
import { AlertService } from '../../../../shared/services/alert.service';
import {
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
  @Output() tabChange = new EventEmitter<PaymentTab>();
  @Output() back = new EventEmitter<void>();

  readonly cardBrands = [
    { name: 'Visa', icon: 'icons/payment-brand-visa.svg' },
    { name: 'Mastercard', icon: 'icons/payment-brand-mastercard.svg' },
    { name: 'UnionPay', icon: 'icons/payment-brand-unionpay.svg' },
  ];
  countdown = '10 : 00';
  isSubmittingPayment = false;
  private paymentIdempotencyKey = '';

  creditCardForm: FormGroup;

  minDate: Date = new Date();
  private countdownTotalSeconds = 10 * 60;
  private countdownIntervalId?: ReturnType<typeof setInterval>;

  constructor(
    private translate: TranslateService,
    private fb: FormBuilder,
    private router: Router,
    private bookingService: BookingService,
    private paymentService: PaymentService,
    private omiseTokenService: OmiseTokenService,
    private alertService: AlertService,
  ) {
    this.creatForm();
  }

  ngOnInit(): void {
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.clearCountdown();
  }

  creatForm() {
    this.creditCardForm = this.fb.group({
      creditCardNo: [
        '',
        [
          Validators.required,
          Validators.minLength(13),
          Validators.maxLength(19),
        ],
      ],
      expireDate: ['', Validators.required],
      cvv: [
        '',
        [Validators.required, Validators.minLength(3), Validators.maxLength(4)],
      ],
    });
  }

  selectTab(tab: PaymentTab): void {
    if (tab === this.activeTab) {
      return;
    }

    this.tabChange.emit(tab);
  }

  getForm(controlName: string) {
    return this.creditCardForm.get(controlName);
  }

  getFormValue(controlName: string) {
    return this.creditCardForm.getRawValue()[controlName];
  }

  getFormErrors(controlName: string, errorName: string): boolean {
    const errors = this.creditCardForm.get(controlName)?.errors;

    if (!errors) {
      return false;
    }

    if (errorName === 'maxLength' && errors['maxlength']) {
      const maxLength = errors['maxlength'].requiredLength;
      const actualLength = errors['maxlength'].actualLength;
      return actualLength > maxLength;
    }

    return !!errors[errorName];
  }

  async submitPayment(): Promise<void> {
    if (this.creditCardForm.invalid) {
      this.creditCardForm.markAllAsTouched();
      return;
    }

    if (this.isSubmittingPayment) {
      return;
    }

    const bookingId = this.bookingService.getActiveBookingId();
    if (!bookingId) {
      this.alertService.error('Booking ID not found');
      return;
    }

    const idempotencyKey =
      this.paymentIdempotencyKey || generateIdempotencyKey();
    this.paymentIdempotencyKey = idempotencyKey;

    this.isSubmittingPayment = true;
    try {
      const cardToken = await this.resolveCardToken();
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

      if (response?.code === 200 || response?.code === 201) {
        this.paymentIdempotencyKey = '';
        this.handlePaymentResponse(response.data);
      } else {
        this.alertService.error('Payment failed');
      }
    } catch (error) {
      this.alertService.error('Payment failed');
      console.error('Payment request failed', error);
    } finally {
      this.isSubmittingPayment = false;
    }
  }

  private async resolveCardToken(): Promise<string> {
    if (environment.useMockPayments) {
      return 'mock_card_token';
    }

    const expiryDate = this.getExpiryDate();
    if (!expiryDate) {
      throw new Error('Invalid card expiry date');
    }

    return this.omiseTokenService.createCardToken({
      number: this.getCardNumber(),
      expiration_month: expiryDate.getMonth() + 1,
      expiration_year: expiryDate.getFullYear(),
      security_code: String(this.getFormValue('cvv') ?? ''),
      name: 'OBRS Customer',
    });
  }

  private getCardNumber(): string {
    const raw = String(this.getFormValue('creditCardNo') ?? '');
    const digits = raw.replace(/\D+/g, '');
    return digits || 'abc';
  }

  private getExpiryDate(): Date | null {
    const rawValue = this.getFormValue('expireDate');
    if (rawValue instanceof Date && Number.isFinite(rawValue.getTime())) {
      return rawValue;
    }

    const parsed = new Date(rawValue);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  private handlePaymentResponse(payment: PaymentResponse | null | undefined): void {
    if (payment?.status === 'success') {
      this.alertService.success('Payment success');
      this.router.navigate(['/e-ticket']);
      return;
    }

    if (payment?.authorizeUri) {
      window.location.href = payment.authorizeUri;
      return;
    }

    if (payment?.status === 'pending') {
      this.alertService.success('Payment is pending confirmation');
      return;
    }

    this.alertService.error(payment?.failureReason ?? 'Payment failed');
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

  private clearCountdown(): void {
    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = undefined;
    }
  }

  onBack(): void {
    this.back.emit();
  }
}
