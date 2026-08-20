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
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import QRCode from 'qrcode';
import { environment } from '../../../../../environments/environment';
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
  /** OBRS-1379: the QR bytes we fetched, kept so the download and the iOS share sheet need no
   * second request — on iOS a request inside the tap can spend the transient activation. */
  private qrBlob: Blob | null = null;
  private qrObjectUrl = '';
  private hasRequestedQrCode = false;
  private paymentIdempotencyKey = '';
  private countdownTotalSeconds = 15 * 60;
  private countdownIntervalId?: ReturnType<typeof setInterval>;

  constructor(
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
      if (this.amountOverride <= 0) {
        return;
      }
    }
    void this.ensurePromptPayQrCode();
  }

  ngOnDestroy(): void {
    this.clearCountdown();
    this.releaseQrObjectUrl();
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
    this.releaseQrObjectUrl();
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
   * SUPERSEDED 2026-08-14 (OBRS-1351): the backend forwarded Omise's
   * `source.scannable_code.image.download_uri`, so on PromptPay `qrImageUrl`
   * became an https URL on `api.omise.co` and the cross-origin row was
   * reachable after all. Left standing rather than deleted because the iOS
   * branch above still rests on the 2026-08-12 measurement.
   *
   * SUPERSEDED AGAIN 2026-08-16 (OBRS-1379): `qrImageUrl` is a **same-origin
   * `blob:`** now — the backend serves the image at `/api/…/payments/<id>/qr`
   * and `loadQrImage()` fetches it — so every cross-origin problem below is
   * gone at the source rather than handled. What OBRS-1378 measured on the way
   * here, and what this file must not drift back into: `api.omise.co` sends no
   * `Access-Control-Allow-Origin` at all, so the `fetch` in
   * `downloadQrViaAnchor()` died at CORS on every click; desktop still saved a
   * file only because the `catch` clicked `<a download>` at the cross-origin
   * URL and the 302 ended on an S3 object served `Content-Disposition:
   * attachment` — Omise's `qrcode.svg` (228,248 B), never the
   * `promptpay-qr-<ref>` computed below, with a CORS error logged each time and
   * the whole thing resting on a header Omise never promised. And on iOS the
   * same blocked fetch was inside `buildQrFile()`, so it returned null and the
   * share sheet — the reason OBRS-1203 exists — was never offered at all.
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

    // OBRS-1379: a blob: URL says nothing about what is inside it, so the extension comes from
    // the blob's own MIME type — Omise serves this QR as SVG, and a .png holding SVG is a file
    // some viewers refuse to open.
    const filename = this.getQrCodeDownloadFilename(this.qrImageUrl, this.qrBlob?.type ?? '');

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
    // OBRS-1379: on PromptPay the bytes are already here — `loadQrImage()`
    // fetched them when the QR was drawn — so this is a File constructor and
    // nothing else. That restores the share sheet OBRS-1203 built, which
    // OBRS-1351 took away without meaning to: the fetch below was the only
    // route left and CORS refused it, so this returned null every time.
    if (this.qrBlob) {
      return new File([this.qrBlob], filename, {
        type: this.qrBlob.type || 'image/png',
      });
    }

    // Card 3DS and the redirect wallets still get a locally drawn data: QR.
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
    this.applyServerAmount(payment);
    const paymentStatus = this.getPaymentStatus(payment);
    if (this.isSuccessStatus(paymentStatus)) {
      this.completePayment();
      return;
    }

    const qrImageSource = this.getQrImageSource(payment);
    const authorizeUri = this.getAuthorizeUri(payment);
    if (qrImageSource || authorizeUri) {
      this.qrPaymentUrl = authorizeUri ?? '';
      this.qrImageUrl = qrImageSource
        ? await this.loadQrImage(qrImageSource)
        : await this.generateQrImage(authorizeUri ?? '');
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

  /**
   * OBRS-1379. The backend answers with OUR path (`/api/…/payments/<id>/qr`), so the image is
   * fetched here and bound as a `blob:` instead of pointed at with `<img src>`.
   *
   * Three things fall out of that, and all three are the point rather than a side effect:
   * `img-src` needs no Omise origin (it needs `blob:`, which it already has); the guest lane's
   * token can travel in a header, which an `<img>` cannot send; and the bytes are HERE, so the
   * download button names the file and the iOS share sheet has a File to share without a
   * network round-trip inside the tap.
   *
   * Returns `''` when the fetch fails — the caller turns that into the QR_UNAVAILABLE alert,
   * which is honest. It must not fall back to `<img src="/api/…">`: relative on SIT means the
   * Netlify origin, which serves no API, and even on prod it would drop the guest token.
   *
   * OBRS-1301 AC-3. What used to be "anything that is not our path is passed through
   * untouched" now passes through only what carries NO origin — `data:` (the locally drawn
   * fallback) and `blob:` (already fetched). A URL with an origin of its own is refused,
   * because `img-src` names no gateway host: OBRS-1379 removed `api.omise.co` and the S3
   * bucket its `download_uri` 302s to, in the same commit that made the QR same-origin. Bind
   * one anyway and the browser drops the load, `onQrError()` clears the frame, and the
   * customer is left with a blank square on the payment page with a 15-minute timer running
   * and nothing said. Returning `''` takes the same QR_UNAVAILABLE path as a failed fetch, so
   * the failure gets the same message whichever layer refused it — loud instead of silent.
   * Both arms are measured under a real enforcing header by
   * `e2e/tests/obrs-1301-qr-img-src.spec.ts`; re-allowing a remote QR means adding its origin
   * to `netlify.toml`, `deploy/prod/Caddyfile` and the inventory FIRST, and that spec is what
   * will tell you.
   */
  private async loadQrImage(source: string): Promise<string> {
    if (!source.startsWith('/api/')) {
      if (source.startsWith('data:') || source.startsWith('blob:')) {
        return source;
      }

      console.error(
        'Refusing to render the PromptPay QR: the URL has an origin of its own and img-src ' +
          'names no such origin, so it would be blocked (OBRS-1301)',
        source
      );
      return '';
    }

    try {
      const blob = await firstValueFrom(
        this.paymentService.getQrImage(source).pipe(take(1))
      );
      this.releaseQrObjectUrl();
      this.qrBlob = blob;
      this.qrObjectUrl = URL.createObjectURL(blob);
      return this.qrObjectUrl;
    } catch (error) {
      console.error('Could not load the PromptPay QR image', error);
      return '';
    }
  }

  private releaseQrObjectUrl(): void {
    if (this.qrObjectUrl) {
      URL.revokeObjectURL(this.qrObjectUrl);
      this.qrObjectUrl = '';
    }
    this.qrBlob = null;
  }

  /**
   * OBRS-1384. The number under the QR is what the SERVER put on the charge this
   * response created, not a product of two NgRx stores.
   *
   * What it replaced multiplied `scheduleBooking`'s fares by
   * `scheduleFilter.passengerInfo` — the headcount typed on the SEARCH page, which
   * never hears about the OPEN-seating +/- stepper on /passenger-info (OBRS-1226).
   * A customer who stepped 1 -> 2 was therefore shown ONE seat's price at the exact
   * second they were about to scan, while the bank app asked for the real total.
   *
   * Same rule OBRS-391 took for the OmiseCard `submitLabel` — read what is owed from
   * the server — but from THIS response rather than from
   * `GET /api/private/bookings/{id}/payments` as that card did. That endpoint sits
   * under `/api/private/**`, which WebSecurityConfig marks `.authenticated()`, and
   * guest checkout (OBRS-858) pays for a booking made with no account at all: polling
   * it here would 401 for every guest and leave them with neither an amount nor a QR.
   * The create-payment response is the same server's answer on BOTH lanes, and it is
   * the amount that QR was issued for, so there is nothing left to disagree about.
   */
  private applyServerAmount(
    payment: PromptPayPaymentData | null | undefined
  ): void {
    // `amountOverride` is the caller saying "this is the amount" (OBRS-415, the
    // parcel lane). Honour it rather than second-guessing it from the charge.
    if (this.amountOverride != null) {
      return;
    }

    const raw = !payment
      ? undefined
      : 'paymentSummary' in payment
        ? payment.paymentSummary?.outstandingAmount
        : payment.amount;

    const amount = Number(raw);
    if (Number.isFinite(amount)) {
      this.amountDisplay = this.formatAmount(amount);
    }
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

    // OBRS-1351: the create-payment response carries the QR here — it has no `transactions`
    // array, so before this branch existed the loop below could never see one and every
    // PromptPay QR was drawn locally from the authorize URL.
    // OBRS-1379: what it carries is now OUR path (`/api/…/payments/<id>/qr`), not Omise's
    // download URL; `loadQrImage()` turns it into a blob:. The loop below is the legacy
    // gateway-response shape and still yields an Omise URL — no caller reaches it with that
    // shape today, and under the current CSP such a URL would not render.
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
