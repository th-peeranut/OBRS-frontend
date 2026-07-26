import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { BookingService } from '../../../../services/booking/booking.service';
import {
  CARD_ENTRY_CANCELLED,
  OmiseTokenService,
} from '../../../../services/payment/omise-token.service';
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
      'requestCardToken',
    ]);

    component = new PaymentCreditcardComponent(
      translate,
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

  it('carries no card-data accessors any more (OBRS-391)', () => {
    // Pins the SHAPE, not just the behaviour: these four members read the PAN, the
    // CVV and the expiry out of a FormGroup on our own origin, which is what put the
    // site in PCI SAQ A-EP. If a later change re-introduces any of them the class is
    // holding card data again even if every payment test still passes.
    const surface = component as unknown as Record<string, unknown>;
    expect(surface['creditCardForm']).toBeUndefined();
    expect(surface['getCardNumber']).toBeUndefined();
    expect(surface['getExpiryDate']).toBeUndefined();
    expect(surface['creatForm']).toBeUndefined();
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

/**
 * OBRS-391 — the hosted-iframe token flow.
 *
 * `submitPayment()` no longer validates a card form; it asks OmiseTokenService to
 * open Omise's dialog and waits for the token that comes back. Two branches out of
 * that call matter enough to pin:
 *
 *   - a token arrives  -> it must reach the backend as `cardToken`, unchanged, with
 *                         the payload's other two fields untouched. That payload is
 *                         the whole reason this migration cost the backend zero
 *                         lines, so a drift here is the drift that would break it.
 *   - the dialog closes -> NOTHING may be shown. Before this card there was no such
 *                         branch (a form cannot be "cancelled"), and the default
 *                         behaviour of the catch it falls into is to tell the
 *                         passenger their payment failed, which is both untrue and
 *                         the kind of message that ends a booking.
 */
describe('PaymentCreditcardComponent - OmiseCard hosted card entry (OBRS-391)', () => {
  let component: PaymentCreditcardComponent;
  let alertService: jasmine.SpyObj<AlertService>;
  let paymentService: jasmine.SpyObj<PaymentService>;
  let omiseTokenService: jasmine.SpyObj<OmiseTokenService>;
  let translate: jasmine.SpyObj<TranslateService>;

  beforeEach(() => {
    alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'info',
    ]);
    translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    translate.instant.and.returnValue('translated');
    // `currentLang` is a plain property, so createSpyObj does not provide it; the
    // component forwards it to Omise as the dialog language.
    (translate as unknown as { currentLang: string }).currentLang = 'th';

    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    const bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getActiveBookingId',
    ]);
    bookingService.getActiveBookingId.and.returnValue(10);

    paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', [
      'getBookingPayments',
      'createPayment',
      'createMockPayment',
    ]);
    // The amount Omise's dialog displays is read from here, not re-derived.
    paymentService.getBookingPayments.and.returnValue(
      of({
        code: 200,
        data: {
          bookingId: 10,
          paymentSummary: {
            totalAmount: '1234.50',
            paidAmount: '0',
            outstandingAmount: '1234.50',
            currency: 'THB',
            status: 'pending',
          },
          transactions: [],
        },
      }) as unknown as ReturnType<PaymentService['getBookingPayments']>
    );
    const paidResponse: PaymentResponse = {
      id: 1,
      bookingId: 10,
      status: 'paid',
      paymentMethod: 'card',
      amount: 100,
      currency: 'THB',
    };
    // Only the ResponseAPI envelope is cast; `data` is a real PaymentResponse so a
    // future change to that interface still breaks this spec rather than sliding past
    // an `as never`.
    paymentService.createPayment.and.returnValue(
      of({ code: 200, data: paidResponse }) as unknown as ReturnType<
        PaymentService['createPayment']
      >
    );

    omiseTokenService = jasmine.createSpyObj<OmiseTokenService>('OmiseTokenService', [
      'requestCardToken',
    ]);

    component = new PaymentCreditcardComponent(
      translate,
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

  it('sends the token Omise returned to the backend as cardToken, and asks Omise for it in the current language', async () => {
    omiseTokenService.requestCardToken.and.resolveTo('tokn_test_from_iframe');

    await component.submitPayment();

    // 1234.50 THB outstanding -> 123450 satang. The x100 is the whole point of
    // this assertion: Omise takes the smallest currency unit, and passing baht
    // would show a dialog asking for 1/100th of the fare.
    expect(omiseTokenService.requestCardToken).toHaveBeenCalledWith({
      language: 'th',
      submitLabel: 'translated',
      amountSubunits: 123450,
      currency: 'THB',
    });
    expect(paymentService.createPayment).toHaveBeenCalled();
    const [payload] = paymentService.createPayment.calls.mostRecent().args;
    expect(payload).toEqual(
      jasmine.objectContaining({
        bookingId: 10,
        paymentMethod: 'card',
        cardToken: 'tokn_test_from_iframe',
      })
    );
    // The wire contract is exactly these three fields — nothing card-shaped may ride
    // along, which is what keeps the backend at zero lines changed.
    expect(Object.keys(payload as object).sort()).toEqual([
      'bookingId',
      'cardToken',
      'paymentMethod',
    ]);
  });

  it('says nothing at all when the passenger closes the Omise dialog, and re-enables the pay button', async () => {
    omiseTokenService.requestCardToken.and.rejectWith(new Error(CARD_ENTRY_CANCELLED));

    await component.submitPayment();

    expect(alertService.error).not.toHaveBeenCalled();
    expect(alertService.success).not.toHaveBeenCalled();
    expect(alertService.info).not.toHaveBeenCalled();
    expect(paymentService.createPayment).not.toHaveBeenCalled();
    expect(component.isSubmittingPayment).toBeFalse();
  });

  it('never opens the dialog when the server reports nothing outstanding', async () => {
    // A dialog that says "Pay 0.00 THB" is what this whole path exists to avoid;
    // if the amount cannot be established, the payment fails visibly instead.
    paymentService.getBookingPayments.and.returnValue(
      of({
        code: 200,
        data: {
          bookingId: 10,
          paymentSummary: {
            totalAmount: '0',
            paidAmount: '0',
            outstandingAmount: '0',
            currency: 'THB',
            status: 'fully_paid',
          },
          transactions: [],
        },
      }) as unknown as ReturnType<PaymentService['getBookingPayments']>
    );

    await component.submitPayment();

    expect(omiseTokenService.requestCardToken).not.toHaveBeenCalled();
    expect(paymentService.createPayment).not.toHaveBeenCalled();
    expect(alertService.error).toHaveBeenCalled();
    expect(component.isSubmittingPayment).toBeFalse();
  });

  it('stays silent when the backend refuses the amount as above the gateway ceiling — errorInterceptor already showed a truer message (OBRS-736)', async () => {
    omiseTokenService.requestCardToken.and.resolveTo('tokn_test_from_iframe');
    paymentService.createPayment.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: {
              errorCode: 'PAYMENT_AMOUNT_EXCEEDS_GATEWAY_LIMIT',
              message:
                'ยอดนี้ชำระออนไลน์ไม่ได้ เพราะผู้ให้บริการชำระเงินรับได้สูงสุด 10,000 บาทต่อหนึ่งรายการ',
            },
          })
      ) as unknown as ReturnType<PaymentService['createPayment']>
    );

    await component.submitPayment();

    // The generic toast says "check your card details or balance". Both are false
    // here, and no retry can ever succeed, so it must not land on top of the
    // backend's message.
    expect(alertService.error).not.toHaveBeenCalled();
    expect(component.isSubmittingPayment).toBeFalse();
  });

  it('still reports every OTHER backend payment failure — the ceiling branch must stay narrow (OBRS-736)', async () => {
    // The must-NOT half. A silence that swallowed any HTTP failure would leave a
    // declined card looking exactly like a successful one.
    omiseTokenService.requestCardToken.and.resolveTo('tokn_test_from_iframe');
    paymentService.createPayment.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { errorCode: 'GATEWAY_ERROR', message: 'gateway down' },
          })
      ) as unknown as ReturnType<PaymentService['createPayment']>
    );

    await component.submitPayment();

    expect(alertService.error).toHaveBeenCalled();
    expect(component.isSubmittingPayment).toBeFalse();
  });

  it('still reports a REAL tokenization failure — the cancel branch must not swallow errors too', async () => {
    // The must-NOT-catch half of the case above. A silent cancel path is only correct
    // if it is narrow: an Omise error still has to reach the passenger, or a declined
    // card would look identical to a successful one from the outside.
    omiseTokenService.requestCardToken.and.rejectWith(new Error('OmiseCard failed to load'));

    await component.submitPayment();

    expect(alertService.error).toHaveBeenCalled();
    expect(paymentService.createPayment).not.toHaveBeenCalled();
    expect(component.isSubmittingPayment).toBeFalse();
  });
});
