import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';

type PaymentTab = 'creditcard' | 'qrcode';

@Component({
  selector: 'app-payment-qrcode',
  templateUrl: './payment-qrcode.component.html',
  styleUrl: './payment-qrcode.component.scss',
})
export class PaymentQrcodeComponent implements OnInit, OnDestroy {
  @Input() activeTab: PaymentTab = 'qrcode';
  @Output() tabChange = new EventEmitter<PaymentTab>();

  readonly amountDisplay = '300.00';
  countdown = '10 : 00';
  refreshCooldownSeconds = 0;
  private countdownTotalSeconds = 10 * 60;
  private countdownIntervalId?: ReturnType<typeof setInterval>;
  private refreshCooldownIntervalId?: ReturnType<typeof setInterval>;
  private readonly refreshCooldownTotalSeconds = 10;

  ngOnInit(): void {
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.clearCountdown();
    this.clearRefreshCooldown();
  }

  selectTab(tab: PaymentTab): void {
    if (tab === this.activeTab) {
      return;
    }

    this.tabChange.emit(tab);
  }

  refreshQrCode(): void {
    if (this.refreshCooldownSeconds > 0) {
      return;
    }

    this.startCountdown();
    // Hook real QR recreate call here if available.
    this.startRefreshCooldown();
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

  private startRefreshCooldown(): void {
    this.clearRefreshCooldown();
    this.refreshCooldownSeconds = this.refreshCooldownTotalSeconds;

    this.refreshCooldownIntervalId = setInterval(() => {
      if (this.refreshCooldownSeconds <= 0) {
        this.clearRefreshCooldown();
        return;
      }

      this.refreshCooldownSeconds -= 1;
    }, 1000);
  }

  private clearRefreshCooldown(): void {
    if (this.refreshCooldownIntervalId) {
      clearInterval(this.refreshCooldownIntervalId);
      this.refreshCooldownIntervalId = undefined;
    }
    this.refreshCooldownSeconds = 0;
  }
}
