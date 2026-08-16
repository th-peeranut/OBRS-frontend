import {
  Component,
  EventEmitter,
  HostListener,
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
import { parsePricePerSeat } from '../../../../shared/lib/trip-format';
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
import { isHandledByBackendMessage } from '../../../../shared/lib/payment-error-codes';

type PaymentTab = 'creditcard' | 'qrcode';
type PromptPayPaymentData = PaymentResponse | PaymentByBookingIdResponse;

@Component({
    selector: 'app-payment-qrcode',
    templateUrl: './payment-qrcode.component.html',
    styleUrl: './payment-qrcode.component.scss',
    standalone: false
})
export class PaymentQrcodeComponent implements OnInit, OnDestroy {
  @Input() activeTab: PaymentTab = 'qrcode';
  /**
   * Route to navigate to on a completed payment. Defaults to the existing
   * `/e-ticket` behavior so every current call site stays byte-identical
   * (design-system §10 "extend, don't fork"). Pass `null` to suppress
   * navigation entirely — e.g. the reschedule dialog embeds this component
   * as an inline step and reacts to `(paymentCompleted)` instead.
   */
  @Input() successRedirect: string[] | null = ['/e-ticket'];
  /**
   * OBRS-415: the default `amountDisplay`/QR-trigger path (`watchAmount()`)
   * derives the total entirely from the seat-booking `scheduleBooking`/
   * `scheduleFilter` NgRx stores, which a parcel booking never populates —
   * left as null-default this would show "0.00" AND never trigger
   * `ensurePromptPayQrCode()` (it only fires when the derived total is > 0),
   * so a parcel customer's QR tab would never even load a QR code. Optional,
   * null-default so every existing call site (seat booking, reschedule/
   * change-stop dialogs) stays byte-identical (design-system §10); when set,
   * `ngOnInit` uses it directly instead of `watchAmount()`. Also forwarded to
   * `<app-payment-summary>`.
   */
  @Input() amountOverride: number | null = null;
  @Output() tabChange = new EventEmitter<PaymentTab>();
  @Output() back = new EventEmitter<void>();
  @Output() paymentCompleted = new EventEmitter<void>();

  amountDisplay = '0.00';
  readonly qrImageAlt = 'PromptPay QR code';
  qrImageUrl = '';
  qrPaymentUrl = '';
  referenceNo = '';
  countdown = '15 : 00';
  /**
   * OBRS-1203 — the iOS fallback. Shows the QR full-screen with a
   * "press and hold to save" hint, because on iOS that gesture is the only way
   * left to get an image into the photo library when the share sheet is
   * unavailable.
   */
  isQrPreviewOpen = false;
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
    if (this.amountOverride != null) {
      this.amountDisplay = this.formatAmount(this.amountOverride);
      if (this.amountOverride > 0) {
        void this.ensurePromptPayQrCode();
      }
      return;
    }
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
    // The preview renders the same `qrImageUrl`; leaving it open would show an
    // empty full-screen dialog over the payment page (OBRS-1203).
    this.isQrPreviewOpen = false;
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
        this.alertService.error(
          this.translate.instant('PAYMENT.ALERT.BOOKING_NOT_FOUND')
        );
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
        this.alertService.error(this.translate.instant('PAYMENT.ALERT.FAILED'));
      }
    } catch (error) {
      this.hasRequestedQrCode = false;
      // OBRS-736: same reasoning as payment-creditcard — the backend already said
      // the amount is above the gateway's per-transaction ceiling and what to do
      // about it, so the generic toast would only contradict it. PromptPay reaches
      // the gateway through processSource, which the ceiling guard covers too.
      if (isHandledByBackendMessage(error)) {
        console.error('Payment request failed', error);
        return;
      }
      this.alertService.error(this.translate.instant('PAYMENT.ALERT.FAILED'));
      console.error('Payment request failed', error);
    } finally {
      this.isSubmittingPayment = false;
    }
  }

  /**
   * OBRS-1203. Every route out of this method used to end at `<a download>`,
   * which iOS ignores — so on an iPhone the button did nothing at all, with no
   * exception to `catch` and therefore no way for the old code to know it had
   * failed. It sits on the payment path with a 15-minute timer running, so
   * "nothing happened" is the one outcome that must be impossible (AC 1).
   *
   * MEASURED FIRST, 2026-08-12 against SIT (real charge
   * `chrg_test_68nlh59vtk9ciwns3ud`): `POST /api/payments` answers with
   * `authorizeUri` and **no** `transactions` array, so `getQrImageSource()`
   * finds nothing and `qrImageUrl` is always the locally generated
   * `data:image/png;base64,…` (5,894 chars) — never an https URL on Omise's
   * origin. That settled the question the card left open at the time: the
   * cross-origin row, where `download` is ignored by *every* browser, was not
   * reachable on this path, so this is an iOS/WKWebView bug and not a
   * pan-platform one.
   *
   * SUPERSEDED 2026-08-14 (OBRS-1351): the backend now forwards Omise's
   * `source.scannable_code.image.download_uri`, so on PromptPay `qrImageUrl` IS
   * an https URL on `api.omise.co` and the cross-origin row is reachable after
   * all. Left standing rather than deleted because the iOS branch above still
   * rests on the measurement.
   *
   * The sentence that stood here until 2026-08-16 — that `downloadQrViaAnchor()`
   * "already handles it" by fetching the image and handing `<a download>` a
   * same-origin `blob:` — was wrong, and OBRS-1378 measured the real thing
   * (real test charge `chrg_test_68p2bd3mu052tx6bz2b`, this exact path run in
   * Chromium from an http origin): `api.omise.co` sends no
   * `Access-Control-Allow-Origin` at all, so that fetch dies at CORS and no
   * blob is ever made. Desktop still downloads — but for a reason outside this
   * file: the `catch` clicks `<a download>` at the cross-origin URL, `download`
   * is ignored as always, and the 302 ends on an S3 object served
   * `Content-Disposition: attachment`, so the browser saves it (228,248 B) and
   * stays on the payment page. The price is that the file arrives as Omise's
   * `qrcode.svg` and not the `promptpay-qr-<ref>.png` computed below, a CORS
   * error is logged on every click, and the download survives only while Omise
   * keeps sending that header. On iOS the same blocked fetch is inside
   * `buildQrFile()`, so it returns null and the share sheet is never offered —
   * the full-screen preview is what an iPhone gets now. OBRS-1379 (backend
   * proxies the image, making it same-origin) is what removes all of it.
   *
   * Order (owner's decision of 2026-08-10, option 3 — feature-detect):
   *   1. iOS + Web Share with files → the share sheet, the only route on iOS
   *      that reaches "Save Image".
   *   2. iOS without it (older Safari, some in-app WebViews) → the QR
   *      full-screen with "press and hold to save". One manual step, but
   *      visible, which is the whole point.
   *   3. Everything else → the original `<a download>`, byte-identical, so
   *      desktop and Android keep the behaviour they already have (AC 2).
   */
  async downloadQrCode(): Promise<void> {
    if (!this.qrImageUrl) {
      return;
    }

    const filename = this.getQrCodeDownloadFilename(this.qrImageUrl);

    if (this.isIosLike()) {
      const file = await this.buildQrFile(filename);

      if (file && this.canShareQrFile(file)) {
        try {
          await navigator.share({
            files: [file],
            title: this.translate.instant('PAYMENT.QR.SHARE_TITLE'),
          });
          return;
        } catch (error) {
          // Dismissing the share sheet is a decision, not a failure — an error
          // toast here would punish the user for changing their mind (AC 4).
          if (this.isShareAbort(error)) {
            return;
          }
          console.warn('QR share failed, falling back to the full-screen preview', error);
        }
      }

      this.openQrPreview();
      return;
    }

    await this.downloadQrViaAnchor(filename);
  }

  openQrPreview(): void {
    this.isQrPreviewOpen = true;
  }

  /** Escape closes it, as a dialog must. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isQrPreviewOpen) {
      this.closeQrPreview();
    }
  }

  closeQrPreview(): void {
    this.isQrPreviewOpen = false;
  }

  /**
   * iOS is the platform, not the browser: every browser on it (Safari, Chrome,
   * and the LINE / Facebook in-app WebViews) runs WKWebView, so the user agent
   * is the only signal there is. iPadOS 13+ reports itself as `MacIntel`, which
   * is what the touch-point check is for — without it an iPad silently takes
   * the desktop branch and the bug survives on it.
   */
  private isIosLike(): boolean {
    if (typeof navigator === 'undefined') {
      return false;
    }

    const userAgent = navigator.userAgent ?? '';
    const isIPadOs =
      navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
    return /iPad|iPhone|iPod/.test(userAgent) || isIPadOs;
  }

  private async buildQrFile(filename: string): Promise<File | null> {
    if (typeof File !== 'function') {
      return null;
    }

    // SYNCHRONOUS on the path that production actually takes, and that is the
    // point rather than an optimisation: Safari requires navigator.share() to
    // run inside the click's transient activation, and an `await` before it can
    // spend that activation and earn a NotAllowedError instead of a share sheet.
    // The measurement on 2026-08-12 showed `qrImageUrl` is always a data: URL
    // here, so on the only route a customer takes, the tap and the share are
    // separated by a microtask and nothing else — no network round-trip, which
    // is the part that actually spends the activation.
    const decoded = this.decodeDataUrl(this.qrImageUrl, filename);
    if (decoded) {
      return decoded;
    }

    if (typeof fetch !== 'function') {
      return null;
    }

    try {
      const response = await fetch(this.qrImageUrl);
      if (!response.ok) {
        throw new Error(`QR image request failed with status ${response.status}`);
      }

      const blob = await response.blob();
      return new File([blob], filename, { type: blob.type || 'image/png' });
    } catch (error) {
      // Deliberately not user-facing on its own: the caller still opens the
      // full-screen preview, so the QR stays saveable even when this fails.
      console.warn('Could not turn the QR into a shareable file', error);
      return null;
    }
  }

  /** `data:<mime>;base64,<payload>` → File, with no await anywhere. */
  private decodeDataUrl(source: string, filename: string): File | null {
    const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(source);
    if (!match || !match[2]) {
      return null;
    }

    try {
      const binary = atob(match[3]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new File([bytes], filename, { type: match[1] || 'image/png' });
    } catch (error) {
      console.warn('Could not decode the QR data URL', error);
      return null;
    }
  }

  private canShareQrFile(file: File): boolean {
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };

    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') {
      return false;
    }

    try {
      return nav.canShare({ files: [file] });
    } catch {
      return false;
    }
  }

  private isShareAbort(error: unknown): boolean {
    return (error as { name?: string } | null)?.name === 'AbortError';
  }

  private async downloadQrViaAnchor(filename: string): Promise<void> {
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
        this.alertService.error(
        this.translate.instant('PAYMENT.ALERT.QR_UNAVAILABLE')
      );
      }
      return;
    }

    if (this.isPendingStatus(paymentStatus)) {
      this.alertService.error(
        this.translate.instant('PAYMENT.ALERT.QR_UNAVAILABLE')
      );
      this.isWaitingForConfirmation = false;
      return;
    }

    // The gateway's own failure wording (English, and phrased in Omise's terms) is
    // support material, not a passenger-facing message — see the same call in
    // payment-creditcard.component.ts (OBRS-569).
    console.error('PromptPay payment failed', this.getFailureReason(payment));
    this.alertService.error(this.translate.instant('PAYMENT.ALERT.FAILED'));
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
      items?.reduce((total, item) => total + parsePricePerSeat(item?.pricePerSeat), 0) ??
      0
    );
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
    this.alertService.success(this.translate.instant('PAYMENT.ALERT.SUCCESS'));
    this.paymentCompleted.emit();
    if (this.successRedirect) {
      this.router.navigate(this.successRedirect);
    }
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

    // OBRS-1351: the create-payment response carries Omise's own QR here — it has no
    // `transactions` array, so before this branch existed the loop below could never see
    // one and every PromptPay QR was drawn locally from the authorize URL.
    if ('qrImageUrl' in payment && payment.qrImageUrl) {
      return payment.qrImageUrl;
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

    // proto-key-ok: guarded twice over, neither in a shape the gate can read. `keys` is
    // always a hardcoded literal list at every call site (e.g. ['downloadUri','uri',
    // 'url']), so no runtime string ever reaches this index; and the `typeof value ===
    // 'string'` below rejects the Object function even if one did.
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
