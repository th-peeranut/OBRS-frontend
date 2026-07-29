import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { BookingService } from '../../../../services/booking/booking.service';
import { PaymentService } from '../../../../services/payment/payment.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { PaymentByBookingIdResponse } from '../../../../shared/interfaces/payment.interface';
import { PaymentResultComponent } from './payment-result.component';
import { AnalyticsService } from '../../../../services/analytics/analytics.service';

/**
 * Regression coverage for OBRS-177: the backend renamed the settled payment
 * status `'success'` -> `'paid'` (docs/handoff.md 2026-06-15) but this
 * component's polling check still matched only the old literal.
 *
 * The component is a plain, constructor-injected class with no standalone
 * decorators, so it is instantiated directly (bypassing TestBed/template
 * compilation) to reach the private `isPaymentConfirmed` method under test.
 */
describe('PaymentResultComponent - payment status "paid" (OBRS-177)', () => {
  let component: PaymentResultComponent;
  let analytics: jasmine.SpyObj<AnalyticsService>;
  let alertService: jasmine.SpyObj<AlertService>;

  beforeEach(() => {
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    const bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getActiveBookingId',
    ]);
    const paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', [
      'getBookingPayments',
    ]);
    alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'info',
    ]);
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['track']);

    component = new PaymentResultComponent(
      router,
      bookingService,
      paymentService,
      alertService,
      translate,
      analytics
    );
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  const invokeIsPaymentConfirmed = (
    payment: PaymentByBookingIdResponse
  ): boolean =>
    (
      component as unknown as {
        isPaymentConfirmed: (
          p: PaymentByBookingIdResponse | null | undefined
        ) => boolean;
      }
    ).isPaymentConfirmed(payment);

  it('is true when a transaction status is "paid" and paymentSummary.status is NOT fully_paid', () => {
    const payment: PaymentByBookingIdResponse = {
      bookingId: 10,
      paymentSummary: {
        totalAmount: '100',
        paidAmount: '100',
        outstandingAmount: '0',
        currency: 'THB',
        status: 'partially_paid',
      },
      transactions: [
        {
          paymentMethod: 'card',
          amount: 100,
          currency: 'THB',
          status: 'paid',
        },
      ],
    };

    expect(invokeIsPaymentConfirmed(payment)).toBeTrue();
  });

  it('still treats the legacy "success" transaction status as confirmed (regression guard)', () => {
    const payment: PaymentByBookingIdResponse = {
      bookingId: 10,
      paymentSummary: {
        totalAmount: '100',
        paidAmount: '100',
        outstandingAmount: '0',
        currency: 'THB',
        status: 'partially_paid',
      },
      transactions: [
        {
          paymentMethod: 'card',
          amount: 100,
          currency: 'THB',
          status: 'success',
        },
      ],
    };

    expect(invokeIsPaymentConfirmed(payment)).toBeTrue();
  });

  // OBRS-298: EOverallPaymentStatus grew a 7th code, refunded_partial — the
  // booking is still live, money was fully collected, and part of it has
  // since been refunded, so nothing is outstanding. isPaymentConfirmed()'s
  // `summaryStatus === 'fully_paid'` check does not know that code, but a
  // booking that reached refunded_partial always passed through a settled
  // transaction first, so hasSuccessfulTransaction should still be true and
  // carry this to a correct "confirmed" result. Verifying, not assuming.
  it('is true for a refunded_partial summary when the originating transaction settled as paid (OBRS-298)', () => {
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
          paymentMethod: 'card',
          amount: 100,
          currency: 'THB',
          status: 'paid',
        },
      ],
    };

    expect(invokeIsPaymentConfirmed(payment)).toBeTrue();
  });

  it('remains false when no transaction is paid/success and summary is not fully_paid', () => {
    const payment: PaymentByBookingIdResponse = {
      bookingId: 10,
      paymentSummary: {
        totalAmount: '100',
        paidAmount: '0',
        outstandingAmount: '100',
        currency: 'THB',
        status: 'pending',
      },
      transactions: [
        {
          paymentMethod: 'card',
          amount: 100,
          currency: 'THB',
          status: 'pending',
        },
      ],
    };

    expect(invokeIsPaymentConfirmed(payment)).toBeFalse();
  });

  /**
   * OBRS-867 funnel step 6, PromptPay branch.
   *
   * This is the branch a card-only test would have missed entirely: PromptPay
   * leaves the site for the bank and comes back here, so `PaymentComponent`'s
   * in-page `(paymentCompleted)` handler never runs for it. PromptPay is also
   * the method most Thai customers use, so instrumenting only the card path
   * would have reported the dominant payment method as a funnel that never
   * converts.
   */
  describe('booking_completed (OBRS-867)', () => {
    const invokeCompletePayment = (): void =>
      (component as unknown as { completePayment: () => void }).completePayment();

    it('fires exactly once, naming PromptPay as the method', () => {
      invokeCompletePayment();

      expect(analytics.track).toHaveBeenCalledOnceWith('booking_completed', {
        payment_method: 'qr_promptpay',
      });
    });

    it('carries nothing that identifies the customer or the ticket', () => {
      invokeCompletePayment();

      const [, params] = analytics.track.calls.mostRecent().args;
      expect(Object.keys(params ?? {})).toEqual(['payment_method']);
    });

    it('does not fire on a poll that has not confirmed anything', () => {
      // `checkPaymentStatus` runs every 3s; only `completePayment` may emit.
      expect(analytics.track).not.toHaveBeenCalled();
      expect(alertService.success).not.toHaveBeenCalled();
    });
  });
});
