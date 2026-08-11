import { of, throwError, Subject } from 'rxjs';
import { SellReceiptPageComponent } from './sell-receipt-page.component';
import { BoardingQrService } from '../../../../shared/services/boarding-qr.service';
import { BookingTicketsData } from '../../../../shared/interfaces/booking-ticket.interface';
import { PaymentByBookingIdResponse } from '../../../../shared/interfaces/payment.interface';
import { createRouterStub, createTranslateStub } from '../../../../testing/test-stubs';

function createActivatedRouteStub(bookingId: number | string | null): any {
  return {
    paramMap: of({
      get: (key: string) => (key === 'bookingId' ? (bookingId === null ? null : String(bookingId)) : null),
    }),
  };
}

function createAuthServiceStub(username: string | null = 'staff01'): any {
  return { getUsername: () => username };
}

function buildTicketsData(): BookingTicketsData {
  return {
    bookingId: 1,
    bookingNumber: 'BK-0001',
    bookingStatus: 'confirmed',
    totalTickets: 2,
    journeys: [
      {
        legType: { code: 'outbound', label: 'Outbound' },
        fromStop: { code: 'nong_chak', label: 'Nong chak' },
        toStop: { code: 'bts_mo_chit', label: 'Bts mo chit' },
        departureDateTime: '2026-12-20 08:00:00',
        arrivalDateTime: '2026-12-20 09:48:00',
        vehicle: { vehicleType: { code: 'van', label: 'Van' } },
        tickets: [
          {
            id: 1,
            ticketNumber: 'T-OK',
            passengerName: 'Mr. Ok Passenger',
            seatNumber: '1',
            status: { code: 'confirmed', label: 'Confirmed' },
          },
          {
            id: 2,
            ticketNumber: 'T-OK2',
            passengerName: 'Mr. Second Passenger',
            seatNumber: '2',
            status: { code: 'confirmed', label: 'Confirmed' },
          },
        ],
      },
    ],
  };
}

function buildPaymentsData(): PaymentByBookingIdResponse {
  return {
    bookingId: 1,
    paymentSummary: {
      totalAmount: '600.00',
      paidAmount: '600.00',
      outstandingAmount: '0.00',
      currency: 'THB',
      status: 'paid',
    },
    transactions: [
      {
        transactionId: undefined,
        paymentMethod: 'cash',
        amount: '600.00',
        currency: 'THB',
        status: 'paid',
        paidAt: '2026-07-10 10:00:00',
      },
    ],
  };
}

