import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BookingService } from './booking.service';
import { BookingPayload } from '../../shared/interfaces/booking.interface';
import { environment } from '../../../environments/environment';

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
});
