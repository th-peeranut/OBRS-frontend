import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { StaffApiService } from './staff-api.service';
import { environment } from '../../../environments/environment';

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

  it('checkIn() posts to the correct endpoint', () => {
    service.checkIn(7).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/7/check-in`);
    expect(req.request.method).toBe('POST');
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
