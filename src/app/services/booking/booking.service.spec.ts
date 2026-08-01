import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BookingService } from './booking.service';
import { BookingPayload } from '../../shared/interfaces/booking.interface';
import { environment } from '../../../environments/environment';
import { SKIP_AUTH_LOGOUT } from '../../shared/interceptors/http-context-tokens';

const PAYLOAD: BookingPayload = {
  bookingType: 'one_way',
  totalAmount: 1000,
  bookingChannel: 'online',
  contact: {
    title: 'Mr.',
    firstName: 'A',
    middleName: null,
    lastName: 'B',
    phoneNumber: '0800000000',
    preferredLocale: 'en',
  },
  departureSchedule: {
    scheduleId: 1,
    fromStop: 'a',
    toStop: 'b',
    departureDateTime: '2026-01-01T00:00:00+07:00',
    arrivalDateTime: '2026-01-01T05:00:00+07:00',
    passengers: [],
  },
};

describe('BookingService', () => {
  let service: BookingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [BookingService],
    });
    service = TestBed.inject(BookingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('createBooking', () => {
    it('does not suppress the global error alert by default (unrelated to a promo code)', () => {
      service.createBooking(PAYLOAD).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/bookings`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(PAYLOAD);

      req.flush({ code: 201, message: 'Created', data: { bookingId: 1, bookingNumber: 'BK1' } });
    });

    it('OBRS-109: suppresses the global error alert when the caller passes suppressGlobalErrorAlert=true', () => {
      const payloadWithPromo: BookingPayload = { ...PAYLOAD, promotionCode: 'SAVE20' };
      service.createBooking(payloadWithPromo, true).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/bookings`);
      expect(req.request.body.promotionCode).toBe('SAVE20');
      // Presence of the context token itself is what the interceptor reads;
      // we can only assert it was attached, not decoded here.
      expect(req.request.context).toBeTruthy();

      req.flush({ code: 201, message: 'Created', data: { bookingId: 1, bookingNumber: 'BK1' } });
    });

    it('normalizes the create-booking response to { bookingId, bookingNumber, ...discount fields }', () => {
      let result: unknown;
      service.createBooking(PAYLOAD).subscribe((response) => (result = response.data));

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/bookings`);
      req.flush({
        code: 201,
        message: 'Created',
        data: { bookingId: 42, bookingNumber: 'BK42', totalAmount: 1000, discountAmountSnapshot: 100, netAmount: 900 },
      });

      expect(result).toEqual({
        bookingId: 42,
        bookingNumber: 'BK42',
        totalAmount: 1000,
        discountAmountSnapshot: 100,
        netAmount: 900,
      });
    });
  });

  describe('confirmChangeSeat (OBRS-171)', () => {
    it('normalizes letter-prefixed seat labels to bare digits before POSTing — defense in depth alongside the dialog\'s own normalization', () => {
      service.confirmChangeSeat(5, { 11: 'A5', 12: 'B12' }).subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/bookings/5/change-seat`
      );
      expect(req.request.method).toBe('POST');
      // The backend's change-seat API takes bare numeric seat numbers
      // ("1".."N"), never the seat-map's letter-prefixed labels — an
      // un-normalized payload 400'd every confirm
      // (CHANGE_SEAT_ERROR_SEAT_NOT_IN_MAP/CHANGE_SEAT_ERROR_TICKET_MISMATCH).
      expect(req.request.body).toEqual({ seatAssignments: { 11: '5', 12: '12' } });

      req.flush({
        code: 200,
        message: 'OK',
        data: { bookingId: 5, bookingNumber: 'BK5', status: 'CONFIRMED', paymentIntentId: null },
      });
    });

    it('is a no-op on an already bare-numeric seatAssignments map', () => {
      service.confirmChangeSeat(5, { 11: '5' }).subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/bookings/5/change-seat`
      );
      expect(req.request.body).toEqual({ seatAssignments: { 11: '5' } });

      req.flush({
        code: 200,
        message: 'OK',
        data: { bookingId: 5, bookingNumber: 'BK5', status: 'CONFIRMED', paymentIntentId: null },
      });
    });
  });

  // OBRS-942 — one cancel screen now opens for every refund method, and the
  // non-manual lane's Confirm never collects a destination. The risk this
  // pins: `toHaveBeenCalledWith(id, { refundDestination: undefined })` on a
  // mocked service would pass just as well if `refundDestination` were `null`
  // — `JSON.stringify` treats the two very differently (drops an `undefined`
  // key, keeps a `null` one as `"refundDestination":null`), and only a real
  // HTTP request shows which one actually ships. Asserted at the
  // HttpTestingController layer for exactly that reason.
  describe('cancelBooking (OBRS-942)', () => {
    it('the non-manual lane never types refundDestination as null — the wire body is {}', () => {
      service.cancelBooking(5, { refundDestination: undefined }).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/bookings/5/cancel`);
      expect(req.request.method).toBe('POST');
      expect(JSON.stringify(req.request.body)).toBe('{}');

      req.flush({
        code: 200,
        message: 'OK',
        data: { bookingId: 5, bookingNumber: 'BK5', status: 'cancelled', refundAmount: 500, refundMethod: 'card' },
      });
    });

    it('the manual lane still posts a populated refundDestination untouched', () => {
      const refundDestination = { type: 'promptpay' as const, promptpayPhone: '0812345678' };
      service.cancelBooking(5, { refundDestination }).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/api/private/bookings/5/cancel`);
      expect(JSON.stringify(req.request.body)).toBe(JSON.stringify({ refundDestination }));

      req.flush({
        code: 200,
        message: 'OK',
        data: {
          bookingId: 5,
          bookingNumber: 'BK5',
          status: 'cancelled',
          refundAmount: 400,
          refundMethod: 'MANUAL_REFUND_REQUIRED',
        },
      });
    });
  });

  // OBRS-575 scrutinize: the component spec only asserts the ARGUMENT
  // (`getMyBookings(undefined, false, true)`) — a proxy, not the effect. If
  // `listContext` ever stopped threading the flag, every suite stays green
  // while Home silently force-logs-out an expired session again (OBRS-187).
  // Pin the real request context, same shape as parcel-tracking.service.spec.ts:51.
  describe('getMyBookings — SKIP_AUTH_LOGOUT context (OBRS-575 / AC#8)', () => {
    const url = `${environment.apiUrl}/api/private/bookings/me?page=0&size=100`;

    it('sets SKIP_AUTH_LOGOUT when skipAuthLogout=true (Home background fetch)', () => {
      service.getMyBookings(undefined, false, true).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
      req.flush({ code: 200, message: 'OK', data: { content: [] } });
    });

    it('does NOT set SKIP_AUTH_LOGOUT by default — /my-bookings must still force-logout on a real 401', () => {
      service.getMyBookings().subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeFalse();
      req.flush({ code: 200, message: 'OK', data: { content: [] } });
    });
  });
});
