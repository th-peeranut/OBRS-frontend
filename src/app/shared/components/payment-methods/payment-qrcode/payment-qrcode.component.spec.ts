import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { BookingService } from '../../../../services/booking/booking.service';
import { PaymentService } from '../../../../services/payment/payment.service';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  PaymentByBookingIdResponse,
  PaymentResponse,
} from '../../../../shared/interfaces/payment.interface';
import { PaymentQrcodeComponent } from './payment-qrcode.component';

/**
 * OBRS-298: EOverallPaymentStatus grew a 7th code, refunded_partial (booking
 * still live, money fully collected, part since refunded — nothing
 * outstanding). payment-result.component.ts and payment-creditcard.component.ts
 * both fall back to `hasSuccessfulTransaction` (a `.some()` across every
 * transaction) when `paymentSummary.status` isn't the literal 'fully_paid',
 * so refunded_partial still resolves correctly there. This component's
 * private `getPaymentStatus()` does NOT do that: for the `PaymentByBookingIdResponse`
 * shape it returns `payment.paymentSummary?.status ?? payment.transactions?.[0]?.status`
 * — since `??` only falls through on null/undefined, a non-empty
 * `paymentSummary.status` (any value, including 'refunded_partial') is
 * returned as-is and the transactions array is never consulted. That value
 * then goes through `isSuccessStatus()`, whose literal list
 * (success/successful/paid/fully_paid) does not include 'refunded_partial'.
 *
 * REACHABILITY — read this before "fixing" anything below. The asymmetry is
 * real in the type system but NOT reachable in production. The sole caller of
 * `handlePromptPayResponse` is the createPayment/createMockPayment branch
 * (payment-qrcode.component.ts:188) — i.e. the response to CREATING a payment,
 * never `getBookingPayments`. A payment that was just created cannot carry a
 * booking-level summary of 'refunded_partial' (that state requires an earlier
 * settled payment and a subsequent refund), and the shape createPayment
 * actually returns is `PaymentResponse`, which carries `status` directly and
 * so never even enters the `'paymentSummary' in payment` branch.
 *
 * These specs therefore PIN CURRENT BEHAVIOUR on a defensive branch; they are
 * not evidence of a live defect, and OBRS-298 deliberately left this R0
 * payment-flow code untouched rather than "fixing" an unreachable path. If a
 * future change ever routes a getBookingPayments-shaped payload here, these
 * specs are what will tell you the `??` short-circuit matters.
 *
 * The component is a plain, constructor-injected class with no standalone
 * decorators, so it is instantiated directly (bypassing TestBed/template
 * compilation) to reach the private `handlePromptPayResponse` method under
 * test — same idiom as payment-result.component.spec.ts /
 * payment-creditcard.component.spec.ts (OBRS-177).
 */
