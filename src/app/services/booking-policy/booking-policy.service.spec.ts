import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { BookingPolicyService } from './booking-policy.service';
import { environment } from '../../../environments/environment';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

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

  // Scrutinize (OBRS-564): both callers own their own failure UX (inline error
  // + retry on business-policy; silent fallback on home-booking), so this call
  // must opt out of the global loading overlay AND the global error modal.
  // Without these, a background enhancement blocks the HOME page on every load
  // and stacks a modal on top of the inline error the component already shows.
  it('opts out of the global loading overlay and the global error modal', () => {
    service.getBookingPolicy().subscribe({ error: () => undefined });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/booking-policy`);
    expect(req.request.context.get(SKIP_GLOBAL_LOADING_ALERT)).toBeTrue();
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();

    req.flush({ code: 200, message: 'OK', data: { maxAdvanceDays: 45, cutoffMinutes: 20 } });
  });
});
