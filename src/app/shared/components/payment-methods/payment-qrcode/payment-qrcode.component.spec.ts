import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { throwError } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { BookingService } from '../../../../services/booking/booking.service';
import { PaymentService } from '../../../../services/payment/payment.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { PaymentByBookingIdResponse } from '../../../../shared/interfaces/payment.interface';
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
    const store = jasmine.createSpyObj<Store>('Store', ['pipe', 'select']);
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
      store,
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

      // Not "success" (isSuccessStatus still says no), but also not the
      // failure alert — the QR is re-offered instead, since a scannable
      // image was found in the transaction's gateway response.
      expect(alertService.success).not.toHaveBeenCalled();
      expect(alertService.error).not.toHaveBeenCalled();
      expect((component as any).qrImageUrl).toBe('https://example.test/qr.png');
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
    const store = jasmine.createSpyObj<Store>('Store', ['pipe', 'select']);
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
      store,
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
    const store = jasmine.createSpyObj<Store>('Store', ['pipe', 'select']);
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
      store,
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
    const store = jasmine.createSpyObj<Store>('Store', ['pipe', 'select']);
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
      store,
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