describe('PaymentQrcodeComponent - refunded_partial payment summary (OBRS-298)', () => {
  let component: PaymentQrcodeComponent;
  let alertService: jasmine.SpyObj<AlertService>;

  beforeEach(() => {
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    const bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getActiveBookingId',
    ]);
    const paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', [
      'getBookingPayments',
      'createPayment',
      'createMockPayment',
    ]);
    alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'info',
      'confirm',
    ]);
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string) => key);

    component = new PaymentQrcodeComponent(
      router,
      bookingService,
      paymentService,
      alertService,
      translate
    );
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  const invokeHandlePromptPayResponse = (
    payment: PaymentByBookingIdResponse | null | undefined
  ): Promise<void> =>
    (
      component as unknown as {
        handlePromptPayResponse: (
          p: PaymentByBookingIdResponse | null | undefined
        ) => Promise<void>;
      }
    ).handlePromptPayResponse(payment);

  it(
    'pins the defensive branch: a refunded_partial paymentSummary is not treated as ' +
      'success here, because getPaymentStatus() short-circuits the `??` on a non-null ' +
      'paymentSummary.status and never consults the transactions array — unlike ' +
      'payment-result/payment-creditcard\'s hasSuccessfulTransaction fallback. ' +
      'NOT reachable in production (see the reachability note at the top of this file); ' +
      'production code intentionally left untouched.',
    async () => {
      const payment: PaymentByBookingIdResponse = {
        bookingId: 10,
        paymentSummary: {
          totalAmount: '100',
          paidAmount: '100',
          outstandingAmount: '0',
          refundedAmount: '30',
          currency: 'THB',
          status: 'refunded_partial',
        },
        transactions: [
          {
            paymentMethod: 'qr_promptpay',
            amount: 100,
            currency: 'THB',
            status: 'paid',
          },
        ],
      };

      await invokeHandlePromptPayResponse(payment);

      // Not treated as confirmed: paymentCompleted never fires and no
      // success alert is shown, despite the booking having nothing
      // outstanding.
      expect(alertService.success).not.toHaveBeenCalled();
      // With no qrImageSource/authorizeUri anywhere in this payload (no
      // gatewayResponse on the transaction, no root authorizeUri — this
      // shape has none), the component falls through to its generic
      // failure path and surfaces a "payment failed" alert to staff/the
      // customer even though the booking is actually fully settled.
      expect(alertService.error).toHaveBeenCalled();
    }
  );

  it(
    'DOES recognize success when a root-level authorizeUri/QR is present alongside a ' +
      'refunded_partial summary (the shape createPayment() actually returns in production ' +
      'today is PaymentResponse, which carries `status` directly, not `paymentSummary` — ' +
      'see payment.interface.ts) — included so the fix, if the owner asks for one, has a ' +
      'green case to compare against',
    async () => {
      const payment: PaymentByBookingIdResponse = {
        bookingId: 10,
        paymentSummary: {
          totalAmount: '100',
          paidAmount: '100',
          outstandingAmount: '0',
          refundedAmount: '30',
          currency: 'THB',
          status: 'refunded_partial',
        },
        transactions: [
          {
            paymentMethod: 'qr_promptpay',
            amount: 100,
            currency: 'THB',
            status: 'paid',
            gatewayResponse: JSON.stringify({
              source: { scannable_code: { image: { download_uri: 'https://example.test/qr.png' } } },
            }),
          },
        ],
      };

      await invokeHandlePromptPayResponse(payment);

      // Not "success" (isSuccessStatus still says no), and still not the generic
      // PAYMENT.ALERT.FAILED path — a scannable image WAS found in the transaction's
      // gateway response, which is what this case exists to pin.
      //
      // OBRS-1301 AC-3 changed what happens to that image. It used to be bound straight
      // into `<img src>`; `img-src` names no such origin, so the browser dropped it and
      // `onQrError()` emptied the frame without a word. `loadQrImage()` refuses any URL
      // carrying an origin of its own now, which turns the same outcome into the
      // QR_UNAVAILABLE message the failed-fetch path already used.
      expect(alertService.success).not.toHaveBeenCalled();
      expect(alertService.error).toHaveBeenCalledWith('PAYMENT.ALERT.QR_UNAVAILABLE');
      expect((component as any).qrImageUrl).toBe('');
    }
  );
});

/**
 * OBRS-736: PromptPay reaches Omise through `OmiseChargeProcessor.processSource`,
 * which the backend's per-transaction ceiling guard covers exactly as it covers
 * the card path — so this component needs the same "do not talk over the backend's
 * message" branch, and the same pair of tests proving it is narrow.
 *
 * Same direct-instantiation idiom as the block above; `ensurePromptPayQrCode` is
 * private, so it is reached through a cast rather than made public for a test.
 */
