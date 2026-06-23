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
import { TranslateService } from '@ngx-translate/core';
import { combineLatest, firstValueFrom, Subject } from 'rxjs';
import { distinctUntilChanged, map, take, takeUntil } from 'rxjs/operators';
import QRCode from 'qrcode';
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
type PromptPayPaymentData = PaymentResponse | PaymentByBookingIdResponse;

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
  qrPaymentUrl = '';
  referenceNo = '';
  countdown = '15 : 00';
  isSubmittingPayment = false;
  isWaitingForConfirmation = false;
  private hasRequestedQrCode = false;
  private paymentIdempotencyKey = '';
  private countdownTotalSeconds = 15 * 60;
  private countdownIntervalId?: ReturnType<typeof setInterval>;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private store: Store,
    private router: Router,
    private bookingService: BookingService,
    private paymentService: PaymentService,
    private alertService: AlertService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.startCountdown();
    this.watchAmount();
  }

  ngOnDestroy(): void {
    this.clearCountdown();
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
    this.qrPaymentUrl = '';
    this.hasRequestedQrCode = false;
    this.isWaitingForConfirmation = false;
  }

  async confirmPayment(): Promise<void> {
    if (this.isSubmittingPayment || !this.qrPaymentUrl) {
      return;
    }

    const isConfirmed = await this.alertService.confirm({
      title: this.translate.instant('PAYMENT.QR.CONFIRM_DIALOG.TITLE'),
      text: this.translate.instant('PAYMENT.QR.CONFIRM_DIALOG.MESSAGE'),
      confirmButtonText: this.translate.instant('PAYMENT.QR.CONFIRM_DIALOG.CONFIRM'),
      cancelButtonText: this.translate.instant('PAYMENT.QR.CONFIRM_DIALOG.CANCEL'),
      icon: 'warning',
    });

    if (!isConfirmed) {
      return;
    }

    window.location.href = this.qrPaymentUrl;
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
        await this.handlePromptPayResponse(response.data);
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

  async downloadQrCode(): Promise<void> {
    if (!this.qrImageUrl) {
      return;
    }

    const filename = this.getQrCodeDownloadFilename(this.qrImageUrl);
    if (this.qrImageUrl.startsWith('data:') || this.qrImageUrl.startsWith('blob:')) {
      this.triggerQrCodeDownload(this.qrImageUrl, filename);
      return;
    }

    try {
      const response = await fetch(this.qrImageUrl, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`QR image request failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      this.triggerQrCodeDownload(
        objectUrl,
        this.getQrCodeDownloadFilename(this.qrImageUrl, blob.type)
      );
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      console.warn('QR code download fallback used', error);
      this.triggerQrCodeDownload(this.qrImageUrl, filename);
    }
  }

  private async handlePromptPayResponse(
    payment: PromptPayPaymentData | null | undefined
  ): Promise<void> {
    const paymentStatus = this.getPaymentStatus(payment);
    if (this.isSuccessStatus(paymentStatus)) {
      this.completePayment();
      return;
    }

    const qrImageSource = this.getQrImageSource(payment);
    const authorizeUri = this.getAuthorizeUri(payment);
    if (qrImageSource || authorizeUri) {
      this.qrPaymentUrl = authorizeUri ?? '';
      this.qrImageUrl = qrImageSource ?? await this.generateQrImage(authorizeUri ?? '');
      this.referenceNo = this.getTransactionId(payment) ?? this.referenceNo;
      this.isWaitingForConfirmation = false;
      this.startCountdown();

      if (!this.qrImageUrl) {
        this.alertService.error('QR code not found');
      }
      return;
    }

    if (this.isPendingStatus(paymentStatus)) {
      this.alertService.error('QR code not found');
      this.isWaitingForConfirmation = false;
      return;
    }

    this.alertService.error(this.getFailureReason(payment) ?? 'Payment failed');
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
    this.countdownTotalSeconds = 15 * 60;
    this.updateCountdownLabel();

    this.countdownIntervalId = setInterval(() => {
      if (this.countdownTotalSeconds <= 0) {
        this.clearCountdown();
        this.isWaitingForConfirmation = false;
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

  private triggerQrCodeDownload(url: string, filename: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private getQrCodeDownloadFilename(source: string, mimeType = ''): string {
    const reference = this.referenceNo || 'promptpay';
    const safeReference = reference.replace(/[^a-zA-Z0-9_-]/g, '-');
    const extension = this.getQrCodeFileExtension(source, mimeType);
    return `promptpay-qr-${safeReference}.${extension}`;
  }

  private getQrCodeFileExtension(source: string, mimeType: string): 'png' | 'svg' {
    if (
      mimeType.includes('svg') ||
      source.startsWith('data:image/svg') ||
      source.toLowerCase().includes('.svg')
    ) {
      return 'svg';
    }

    return 'png';
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

  private completePayment(): void {
    this.hasRequestedQrCode = false;
    this.paymentIdempotencyKey = '';
    this.isWaitingForConfirmation = false;
    this.alertService.success('Payment success');
    this.router.navigate(['/e-ticket']);
  }

  private isSuccessfulResponse(code: number | null | undefined): boolean {
    return code === 200 || code === 201;
  }

  private getPaymentStatus(
    payment: PromptPayPaymentData | null | undefined
  ): string | undefined {
    if (!payment) {
      return undefined;
    }

    if ('paymentSummary' in payment) {
      return (
        payment.paymentSummary?.status ??
        payment.transactions?.[0]?.status
      );
    }

    return payment.status;
  }

  private getAuthorizeUri(
    payment: PromptPayPaymentData | null | undefined
  ): string | undefined {
    if (!payment) {
      return undefined;
    }

    if ('authorizeUri' in payment && payment.authorizeUri) {
      return payment.authorizeUri;
    }

    if ('transactions' in payment) {
      for (const transaction of payment.transactions ?? []) {
        const gatewayResponse = this.parseGatewayResponse(
          transaction.gatewayResponse
        );
        const gatewayAuthorizeUri = this.pickFirstString(gatewayResponse, [
          'authorize_uri',
          'authorizeUri',
          'authorize_url',
          'authorizeUrl',
        ]);
        if (gatewayAuthorizeUri) {
          return gatewayAuthorizeUri;
        }
      }
    }

    return undefined;
  }

  private getQrImageSource(
    payment: PromptPayPaymentData | null | undefined
  ): string | undefined {
    if (!payment) {
      return undefined;
    }

    if ('transactions' in payment) {
      for (const transaction of payment.transactions ?? []) {
        const gatewayResponse = this.parseGatewayResponse(
          transaction.gatewayResponse
        );
        const qrImageSource = this.extractGatewayQrImageSource(gatewayResponse);
        if (qrImageSource) {
          return qrImageSource;
        }
      }
    }

    return undefined;
  }

  private parseGatewayResponse(
    gatewayResponse: unknown
  ): Record<string, unknown> | null {
    if (!gatewayResponse) {
      return null;
    }

    if (typeof gatewayResponse === 'object' && !Array.isArray(gatewayResponse)) {
      return gatewayResponse as Record<string, unknown>;
    }

    if (typeof gatewayResponse !== 'string') {
      return null;
    }

    try {
      const parsed = JSON.parse(gatewayResponse) as unknown;
      if (typeof parsed === 'string') {
        return this.parseGatewayResponse(parsed);
      }

      return typeof parsed === 'object' && parsed && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  private extractGatewayQrImageSource(
    gatewayResponse: Record<string, unknown> | null
  ): string | undefined {
    if (!gatewayResponse) {
      return undefined;
    }

    const direct = this.pickFirstString(gatewayResponse, [
      'qrCodeUrl',
      'qr_code_url',
      'qrImageUrl',
      'qr_image_url',
      'downloadUri',
      'download_uri',
    ]);
    if (direct) {
      return direct;
    }

    const source = this.asRecord(gatewayResponse['source']);
    const scannableCode = this.asRecord(source?.['scannable_code']);
    const image = this.asRecord(scannableCode?.['image']);

    return this.pickFirstString(image, [
      'download_uri',
      'downloadUri',
      'uri',
      'url',
    ]);
  }

  private pickFirstString(
    source: Record<string, unknown> | null | undefined,
    keys: string[]
  ): string | undefined {
    if (!source) {
      return undefined;
    }

    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private getTransactionId(
    payment: PromptPayPaymentData | null | undefined
  ): string | undefined {
    if (!payment) {
      return undefined;
    }

    if ('transactionId' in payment && payment.transactionId) {
      return payment.transactionId;
    }

    if ('transactions' in payment) {
      return payment.transactions?.[0]?.transactionId;
    }

    return undefined;
  }

  private getFailureReason(
    payment: PromptPayPaymentData | null | undefined
  ): string | undefined {
    if (!payment || !('failureReason' in payment)) {
      return undefined;
    }

    return payment.failureReason;
  }

  private isPendingStatus(status: string | null | undefined): boolean {
    return ['pending', 'unpaid'].includes(
      String(status ?? '').trim().toLowerCase()
    );
  }

  private isSuccessStatus(status: string | null | undefined): boolean {
    return ['success', 'successful', 'paid', 'fully_paid'].includes(
      String(status ?? '').trim().toLowerCase()
    );
  }

  private async generateQrImage(payload: string): Promise<string> {
    try {
      return await QRCode.toDataURL(payload, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
    } catch (error) {
      console.error('Generate PromptPay QR failed', error);
      return '';
    }
  }

  onBack(): void {
    this.back.emit();
  }
}
