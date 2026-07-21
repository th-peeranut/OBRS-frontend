import { FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { BookingService } from '../../../../services/booking/booking.service';
import { OmiseTokenService } from '../../../../services/payment/omise-token.service';
import { PaymentService } from '../../../../services/payment/payment.service';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  PaymentByBookingIdResponse,
  PaymentResponse,
} from '../../../../shared/interfaces/payment.interface';
import { PaymentCreditcardComponent } from './payment-creditcard.component';

/**
 * Regression coverage for OBRS-177: the backend renamed the settled payment
 * status `'success'` -> `'paid'` (docs/handoff.md 2026-06-15) but this
 * component still matched only the old literal, so a real synchronous card
 * charge never reached the success/redirect path.
 *
 * The component is a plain, constructor-injected class with no standalone
 * decorators, so it is instantiated directly (bypassing TestBed/template
 * compilation) to reach the private `handlePaymentResponse` /
 * `isPaymentConfirmed` methods under test.
 */
describe('PaymentCreditcardComponent - payment status "paid" (OBRS-177)', () => {
  let component: PaymentCreditcardComponent;
  let alertService: jasmine.SpyObj<AlertService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'info',
    ]);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    const bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getActiveBookingId',
    ]);
    const paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', [
      'getBookingPayments',
      'createPayment',
      'createMockPayment',
    ]);
    const omiseTokenService = jasmine.createSpyObj<OmiseTokenService>('OmiseTokenService', [
      'createCardToken',
    ]);

    component = new PaymentCreditcardComponent(
      translate,
      new FormBuilder(),
      router,
      bookingService,
      paymentService,
      omiseTokenService,
      alertService
    );
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  const invokeHandlePaymentResponse = (payment: PaymentResponse): void => {
    (
      component as unknown as {
        handlePaymentResponse: (p: PaymentResponse | null | undefined) => void;
      }
    ).handlePaymentResponse(payment);
  };

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

  it('routes a synchronous "paid" charge response to the success/completePayment path, not authorizeUri/pending/error', () => {
    const payment: PaymentResponse = {
      id: 1,
      bookingId: 10,
      status: 'paid',
      paymentMethod: 'card',
      amount: 100,
      currency: 'THB',
      // If the buggy code fell through past the status check, this would
      // send the test runner's window off to a fake URL.
      authorizeUri: 'https://should-not-be-visited.example',
    };

    invokeHandlePaymentResponse(payment);

    expect(alertService.success).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/e-ticket']);
    expect(alertService.error).not.toHaveBeenCalled();
    expect(alertService.info).not.toHaveBeenCalled();
  });

  it('still treats the legacy "success" status as success (regression guard)', () => {
    const payment: PaymentResponse = {
      id: 2,
      bookingId: 10,
      status: 'success',
      paymentMethod: 'card',
      amount: 100,
      currency: 'THB',
    };

    invokeHandlePaymentResponse(payment);

    expect(alertService.success).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/e-ticket']);
  });

  it('isPaymentConfirmed is true when a transaction status is "paid", even without a fully_paid summary fallback', () => {
    const payment: PaymentByBookingIdResponse = {
      bookingId: 10,
      paymentSummary: {
        totalAmount: '100',
        paidAmount: '100',
        outstandingAmount: '0',
        currency: 'THB',
        // Deliberately NOT 'fully_paid' so the assertion depends solely on
        // the transaction-status branch recognizing 'paid'.
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

  // OBRS-298: EOverallPaymentStatus grew a 7th code, refunded_partial — the
  // booking is still live, money was fully collected, and part of it has
  // since been refunded, so nothing is outstanding. isPaymentConfirmed()'s
  // `summaryStatus === 'fully_paid'` check does not know that code, but a
  // booking that reached refunded_partial always passed through a settled
  // transaction first, so hasSuccessfulTransaction should still be true and
  // carry this to a correct "confirmed" result. Verifying, not assuming.
  it('isPaymentConfirmed is true for a refunded_partial summary when the originating transaction settled as paid (OBRS-298)', () => {
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

  it('isPaymentConfirmed remains false when no transaction is paid/success and summary is not fully_paid', () => {
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
});