describe('PaymentQrcodeComponent - gateway ceiling refusal (OBRS-736)', () => {
  let component: PaymentQrcodeComponent;
  let alertService: jasmine.SpyObj<AlertService>;
  let paymentService: jasmine.SpyObj<PaymentService>;

  beforeEach(() => {
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    const bookingService = jasmine.createSpyObj<BookingService>(
      'BookingService',
      ['getActiveBookingId']
    );
    bookingService.getActiveBookingId.and.returnValue(10);
    paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', [
      'getBookingPayments',
      'createPayment',
      'createMockPayment',
    ]);
    alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'info',
      'confirm',
    ]);
    const translate = jasmine.createSpyObj<TranslateService>(
      'TranslateService',
      ['instant']
    );
    translate.instant.and.callFake((key: string) => key);

    component = new PaymentQrcodeComponent(
      router,
      bookingService,
      paymentService,
      alertService,
      translate
    );
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  const requestQr = (): Promise<void> =>
    (
      component as unknown as {
        ensurePromptPayQrCode: (show?: boolean) => Promise<void>;
      }
    ).ensurePromptPayQrCode();

  const rejectWith = (errorCode: string): void => {
    paymentService.createPayment.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { errorCode, message: 'backend wording' },
          })
      ) as unknown as ReturnType<PaymentService['createPayment']>
    );
  };

  it('stays silent when the backend refuses the amount as above the gateway ceiling', async () => {
    rejectWith('PAYMENT_AMOUNT_EXCEEDS_GATEWAY_LIMIT');

    await requestQr();

    expect(alertService.error).not.toHaveBeenCalled();
  });

  /**
   * OBRS-1352. Measured on prod, booking 3 of 13 Aug 2026: the charge Omise accepted at
   * 11:43:12 sat `pending` with `failure_code` null until the hold expired at 11:57:34,
   * and the passenger filed two usability reports in between. They quoted this toast back
   * — "ชำระเงินไม่สำเร็จ กรุณาตรวจสอบข้อมูลบัตรหรือยอดเงินคงเหลือ" — for a refusal the
   * gateway never made, prescribing a retry the guard rejects for the full 15 minutes.
   */
  it('stays silent when the backend refuses a retry because the first charge is still pending', async () => {
    rejectWith('PAYMENT_IN_PROGRESS');

    await requestQr();

    expect(alertService.error).not.toHaveBeenCalled();
  });

  it('still reports every OTHER backend failure — the must-NOT half', async () => {
    rejectWith('GATEWAY_ERROR');

    await requestQr();

    expect(alertService.error).toHaveBeenCalledWith('PAYMENT.ALERT.FAILED');
  });
});

/**
 * OBRS-1203 — "Download QR" must never be a no-op.
 *
 * The bug was silent by construction: every branch ended at `<a download>`,
 * which iOS ignores WITHOUT throwing, so there was nothing for a `catch` to see
 * and nothing a test could have asserted about the old code beyond "it called
 * the anchor". These specs therefore assert the ROUTING — which of the three
 * exits a click takes — because that is the whole of the fix.
 *
 * `qrImageUrl` is a real (tiny) data: URL rather than a stub, so `buildQrFile()`
 * runs its actual `fetch` → `blob()` → `new File()` path. That matches what was
 * MEASURED on SIT on 2026-08-12: `POST /api/payments` returns no `transactions`
 * array, so `qrImageUrl` is always the locally generated `data:image/png` and
 * never an https URL on Omise's origin.
 */
