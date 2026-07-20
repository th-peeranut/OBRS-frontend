import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { BookingPolicyService } from './booking-policy.service';
import { environment } from '../../../environments/environment';

describe('BookingPolicyService', () => {
  let service: BookingPolicyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BookingPolicyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('GETs the public booking-policy endpoint (no /private, no token requirement)', () => {
    let result: { maxAdvanceDays: number; cutoffMinutes: number } | undefined;

    service.getBookingPolicy().subscribe((response) => {
      result = response.data;
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/booking-policy`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: { maxAdvanceDays: 45, cutoffMinutes: 20 } });

    expect(result).toEqual({ maxAdvanceDays: 45, cutoffMinutes: 20 });
  });
});
