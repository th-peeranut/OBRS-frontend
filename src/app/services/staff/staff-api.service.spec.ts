import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { StaffApiService } from './staff-api.service';
import { environment } from '../../../environments/environment';
import { SKIP_AUTH_LOGOUT } from '../../shared/interceptors/http-context-tokens';

describe('StaffApiService', () => {
  let service: StaffApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [StaffApiService],
    });
    service = TestBed.inject(StaffApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getMySchedules() returns an observable', () => {
    service.getMySchedules().subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/schedules?assignedToMe=true`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: [] });
  });

  it('getBoardingList() returns an observable for a scheduleId', () => {
    service.getBoardingList(42).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/schedules/42/boarding-list`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: [] });
  });

  it('board() posts to the correct endpoint and sets SKIP_AUTH_LOGOUT', () => {
    service.board(7).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/7/board`);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ code: 200, message: 'OK', data: null });
  });

  it('unboard() posts to the correct endpoint and sets SKIP_AUTH_LOGOUT', () => {
    service.unboard(7).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/7/unboard`);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ code: 200, message: 'OK', data: null });
  });

  it('searchSchedules() posts to the search endpoint', () => {
    const searchReq = {
      bookingType: 'one_way' as const,
      departureDate: '2025-01-01',
      fromStop: 'a',
      toStop: 'b',
      numberOfPassengers: 1,
    };
    service.searchSchedules(searchReq).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/public/schedules/search`);
    expect(req.request.method).toBe('POST');
    req.flush({ code: 200, message: 'OK', data: { departureSchedules: [], arrivalSchedules: [] } });
  });

  it('boardingScan() posts { token, scheduleId } to the boarding-scan endpoint', () => {
    service.boardingScan({ token: 'signed.jwt.token', scheduleId: 42 }).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/boarding-scan`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'signed.jwt.token', scheduleId: 42 });
    req.flush({
      code: 200,
      message: 'OK',
      data: {
        ticketId: 7,
        ticketNumber: 'T-ABC123',
        passengerName: 'Mr. Abc Def',
        seatNumber: '3',
        boardedAt: '2026-07-10T08:00:00Z',
      },
    });
  });

  it('boardingScan() sets SKIP_AUTH_LOGOUT (defense-in-depth against OBRS-187)', () => {
    service.boardingScan({ token: 'bad-token', scheduleId: 42 }).subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/boarding-scan`);
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ errorCode: 'INVALID_TICKET_TOKEN' }, { status: 400, statusText: 'Bad Request' });
  });

  it('payWalkIn() sends Idempotency-Key header', () => {
    service.payWalkIn(1, 'test-key-123').subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/payments/walk-in`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('test-key-123');
    req.flush({ code: 200, message: 'OK', data: { id: 1, bookingId: 1, status: 'paid', paymentMethod: 'cash', amount: 100 } });
  });
});