describe('PaymentQrcodeComponent - saving the QR on iOS (OBRS-1203)', () => {
  /** 1x1 transparent PNG. Small enough to inline, real enough to fetch(). */
  const DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const IPHONE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const DESKTOP_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  let component: PaymentQrcodeComponent;
  let alertService: jasmine.SpyObj<AlertService>;
  let anchorDownload: jasmine.Spy;

  /** Restores every navigator patch this file makes, in reverse order. */
  const undo: Array<() => void> = [];

  const patchNavigator = (key: string, value: unknown): void => {
    const target = window.navigator as unknown as Record<string, unknown>;
    const existing = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { value, configurable: true, writable: true });
    undo.push(() => {
      if (existing) {
        Object.defineProperty(target, key, existing);
      } else {
        delete target[key];
      }
    });
  };

  const useUserAgent = (ua: string): void => patchNavigator('userAgent', ua);

  /** The iOS 15+ shape: both `share` and `canShare`, canShare true for files. */
  const withWorkingShareSheet = (share: jasmine.Spy): void => {
    patchNavigator('canShare', () => true);
    patchNavigator('share', share);
  };

  /**
   * The WKWebView that has neither — removed EXPLICITLY rather than left alone,
   * because the Chrome that runs this suite ships both. "Just don't patch them"
   * would exercise the real share sheet, fail on the missing user gesture, and
   * land on the preview anyway: green for entirely the wrong reason.
   */
  const withoutShareSheet = (): void => {
    patchNavigator('canShare', undefined);
    patchNavigator('share', undefined);
  };

  beforeEach(() => {
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    const bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getActiveBookingId',
    ]);
    const paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', [
      'getBookingPayments',
      'createPayment',
      'createMockPayment',
    ]);
    alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'info',
      'confirm',
    ]);
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string) => key);

    component = new PaymentQrcodeComponent(
      router,
      bookingService,
      paymentService,
      alertService,
      translate
    );
    component.qrImageUrl = DATA_URL;

    // The anchor is the one exit whose EFFECT is invisible from here (that is
    // the bug), so it is spied rather than executed.
    anchorDownload = spyOn(
      component as unknown as { triggerQrCodeDownload: (u: string, f: string) => void },
      'triggerQrCodeDownload'
    );
  });

  afterEach(() => {
    while (undo.length) {
      undo.pop()!();
    }
    component.ngOnDestroy();
  });

  it('AC 1 + 4: on iOS with a working share sheet, the QR is handed to navigator.share as a FILE — not to <a download>', async () => {
    useUserAgent(IPHONE_UA);
    const share = jasmine.createSpy('share').and.resolveTo(undefined);
    withWorkingShareSheet(share);

    await component.downloadQrCode();

    expect(share).toHaveBeenCalledTimes(1);
    const shared = share.calls.mostRecent().args[0] as { files: File[] };
    expect(shared.files.length).toBe(1);
    expect(shared.files[0] instanceof File).toBeTrue();
    expect(shared.files[0].name).toMatch(/^promptpay-qr-.*\.png$/);
    expect(anchorDownload).not.toHaveBeenCalled();
    expect(component.isQrPreviewOpen).toBeFalse();
    expect(alertService.error).not.toHaveBeenCalled();
  });

  it('AC 1 + 4: on iOS with NO canShare (older Safari / in-app WebView) the full-screen preview opens, so the click is never silent', async () => {
    useUserAgent(IPHONE_UA);
    withoutShareSheet();

    await component.downloadQrCode();

    expect(component.isQrPreviewOpen).toBeTrue();
    expect(anchorDownload).not.toHaveBeenCalled();
  });

  it('AC 4: cancelling the share sheet is not an error — nothing is shown, and the preview does NOT open behind it', async () => {
    useUserAgent(IPHONE_UA);
    const abort = new Error('user cancelled');
    abort.name = 'AbortError';
    withWorkingShareSheet(jasmine.createSpy('share').and.rejectWith(abort));

    await component.downloadQrCode();

    expect(alertService.error).not.toHaveBeenCalled();
    expect(component.isQrPreviewOpen).toBeFalse();
    expect(anchorDownload).not.toHaveBeenCalled();
  });

  it('AC 1: a share that fails for a REAL reason still leaves the user with a saveable QR', async () => {
    useUserAgent(IPHONE_UA);
    withWorkingShareSheet(
      jasmine.createSpy('share').and.rejectWith(new Error('NotAllowedError: no user gesture'))
    );

    await component.downloadQrCode();

    expect(component.isQrPreviewOpen).toBeTrue();
  });

  it('AC 2 (the control): desktop keeps the original <a download> behaviour, and no preview appears', async () => {
    useUserAgent(DESKTOP_UA);
    // Desktop Chrome on Windows DOES implement canShare for files; the point of
    // this case is that iOS-gating means it is never consulted here.
    withWorkingShareSheet(jasmine.createSpy('share').and.resolveTo(undefined));

    await component.downloadQrCode();

    expect(anchorDownload).toHaveBeenCalledTimes(1);
    expect(anchorDownload.calls.mostRecent().args[0]).toBe(DATA_URL);
    expect(component.isQrPreviewOpen).toBeFalse();
  });

  it('an iPad on iPadOS 13+ is iOS too — it reports MacIntel, and taking the desktop branch there is how this bug survives an "iOS is fixed" claim', async () => {
    useUserAgent(DESKTOP_UA.replace('Windows NT 10.0; Win64; x64', 'Macintosh; Intel Mac OS X 10_15_7'));
    patchNavigator('platform', 'MacIntel');
    patchNavigator('maxTouchPoints', 5);
    withoutShareSheet();

    await component.downloadQrCode();

    expect(component.isQrPreviewOpen).toBeTrue();
    expect(anchorDownload).not.toHaveBeenCalled();
  });

  it('a broken QR image closes the preview instead of leaving an empty dialog over the payment page', () => {
    component.isQrPreviewOpen = true;

    component.onQrError();

    expect(component.isQrPreviewOpen).toBeFalse();
    expect(component.qrImageUrl).toBe('');
  });
});

