import { PaymentComponent } from './payment.component';
import { AnalyticsService } from '../../services/analytics/analytics.service';
import { createRouterStub, createStoreStub } from '../../testing/test-stubs';

describe('PaymentComponent', () => {
  let component: PaymentComponent;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  beforeEach(() => {
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', [
      'track',
    ]);
    component = new PaymentComponent(
      createStoreStub(),
      createRouterStub(),
      analytics
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /**
   * OBRS-902 AC-3: the funnel's steps have to be countable against each other.
   *
   * `activePaymentTab` is a template identifier (`creditcard`/`qrcode` name two
   * `*ngIf` branches). Sending it raw labelled the top of the funnel in a
   * vocabulary its bottom step did not share — `payment_started=creditcard`
   * against `booking_completed=card` — so splitting the funnel by method
   * dropped every session. These assert the wire values, not the tab, because
   * the tab being right is not the property anyone depends on.
   */
  describe('payment_method vocabulary (OBRS-902)', () => {
    const paramOf = (eventName: string): unknown => {
      const call = analytics.track.calls
        .all()
        .find((c) => c.args[0] === eventName);
      return (call?.args[1] as Record<string, unknown> | undefined)?.[
        'payment_method'
      ];
    };

    it('opens the payment step as `card`, not as the tab id `creditcard`', () => {
      component.ngOnInit();

      expect(paramOf('payment_started')).toBe('card');
    });

    it('reports a switch to the QR tab as `qr_promptpay`', () => {
      component.onPaymentTabChange('qrcode');

      expect(paramOf('payment_method_selected')).toBe('qr_promptpay');
    });

    it('reports a switch back to the card tab as `card`', () => {
      component.onPaymentTabChange('qrcode');
      component.onPaymentTabChange('creditcard');

      expect(
        analytics.track.calls
          .all()
          .filter((c) => c.args[0] === 'payment_method_selected')
          .map((c) => (c.args[1] as Record<string, unknown>)['payment_method'])
      ).toEqual(['qr_promptpay', 'card']);
    });

    it('completes in the same vocabulary it started in', () => {
      // The join AC-3 is about: one session, two events, one value.
      component.ngOnInit();
      component.onPaymentCompleted();

      expect(paramOf('booking_completed')).toBe(paramOf('payment_started'));
      expect(paramOf('booking_completed')).toBe('card');
    });

    it('follows the tab the customer actually left it on', () => {
      // Guards against a fix that swaps one constant for another: the completion
      // value has to move when the input moves.
      component.ngOnInit();
      component.onPaymentTabChange('qrcode');
      component.onPaymentCompleted();

      expect(paramOf('booking_completed')).toBe('qr_promptpay');
    });
  });
});
