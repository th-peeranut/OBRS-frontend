import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { Store, select } from '@ngrx/store';
import { combineLatest, Subject } from 'rxjs';
import { distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { Schedule } from '../../../../shared/interfaces/schedule.interface';
import { ScheduleFilter } from '../../../../shared/interfaces/schedule.interface';
import { ScheduleBooking } from '../../../../shared/interfaces/schedule-booking.interface';
import { selectScheduleBooking } from '../../../../shared/stores/schedule-booking/schedule-booking.selector';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';

type PaymentTab = 'creditcard' | 'qrcode';

@Component({
  selector: 'app-payment-qrcode',
  templateUrl: './payment-qrcode.component.html',
  styleUrl: './payment-qrcode.component.scss',
})
export class PaymentQrcodeComponent implements OnInit, OnDestroy {
  @Input() activeTab: PaymentTab = 'qrcode';
  @Output() tabChange = new EventEmitter<PaymentTab>();

  amountDisplay = '0.00';
  readonly qrImageAlt = 'PromptPay QR code';
  qrImageUrl = '';
  countdown = '10 : 00';
  refreshCooldownSeconds = 0;
  private readonly promptPayId = environment.promptpay?.id ?? '';
  private readonly promptPayBaseUrl =
    environment.promptpay?.baseUrl ?? 'https://promptpay.io';
  private countdownTotalSeconds = 10 * 60;
  private countdownIntervalId?: ReturnType<typeof setInterval>;
  private refreshCooldownIntervalId?: ReturnType<typeof setInterval>;
  private readonly refreshCooldownTotalSeconds = 10;
  private readonly destroy$ = new Subject<void>();

  constructor(private store: Store) {}

  ngOnInit(): void {
    this.startCountdown();
    this.watchAmount();
  }

  ngOnDestroy(): void {
    this.clearCountdown();
    this.clearRefreshCooldown();
    this.destroy$.next();
    this.destroy$.complete();
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
    this.loadQrCode();
    this.startRefreshCooldown();
  }

  onQrError(): void {
    this.qrImageUrl = '';
  }

  private loadQrCode(): void {
    if (!this.promptPayId) {
      this.qrImageUrl = '';
      return;
    }

    const baseUrl = this.promptPayBaseUrl.replace(/\/+$/, '');
    const amount = this.amountDisplay;
    const url = `${baseUrl}/${encodeURIComponent(
      this.promptPayId
    )}/${encodeURIComponent(amount)}.png`;
    this.qrImageUrl = `${url}?t=${Date.now()}`;
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
        this.loadQrCode();
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
    return items?.reduce((total, item) => total + (item.fare ?? 0), 0) ?? 0;
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
