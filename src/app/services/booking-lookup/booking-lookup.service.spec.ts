import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { BookingLookupService } from './booking-lookup.service';
import { environment } from '../../../environments/environment';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

describe('BookingLookupService', () => {
  let service: BookingLookupService;
  let httpMock: HttpTestingController;
  const url = `${environment.apiUrl}/api/bookings/lookup`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [BookingLookupService],
    });
    service = TestBed.inject(BookingLookupService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('posts to the PUBLIC path — no /api/private segment', () => {
    service
      .lookup({ bookingNumber: 'B-ABC234', phoneNumber: '0812345678' })
      .subscribe((res) => expect(res).toBeTruthy());

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('POST');
    expect(req.request.url).not.toContain('/api/private');
    req.flush({ code: 200, message: 'OK', data: { bookingNumber: 'B-ABC234' } });
  });

  it('carries the phone in the BODY, never in the URL', () => {
    service
      .lookup({ bookingNumber: 'B-ABC234', phoneNumber: '0812345678' })
      .subscribe();

    const req = httpMock.expectOne(url);
    // The whole reason this endpoint is a POST: a query-string phone number lands in every
    // proxy access log and in browser history, and nothing downstream can take it back.
    expect(req.request.urlWithParams).not.toContain('0812345678');
    expect(req.request.body).toEqual({
      bookingNumber: 'B-ABC234',
      phoneNumber: '0812345678',
    });
    req.flush({ code: 200, message: 'OK', data: { bookingNumber: 'B-ABC234' } });
  });

  it('sets SKIP_AUTH_LOGOUT so an expired token never force-logs the viewer out', () => {
    service
      .lookup({ bookingNumber: 'B-ZZZZZZ', phoneNumber: '0800000000' })
      .subscribe({ next: () => undefined, error: () => undefined });

    const req = httpMock.expectOne(url);
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ errorCode: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
  });

  it('suppresses the global error toast and spinner — a typo is not an incident', () => {
    service
      .lookup({ bookingNumber: 'B-ZZZZZZ', phoneNumber: '0800000000' })
      .subscribe({ next: () => undefined, error: () => undefined });

    const req = httpMock.expectOne(url);
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();
    expect(req.request.context.get(SKIP_GLOBAL_LOADING_ALERT)).toBeTrue();
    req.flush({ errorCode: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
  });
});