/**
 * OBRS-1203 — the two things the first cut of the fix got wrong, pinned so they
 * cannot come back.
 */
describe('PaymentQrcodeComponent - the QR preview dialog (OBRS-1203)', () => {
  const DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  let component: PaymentQrcodeComponent;

  beforeEach(() => {
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    const bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getActiveBookingId',
    ]);
    const paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', [
      'getBookingPayments',
      'createPayment',
      'createMockPayment',
    ]);
    const alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'info',
      'confirm',
    ]);
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string) => key);

    component = new PaymentQrcodeComponent(
      router,
      bookingService,
      paymentService,
      alertService,
      translate
    );
    component.qrImageUrl = DATA_URL;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('decodes the data: URL with NO await, so navigator.share() still runs inside the click that opened it — Safari answers a spent user gesture with NotAllowedError, not a share sheet', () => {
    const file = (
      component as unknown as {
        decodeDataUrl: (source: string, filename: string) => File | null;
      }
    ).decodeDataUrl(DATA_URL, 'promptpay-qr-test.png');

    // Synchronous by construction: no promise is returned and there is nothing
    // to await. If this ever becomes a Promise, the share sheet is at risk.
    expect(file instanceof File).toBeTrue();
    expect(file!.type).toBe('image/png');
    expect(file!.size).toBeGreaterThan(0);
    expect(file!.name).toBe('promptpay-qr-test.png');
  });

  it('returns null for a non-data: source, so the http branch still falls through to fetch()', () => {
    const file = (
      component as unknown as {
        decodeDataUrl: (source: string, filename: string) => File | null;
      }
    ).decodeDataUrl('https://api.omise.co/qr.png', 'promptpay-qr-test.png');

    expect(file).toBeNull();
  });

  it('Escape closes the preview — it is a dialog, and a dialog that traps the customer on the payment page is worse than the bug', () => {
    component.openQrPreview();

    component.onEscape();

    expect(component.isQrPreviewOpen).toBeFalse();
  });

  it('Escape does nothing when the preview is not open', () => {
    component.onEscape();

    expect(component.isQrPreviewOpen).toBeFalse();
  });
});

/**
 * OBRS-1351. The QR customers were shown on prod encoded
 * `https://pay.omise.co/payments/pay2_.../authorize` — a URL, decoded out of the live
 * page with @zxing on 2026-08-14 — because the backend never forwarded Omise's own
 * `scannable_code` and this component fell back to drawing `authorizeUri` itself. A QR of
 * a URL is not an EMVCo payload, so no banking app could pay it: 0 of 4 PromptPay charges
 * on prod ever reached `paid`.
 *
 * The two cases below are the fix and the path it must not break. The first pins that a
 * forwarded `qrImageUrl` is rendered AS GIVEN — an assertion on the exact string, because
 * "some QR appeared" is precisely the bug: the old code also produced one.
 */
