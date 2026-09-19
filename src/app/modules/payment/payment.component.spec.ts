import { Action } from '@ngrx/store';
import { of, throwError } from 'rxjs';

import { PaymentComponent } from './payment.component';
import { AnalyticsService } from '../../services/analytics/analytics.service';
import { BookingService } from '../../services/booking/booking.service';
import { GuestBookingView } from '../../shared/interfaces/booking.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { createRouterStub, createStoreStub } from '../../testing/test-stubs';

describe('PaymentComponent', () => {
  let component: PaymentComponent;
  let analytics: jasmine.SpyObj<AnalyticsService>;
  let bookingService: jasmine.SpyObj<BookingService>;

  beforeEach(() => {
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', [
      'track',
    ]);
    bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getActiveBookingId',
      'getBooking',
    ]);
    bookingService.getActiveBookingId.and.returnValue(null);
    bookingService.getBooking.and.returnValue(of({ code: 200, message: 'ok' }));
    component = new PaymentComponent(
      createStoreStub(),
      createRouterStub(),
      analytics,
      bookingService
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

  /**
   * OBRS-1986 (AC-4/AC-5/AC-6). PROD, 2026-09-19: refreshing /payment emptied the NgRx
   * booking and passenger stores while the trip selection survived in localStorage, so the
   * summary computed `pricePerSeat x 0`, printed "0 baht", and left the pay button live
   * while the backend charged the real fare.
   *
   * The store is the only thing allowed to answer "what does this customer owe", so these
   * cases are written around it: what it already holds, what is fetched when it holds
   * nothing, and what the screen does when that fetch cannot answer either.
   */
  describe('restoring the server total after a refresh (OBRS-1986)', () => {
    const REFRESHED: GuestBookingView = {
      bookingId: 4242,
      bookingNumber: 'BK-4242',
      totalAmount: 400,
      discountAmountSnapshot: 0,
      netAmount: 400,
      status: 'PENDING_PAYMENT',
      adultCount: 2,
      childCount: 0,
    };

    let dispatched: Action[];

    /** A store that answers every selector from `state` and records what is dispatched. */
    function storeOver(state: Record<string, unknown>): any {
      dispatched = [];
      return {
        pipe: () => of(null),
        select: (selector: (s: unknown) => unknown) => of(selector(state)),
        dispatch: (action: Action) => dispatched.push(action),
      };
    }

    function buildWith(state: Record<string, unknown>): void {
      component = new PaymentComponent(
        storeOver(state),
        createRouterStub(),
        analytics,
        bookingService
      );
    }

    const setBookingActions = (): Action[] =>
      dispatched.filter((a) => a.type === '[Booking API] Invoke set Booking');

    it('refetches and refills the store when the booking store is empty', () => {
      buildWith({ booking: null, passengerInfo: null });
      bookingService.getActiveBookingId.and.returnValue(4242);
      bookingService.getBooking.and.returnValue(
        of({ code: 200, message: 'ok', data: REFRESHED } as ResponseAPI<GuestBookingView>)
      );

      component.ngOnInit();

      expect(bookingService.getBooking).toHaveBeenCalledWith(4242);
      expect(setBookingActions().length).toBe(1);
      expect(
        (setBookingActions()[0] as unknown as { booking: Record<string, unknown> }).booking
      ).toEqual(
        jasmine.objectContaining({
          bookingId: 4242,
          bookingNumber: 'BK-4242',
          netAmount: 400,
          adultCount: 2,
          childCount: 0,
        })
      );
      expect(component.totalState).toBe('ready');
    });

    it('makes no redundant request when the store already holds the server total', () => {
      buildWith({
        booking: { bookingId: 4242, bookingNumber: 'BK-4242', netAmount: 400 },
        passengerInfo: null,
      });

      component.ngOnInit();

      expect(bookingService.getBooking).not.toHaveBeenCalled();
      expect(setBookingActions().length).toBe(0);
      expect(component.totalState).toBe('ready');
    });

    it('leaves the pay button dead when the refetch fails', () => {
      buildWith({ booking: null, passengerInfo: null });
      bookingService.getActiveBookingId.and.returnValue(4242);
      bookingService.getBooking.and.returnValue(throwError(() => new Error('401')));

      component.ngOnInit();

      expect(component.totalState).toBe('unavailable');
      expect(setBookingActions().length).toBe(0);
    });

    it('refuses a 200 that carries no amount rather than treating it as zero', () => {
      buildWith({ booking: null, passengerInfo: null });
      bookingService.getActiveBookingId.and.returnValue(4242);
      bookingService.getBooking.and.returnValue(
        of({
          code: 200,
          message: 'ok',
          data: { bookingId: 4242, bookingNumber: 'BK-4242' },
        } as ResponseAPI<GuestBookingView>)
      );

      component.ngOnInit();

      expect(component.totalState).toBe('unavailable');
      expect(setBookingActions().length).toBe(0);
    });

    it('handles an empty localStorage without throwing and without enabling the button', () => {
      // No active booking id (and so no grant either): nothing to ask about. The screen
      // must say so rather than fall back to a number it worked out itself.
      buildWith({ booking: null, passengerInfo: null });
      bookingService.getActiveBookingId.and.returnValue(null);

      expect(() => component.ngOnInit()).not.toThrow();
      expect(bookingService.getBooking).not.toHaveBeenCalled();
      expect(component.totalState).toBe('unavailable');
    });
  });
});
