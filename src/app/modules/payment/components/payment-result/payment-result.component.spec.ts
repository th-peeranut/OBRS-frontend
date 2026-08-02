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
   * OBRS-867 funnel step 6, the redirect-back branch — corrected by OBRS-902.
   *
   * This is the branch a card-only test would have missed entirely: a payment
   * that leaves the site and comes back here never runs `PaymentComponent`'s
   * in-page `(paymentCompleted)` handler.
   *
   * The tests that stood here asserted the constant `qr_promptpay`, so they
   * were green *against* the defect, and green in exactly the case that
   * mattered: a card payment through 3DS also lands on this page, and was
   * reported to GA4 as PromptPay. They encoded the assumption instead of
   * measuring it. What changes below is therefore the claim being made, not
   * the strictness of the guard.
   *
   * Each fixture differs from its neighbour in ONE field —
   * `transactions[].paymentMethod` — so a second hardcoded constant that
   * happened to satisfy one case cannot satisfy the next.
   */
  describe('booking_completed (OBRS-867 / OBRS-902)', () => {
    const paymentWith = (
      transactions: PaymentByBookingIdResponse['transactions']
    ): PaymentByBookingIdResponse => ({
      bookingId: 10,
      paymentSummary: {
        totalAmount: '100',
        paidAmount: '100',
        outstandingAmount: '0',
        currency: 'THB',
        status: 'fully_paid',
      },
      transactions,
    });

    const invokeCompletePayment = (
      payment: PaymentByBookingIdResponse | null | undefined
    ): void =>
      (
        component as unknown as {
          completePayment: (
            p: PaymentByBookingIdResponse | null | undefined
          ) => void;
        }
      ).completePayment(payment);

    const methodSent = (): unknown => {
      const [, params] = analytics.track.calls.mostRecent().args;
      return (params as Record<string, unknown> | undefined)?.['payment_method'];
    };

    it('reports the card that was actually charged, not the page it came back to', () => {
      // The OBRS-902 regression: this exact input used to produce `qr_promptpay`.
      invokeCompletePayment(
        paymentWith([
          { paymentMethod: 'card', amount: 100, currency: 'THB', status: 'paid' },
        ])
      );

      expect(analytics.track).toHaveBeenCalledOnceWith('booking_completed', {
        payment_method: 'card',
      });
    });

    it('reports PromptPay when PromptPay is what settled', () => {
      invokeCompletePayment(
        paymentWith([
          {
            paymentMethod: 'qr_promptpay',
            amount: 100,
            currency: 'THB',
            status: 'paid',
          },
        ])
      );

      expect(methodSent()).toBe('qr_promptpay');
    });

    it('speaks one vocabulary even when the API spells the method differently', () => {
      // `PaymentMethod` carries both `card` and `credit_card`; two spellings of
      // one method would split the dashboard's own totals in half.
      invokeCompletePayment(
        paymentWith([
          {
            paymentMethod: 'CREDIT_CARD',
            amount: 100,
            currency: 'THB',
            status: 'paid',
          },
        ])
      );

      expect(methodSent()).toBe('card');
    });

    it('reads the transaction that PAID, not the first one in the list', () => {
      // A declined card followed by a successful PromptPay is an ordinary
      // customer recovery, and `transactions[0]` would name the failure.
      invokeCompletePayment(
        paymentWith([
          {
            paymentMethod: 'card',
            amount: 100,
            currency: 'THB',
            status: 'failed',
          },
          {
            paymentMethod: 'qr_promptpay',
            amount: 100,
            currency: 'THB',
            status: 'paid',
          },
        ])
      );

      expect(methodSent()).toBe('qr_promptpay');
    });

    it('says "unknown" rather than guessing when nothing settled', () => {
      // `isPaymentConfirmed` also accepts a `fully_paid` summary with an empty
      // transaction list. Inventing a plausible method there is the defect.
      invokeCompletePayment(paymentWith([]));

      expect(methodSent()).toBe('unknown');
    });

    it('carries nothing that identifies the customer or the ticket', () => {
      invokeCompletePayment(
        paymentWith([
          { paymentMethod: 'card', amount: 100, currency: 'THB', status: 'paid' },
        ])
      );

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