describe('PaymentQrcodeComponent - Omise forwards its own PromptPay QR (OBRS-1351)', () => {
  let component: PaymentQrcodeComponent;
  let alertService: jasmine.SpyObj<AlertService>;
  let paymentService: jasmine.SpyObj<PaymentService>;

  beforeEach(() => {
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    const bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getActiveBookingId',
    ]);
    paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', [
      'getBookingPayments',
      'createPayment',
      'createMockPayment',
      'getQrImage',
    ]);
    alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'info',
      'confirm',
    ]);
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string) => key);

    component = new PaymentQrcodeComponent(
      router,
      bookingService,
      paymentService,
      alertService,
      translate
    );
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  const invoke = (payment: PaymentResponse): Promise<void> =>
    (
      component as unknown as {
        handlePromptPayResponse: (p: PaymentResponse) => Promise<void>;
      }
    ).handlePromptPayResponse(payment);

  const pendingPromptPay = (extra: Partial<PaymentResponse>): PaymentResponse => ({
    id: 1,
    bookingId: 3,
    status: 'pending',
    paymentMethod: 'qr_promptpay',
    amount: '200.00',
    currency: 'THB',
    transactionId: 'chrg_test_obrs1351',
    authorizeUri: 'https://pay.omise.co/payments/pay2_test/authorize',
    ...extra,
  });

  /**
   * OBRS-1379 changed what "forwarded" means: the backend answers with OUR path, the component
   * fetches it and binds the blob. Asserted on both halves — the exact path requested AND that
   * what lands in `qrImageUrl` is a blob: — because either half alone is a passing test over a
   * broken page: a request nobody renders, or a QR whose bytes came from somewhere else.
   */
  it('fetches the QR from our own endpoint and renders the blob, never an Omise URL', async () => {
    const blob = new Blob(['<svg/>'], { type: 'image/svg+xml' });
    paymentService.getQrImage.and.returnValue(of(blob));

    await invoke(pendingPromptPay({ qrImageUrl: '/api/payments/1/qr' }));

    expect(paymentService.getQrImage).toHaveBeenCalledWith('/api/payments/1/qr');
    expect(component.qrImageUrl.startsWith('blob:')).toBeTrue();
    expect(component.qrImageUrl).not.toContain('omise');
    // The authorize URL is still kept: it is where "I have paid" navigates to.
    expect(component.qrPaymentUrl).toBe('https://pay.omise.co/payments/pay2_test/authorize');
    expect(alertService.error).not.toHaveBeenCalled();
  });

  /**
   * The failure must be visible. Falling back to `<img src="/api/…">` would look like it worked
   * in a unit test and load nothing on SIT, where that path resolves against Netlify — and would
   * drop the guest token even on prod, where the origin is right.
   */
  it('shows QR_UNAVAILABLE and renders nothing when our endpoint fails', async () => {
    paymentService.getQrImage.and.returnValue(throwError(() => new Error('404')));

    await invoke(pendingPromptPay({ qrImageUrl: '/api/payments/1/qr' }));

    expect(component.qrImageUrl).toBe('');
    expect(alertService.error).toHaveBeenCalledWith('PAYMENT.ALERT.QR_UNAVAILABLE');
  });

  it('still falls back to a locally drawn QR when no qrImageUrl is forwarded, so card 3DS and the redirect wallets keep working', async () => {
    await invoke(pendingPromptPay({}));

    expect(component.qrImageUrl.startsWith('data:image')).toBeTrue();
    expect(paymentService.getQrImage).not.toHaveBeenCalled();
    expect(alertService.error).not.toHaveBeenCalled();
  });

  /**
   * OBRS-1203's share sheet, which OBRS-1351 took away without meaning to: `buildQrFile()` used
   * a `fetch` that CORS refused, so it returned null and an iPhone only ever got the preview.
   * With the bytes already in hand it must produce a File - and synchronously, because a network
   * round-trip inside the tap spends Safari's transient activation.
   */
  it('builds a shareable File from the fetched bytes, so the iOS share sheet works again', async () => {
    const blob = new Blob(['<svg/>'], { type: 'image/svg+xml' });
    paymentService.getQrImage.and.returnValue(of(blob));
    await invoke(pendingPromptPay({ qrImageUrl: '/api/payments/1/qr' }));

    const file = await (
      component as unknown as { buildQrFile: (n: string) => Promise<File | null> }
    ).buildQrFile('promptpay-qr-chrg_test_obrs1351.svg');

    expect(file).not.toBeNull();
    expect(file!.type).toBe('image/svg+xml');
    expect(file!.name).toBe('promptpay-qr-chrg_test_obrs1351.svg');
  });
});