describe('SellReceiptPageComponent', () => {
  let bookingServiceStub: any;
  let paymentServiceStub: any;
  let ticketServiceStub: any;

  // Real BoardingQrService wired to the ticket-service stub (not a mock of the
  // service itself) — a fresh instance per component, matching the
  // component-scoped `providers: [BoardingQrService]` lifetime, so the
  // existing assertions on `ticketServiceStub.getBoardingToken` calls stay
  // meaningful (OBRS-221 extraction).
  function createComponent(bookingId: number | string | null = 1): SellReceiptPageComponent {
    return new SellReceiptPageComponent(
      createActivatedRouteStub(bookingId),
      createRouterStub(),
      bookingServiceStub,
      paymentServiceStub,
      new BoardingQrService(ticketServiceStub),
      createTranslateStub(),
      createAuthServiceStub()
    );
  }

  beforeEach(() => {
    bookingServiceStub = {
      getBookingTickets: jasmine.createSpy('getBookingTickets').and.returnValue(
        of({ code: 200, message: 'OK', data: buildTicketsData() })
      ),
    };
    paymentServiceStub = {
      getBookingPayments: jasmine.createSpy('getBookingPayments').and.returnValue(
        of({ code: 200, message: 'OK', data: buildPaymentsData() })
      ),
    };
    ticketServiceStub = {
      getBoardingToken: jasmine.createSpy('getBoardingToken').and.returnValue(
        of({ code: 200, message: 'OK', data: { ticketId: 1, ticketNumber: 'T-OK', boardingToken: 'tok', expiresAt: '' } })
      ),
    };
  });

  it('should create', () => {
    expect(createComponent()).toBeTruthy();
  });

  describe('load', () => {
    it('reads bookingId from the route param and fetches tickets + payments', () => {
      const component = createComponent(42);
      component.ngOnInit();

      expect(bookingServiceStub.getBookingTickets).toHaveBeenCalledWith(42, true);
      expect(paymentServiceStub.getBookingPayments).toHaveBeenCalledWith(42, { skipGlobalLoadingAlert: true });
    });

    it('populates booking number, route, and departure/arrival from the first journey', () => {
      const component = createComponent();
      component.ngOnInit();

      expect((component as any).bookingNumber).toBe('BK-0001');
      expect((component as any).routeLabel).toBe('Nong chak - Bts mo chit');
      expect((component as any).isLoading).toBeFalse();
      expect((component as any).loadError).toBeFalse();
    });

    /**
     * OBRS-1249 — the receipt names the route the same way the customer's
     * e-ticket does. `routeLabel` rides on this very response (OBRS-1219 put it
     * there); a walk-in buyer holding the printed slip and the e-ticket of the
     * trip they were just sold must not find the two disagreeing about which
     * trip it was. The assertion above is the other half: with no name seeded
     * the slip keeps its stop pair, unchanged.
     */
    it('OBRS-1249: prints the route own name when the response carries one', () => {
      const data = buildTicketsData();
      data.journeys![0].routeLabel = 'หนองชาก-บ้านบึง-กรุงเทพฯ';
      bookingServiceStub.getBookingTickets.and.returnValue(
        of({ code: 200, message: 'OK', data })
      );

      const component = createComponent();
      component.ngOnInit();

      expect((component as any).routeLabel).toBe('หนองชาก-บ้านบึง-กรุงเทพฯ');
    });

    it('OBRS-1249: a blank route name does not blank the line', () => {
      const data = buildTicketsData();
      data.journeys![0].routeLabel = '   ';
      bookingServiceStub.getBookingTickets.and.returnValue(
        of({ code: 200, message: 'OK', data })
      );

      const component = createComponent();
      component.ngOnInit();

      expect((component as any).routeLabel).toBe('Nong chak - Bts mo chit');
    });

    it('builds one ticket row per passenger with seat + name + ticket number', () => {
      const component = createComponent();
      component.ngOnInit();

      expect((component as any).tickets.length).toBe(2);
      expect((component as any).tickets[0]).toEqual(
        jasmine.objectContaining({ ticketNumber: 'T-OK', passengerName: 'Mr. Ok Passenger', seat: '1', seatOpen: false })
      );
    });

    // OBRS-324 (Epic OBRS-318 open seating, 318-d): an OPEN walk-in ticket has
    // seatNumber == null — the receipt should flag it instead of rendering '-'.
    it('flags seatOpen=true for a ticket with no seatNumber (OPEN-seating walk-in sale)', () => {
      const data = buildTicketsData();
      data.journeys![0].tickets![0].seatNumber = undefined;
      bookingServiceStub.getBookingTickets.and.returnValue(
        of({ code: 200, message: 'OK', data })
      );

      const component = createComponent();
      component.ngOnInit();

      expect((component as any).tickets[0].seatOpen).toBeTrue();
      expect((component as any).tickets[1].seatOpen).toBeFalse();
    });

    it('maps the cash payment method, paid amount, and paidAt from the payments response', () => {
      const component = createComponent();
      component.ngOnInit();

      expect((component as any).amountPaid).toBe('600.00');
      // The translate stub's instant() is a passthrough, so the resolved key comes back verbatim.
      expect((component as any).paymentMethodLabel).toBe('STAFF.SELL.PAYMENT_CASH');
      expect((component as any).paidAtDisplay).not.toBe('-');
    });

    it('derives the selling staff username from AuthService', () => {
      const component = createComponent();
      expect((component as any).soldByUsername).toBe('staff01');
    });

    it('sets loadError when the tickets fetch fails', () => {
      bookingServiceStub.getBookingTickets.and.returnValue(throwError(() => new Error('network')));
      const component = createComponent();
      component.ngOnInit();

      expect((component as any).loadError).toBeTrue();
      expect((component as any).isLoading).toBeFalse();
    });

    it('sets loadError when the bookingId route param is missing/invalid', () => {
      const component = createComponent(null);
      component.ngOnInit();

      expect((component as any).loadError).toBeTrue();
      expect(bookingServiceStub.getBookingTickets).not.toHaveBeenCalled();
    });

    it('still renders ticket data when the payments fetch fails (payments failure is non-fatal)', () => {
      paymentServiceStub.getBookingPayments.and.returnValue(throwError(() => new Error('network')));
      const component = createComponent();
      component.ngOnInit();

      expect((component as any).loadError).toBeFalse();
      expect((component as any).bookingNumber).toBe('BK-0001');
    });

    it('reload() re-fetches after a failure', () => {
      bookingServiceStub.getBookingTickets.and.returnValue(throwError(() => new Error('network')));
      const component = createComponent();
      component.ngOnInit();
      expect((component as any).loadError).toBeTrue();

      bookingServiceStub.getBookingTickets.and.returnValue(
        of({ code: 200, message: 'OK', data: buildTicketsData() })
      );
      (component as any).reload();

      expect((component as any).loadError).toBeFalse();
      expect((component as any).bookingNumber).toBe('BK-0001');
    });
  });

  describe('per-ticket boarding-token QR fetch (OBRS-96 reuse)', () => {
    it('fetches one boarding token per ticketId', () => {
      const component = createComponent();
      component.ngOnInit();

      expect(ticketServiceStub.getBoardingToken).toHaveBeenCalledWith(1, true);
      expect(ticketServiceStub.getBoardingToken).toHaveBeenCalledWith(2, true);
    });

    it('renders a data-URL QR for a ticket whose boarding token resolves', async () => {
      ticketServiceStub.getBoardingToken.and.callFake((ticketId: number) =>
        of({ code: 200, message: 'OK', data: { ticketId, ticketNumber: 'T', boardingToken: `tok-${ticketId}`, expiresAt: '' } })
      );

      const component = createComponent();
      component.ngOnInit();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const row = (component as any).tickets.find((t: any) => t.ticketId === 1);
      expect(row.qrDataUrl).toContain('data:image');
      expect(row.qrUnavailable).toBeFalse();
    });

    it('isolates a single ticket boarding-token failure (e.g. 409 TICKET_NOT_CONFIRMED) without blanking the others', async () => {
      ticketServiceStub.getBoardingToken.and.callFake((ticketId: number) =>
        ticketId === 1
          ? of({ code: 200, message: 'OK', data: { ticketId: 1, ticketNumber: 'T-OK', boardingToken: 'valid', expiresAt: '' } })
          : throwError(() => ({ error: { errorCode: 'TICKET_NOT_CONFIRMED' } }))
      );

      const component = createComponent();
      component.ngOnInit();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const tickets = (component as any).tickets;
      expect(tickets.find((t: any) => t.ticketId === 1).qrUnavailable).toBeFalse();
      expect(tickets.find((t: any) => t.ticketId === 2).qrUnavailable).toBeTrue();
    });

    it('does not re-issue the GET for a ticket already fetched (duplicate-fetch guard, e.g. a locale switch)', () => {
      const component = createComponent();
      component.ngOnInit();
      (component as any).load();

      expect(ticketServiceStub.getBoardingToken.calls.count()).toBe(2);
    });
  });

  describe('language change', () => {
    it('re-fetches on a language switch (stop labels are server-localized)', () => {
      const translate = createTranslateStub();
      const component = new SellReceiptPageComponent(
        createActivatedRouteStub(1),
        createRouterStub(),
        bookingServiceStub,
        paymentServiceStub,
        new BoardingQrService(ticketServiceStub),
        translate,
        createAuthServiceStub()
      );
      component.ngOnInit();
      expect(bookingServiceStub.getBookingTickets).toHaveBeenCalledTimes(1);

      (translate.onLangChange as Subject<unknown>).next({ lang: 'th' });
      expect(bookingServiceStub.getBookingTickets).toHaveBeenCalledTimes(2);
    });
  });

  describe('actions', () => {
    it('print() calls window.print', () => {
      const spy = spyOn(window, 'print');
      const component = createComponent();
      (component as any).print();
      expect(spy).toHaveBeenCalled();
    });

    it('backToSell() navigates to /staff/sell', () => {
      const router = createRouterStub();
      const component = new SellReceiptPageComponent(
        createActivatedRouteStub(1),
        router,
        bookingServiceStub,
        paymentServiceStub,
        new BoardingQrService(ticketServiceStub),
        createTranslateStub(),
        createAuthServiceStub()
      );
      const navigateSpy = spyOn(router, 'navigate').and.callThrough();
      (component as any).backToSell();
      expect(navigateSpy).toHaveBeenCalledWith(['/staff/sell']);
    });
  });

  describe('lifecycle', () => {
    it('cleans up on destroy', () => {
      const component = createComponent();
      component.ngOnInit();
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });
});
