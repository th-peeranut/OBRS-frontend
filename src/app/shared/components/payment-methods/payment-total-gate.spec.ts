import { SimpleChange } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

import { BookingService } from '../../../services/booking/booking.service';
import { MaintenanceWindowService } from '../../../services/maintenance-window/maintenance-window.service';
import { OmiseTokenService } from '../../../services/payment/omise-token.service';
import { PaymentService } from '../../../services/payment/payment.service';
import { AlertService } from '../../services/alert.service';
import { PaymentCreditcardComponent } from './payment-creditcard/payment-creditcard.component';
import { PaymentQrcodeComponent } from './payment-qrcode/payment-qrcode.component';

/**
 * OBRS-1986 (AC-6): never let a customer pay against a number the page cannot vouch for.
 *
 * The `totalState` input is `'ready'` by default so every existing call site - parcel
 * booking, the reschedule and change-stop dialogs, each of which states its own amount -
 * keeps behaving exactly as it did. Only /payment binds the live value, and both panels
 * gate their handler as well as their button: the button is what a customer sees, the
 * early return is what someone who re-enables it in devtools gets.
 */
describe('payment panels refuse an unverified total (OBRS-1986)', () => {
  const unlocked = {
    isPaymentLockedNow: () => false,
  } as unknown as MaintenanceWindowService;

  function translateSpy(): TranslateService {
    return jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
  }

  function alertSpy(): jasmine.SpyObj<AlertService> {
    return jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'info',
      'confirm',
    ]);
  }

  function creditcard(): {
    component: PaymentCreditcardComponent;
    paymentService: jasmine.SpyObj<PaymentService>;
  } {
    const paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', [
      'createPayment',
      'createMockPayment',
      'getBookingPayments',
    ]);
    const component = new PaymentCreditcardComponent(
      translateSpy(),
      jasmine.createSpyObj<Router>('Router', ['navigate']),
      jasmine.createSpyObj<BookingService>('BookingService', ['getActiveBookingId']),
      paymentService,
      jasmine.createSpyObj<OmiseTokenService>('OmiseTokenService', ['requestCardToken']),
      alertSpy(),
      unlocked
    );
    return { component, paymentService };
  }

  function qrcode(): {
    component: PaymentQrcodeComponent;
    paymentService: jasmine.SpyObj<PaymentService>;
    alertService: jasmine.SpyObj<AlertService>;
  } {
    const paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', [
      'createPayment',
      'getBookingPayments',
      'getQrImage',
    ]);
    const alertService = alertSpy();
    const bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getActiveBookingId',
      'getActiveBookingNumber',
    ]);
    bookingService.getActiveBookingNumber.and.returnValue('BK-4242');
    bookingService.getActiveBookingId.and.returnValue(4242);

    const component = new PaymentQrcodeComponent(
      jasmine.createSpyObj<Router>('Router', ['navigate']),
      bookingService,
      paymentService,
      alertService,
      translateSpy(),
      unlocked
    );
    return { component, paymentService, alertService };
  }

  describe('the card panel', () => {
    it('stays live for every caller that states its own amount', () => {
      expect(creditcard().component.isTotalUnverified).toBeFalse();
    });

    it('refuses to submit while the total is still being fetched', async () => {
      const { component, paymentService } = creditcard();
      component.totalState = 'loading';

      expect(component.isTotalUnverified).toBeTrue();
      await component.submitPayment();

      expect(paymentService.createPayment).not.toHaveBeenCalled();
    });

    it('refuses to submit when the total could not be confirmed', async () => {
      const { component, paymentService } = creditcard();
      component.totalState = 'unavailable';

      await component.submitPayment();

      expect(paymentService.createPayment).not.toHaveBeenCalled();
    });
  });

  describe('the QR panel', () => {
    it('raises no PromptPay charge while the amount is unverified', () => {
      // Asking for the QR is what CREATES the charge, so ngOnInit is the gate that
      // matters here - a charge sitting at the gateway for an amount the screen cannot
      // state is the prod defect in its worst form.
      const { component, paymentService } = qrcode();
      component.totalState = 'unavailable';

      component.ngOnInit();

      expect(paymentService.createPayment).not.toHaveBeenCalled();
      expect(paymentService.getBookingPayments).not.toHaveBeenCalled();
      component.ngOnDestroy();
    });

    it('does not hand the customer to the gateway on an unverified total', async () => {
      const { component, alertService } = qrcode();
      component.totalState = 'unavailable';
      const navigate = spyOn(
        component as unknown as { navigateToGateway: (url: string) => void },
        'navigateToGateway'
      );

      await component.confirmPayment();

      expect(alertService.confirm).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      component.ngOnDestroy();
    });

    it('asks for the QR once the total lands, instead of staying empty for good', () => {
      // The gate above returns WITHOUT setting hasRequestedQrCode, and nothing else calls
      // ensurePromptPayQrCode again. A customer opening this tab during the one round trip
      // GET /api/bookings/{id} costs would otherwise face an empty panel with no message.
      const { component, paymentService } = qrcode();
      paymentService.createPayment.and.returnValue(of({}) as never);
      component.totalState = 'loading';
      component.ngOnInit();
      expect(paymentService.createPayment).not.toHaveBeenCalled();

      component.totalState = 'ready';
      component.ngOnChanges({
        totalState: new SimpleChange('loading', 'ready', false),
      });

      expect(paymentService.createPayment).toHaveBeenCalledTimes(1);
      component.ngOnDestroy();
    });

    it('does not re-ask for a call site that never binds totalState', () => {
      // firstChange is what keeps parcel / reschedule / change-stop byte-identical.
      const { component, paymentService } = qrcode();
      component.ngOnChanges({
        totalState: new SimpleChange(undefined, 'ready', true),
      });

      expect(paymentService.createPayment).not.toHaveBeenCalled();
      component.ngOnDestroy();
    });
  });
});
