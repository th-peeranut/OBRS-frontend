import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../auth/auth.service';

type PaymentTab = 'creditcard' | 'qrcode';

@Component({
  selector: 'app-payment-creditcard',
  templateUrl: './payment-creditcard.component.html',
  styleUrl: './payment-creditcard.component.scss',
})
export class PaymentCreditcardComponent implements OnInit, OnDestroy {
  @Input() activeTab: PaymentTab = 'creditcard';
  @Output() tabChange = new EventEmitter<PaymentTab>();

  readonly cardBrands = [
    { name: 'Visa', icon: 'icons/payment-brand-visa.svg' },
    { name: 'Mastercard', icon: 'icons/payment-brand-mastercard.svg' },
    { name: 'UnionPay', icon: 'icons/payment-brand-unionpay.svg' },
  ];
  countdown = '10 : 00';

  creditCardForm: FormGroup;

  minDate: Date;
  private countdownTotalSeconds = 10 * 60;
  private countdownIntervalId?: ReturnType<typeof setInterval>;

  constructor(
    private translate: TranslateService,
    private fb: FormBuilder,
    private service: AuthService,
    private cdr: ChangeDetectorRef
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
        [Validators.required, Validators.minLength(13), Validators.maxLength(19)],
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

  submitPayment() {
    if (this.creditCardForm.invalid) {
      this.creditCardForm.markAllAsTouched();
      return;
    }

    // Submit payment logic here
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
}
