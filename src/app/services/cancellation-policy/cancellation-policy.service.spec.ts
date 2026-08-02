import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CancellationPolicyDto, CancellationPolicyService } from './cancellation-policy.service';
import { environment } from '../../../environments/environment';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

describe('CancellationPolicyService', () => {
  let service: CancellationPolicyService;
  let httpMock: HttpTestingController;

  const payload: CancellationPolicyDto = {
    cancelWindowHours: 2,
    earlyWindowHours: 24,
    refundRateEarly: 0.8,
    refundRateLate: 0.5,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CancellationPolicyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('GETs the public cancellation-policy endpoint (no /private, no token requirement)', () => {
    let result: CancellationPolicyDto | undefined;

    service.getCancellationPolicy().subscribe((response) => {
      result = response.data;
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/cancellation-policy`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: payload });

    expect(result).toEqual(payload);
  });

  // OBRS-627, same reasoning as the BookingPolicyService precedent: /refund-policy
  // owns its own failure UX (inline error + retry in place of the rates section), so
  // this background read must not raise the blocking overlay on a public page, and
  // must not stack a global modal on top of that inline error -- or re-pop it on
  // every Retry click.
  it('opts out of the global loading overlay and the global error modal', () => {
    service.getCancellationPolicy().subscribe({ error: () => undefined });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/cancellation-policy`);
    expect(req.request.context.get(SKIP_GLOBAL_LOADING_ALERT)).toBeTrue();
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();

    req.flush({ code: 200, message: 'OK', data: payload });
  });
});