/**
 * OBRS-1384. The number under the QR used to be `sum(schedule.pricePerSeat) *
 * sum(scheduleFilter.passengerInfo.count)` — the fares from one NgRx store times the
 * headcount typed on the SEARCH page. That headcount never hears about the
 * OPEN-seating +/- stepper on /passenger-info (the same source OBRS-1226 removed from
 * that page's summary), so a customer who stepped 1 -> 2 was shown ONE seat's price
 * at the exact second they were about to scan a QR the bank app priced at two.
 *
 * It now comes from the create-payment response, i.e. from the server that issued
 * the charge that QR belongs to. Same direct-instantiation idiom as the blocks above.
 */
describe('PaymentQrcodeComponent - the amount under the QR comes from the server (OBRS-1384)', () => {
  let component: PaymentQrcodeComponent;
  let paymentService: jasmine.SpyObj<PaymentService>;
  let bookingService: jasmine.SpyObj<BookingService>;

  const CHARGE: PaymentResponse = {
    id: 1,
    bookingId: 10,
    status: 'pending',
    paymentMethod: 'qr_promptpay',
    // Two seats at 190, the OPEN-seating case from the card. The old formula printed
    // 190.00 here because the search page had been left at one passenger.
    amount: '380',
    currency: 'THB',
    authorizeUri: 'https://pay.example/authorize',
    transactionId: 'chrg_test_obrs1384',
  };

  beforeEach(() => {
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getActiveBookingId',
    ]);
    bookingService.getActiveBookingId.and.returnValue(10);
    paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', [
      'getBookingPayments',
      'createPayment',
      'createMockPayment',
    ]);
    const alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'info',
      'confirm',
    ]);
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', [
      'instant',
    ]);
    translate.instant.and.callFake((key: string) => key);

    component = new PaymentQrcodeComponent(
      router,
      bookingService,
      paymentService,
      alertService,
      translate
    );
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  const answerWith = (payment: PaymentResponse): void => {
    paymentService.createPayment.and.returnValue(
      of({ code: 200, message: 'OK', data: payment }) as unknown as ReturnType<
        PaymentService['createPayment']
      >
    );
  };

  const requestQr = (): Promise<void> =>
    (
      component as unknown as {
        ensurePromptPayQrCode: (show?: boolean) => Promise<void>;
      }
    ).ensurePromptPayQrCode();

  it("prints the charge's own amount, not a headcount x fare product", async () => {
    answerWith(CHARGE);

    await requestQr();

    expect(component.amountDisplay).toBe('380.00');
  });

  it('takes the outstanding amount when the payload is the by-booking shape instead', async () => {
    await (
      component as unknown as {
        handlePromptPayResponse: (p: PaymentByBookingIdResponse) => Promise<void>;
      }
    ).handlePromptPayResponse({
      bookingId: 10,
      paymentSummary: {
        totalAmount: '380',
        paidAmount: '0',
        outstandingAmount: '380',
        currency: 'THB',
        status: 'pending',
      },
      transactions: [],
    });

    expect(component.amountDisplay).toBe('380.00');
  });

  it('leaves the amount alone when the response carries no amount at all', async () => {
    answerWith({ ...CHARGE, amount: undefined as unknown as string });

    await requestQr();

    expect(component.amountDisplay).toBe('0.00');
  });

  /**
   * The parcel lane (OBRS-415) tells this component what the amount is. That is a
   * caller contract, not a guess to be corrected from the charge.
   */
  it('never overwrites an amountOverride the caller supplied', async () => {
    component.amountOverride = 250;
    component.amountDisplay = '250.00';
    answerWith(CHARGE);

    await requestQr();

    expect(component.amountDisplay).toBe('250.00');
  });

  /**
   * The must-NOT half of AC-1: the QR is requested off the active booking alone. It
   * used to wait for a store-derived total to become > 0, which is why the amount and
   * the QR could ever have been priced differently in the first place — and why the
   * QR tab in the reschedule / change-stop dialogs, whose module registers neither
   * `scheduleBooking` nor `scheduleFilter`, never requested one at all.
   */
  it('requests the QR on init with no NgRx store in play', () => {
    answerWith(CHARGE);

    component.ngOnInit();

    expect(paymentService.createPayment).toHaveBeenCalled();
  });

  it('requests nothing when there is no active booking', () => {
    bookingService.getActiveBookingId.and.returnValue(null);

    component.ngOnInit();

    expect(paymentService.createPayment).not.toHaveBeenCalled();
  });
});
