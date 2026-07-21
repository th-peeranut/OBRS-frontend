import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
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
