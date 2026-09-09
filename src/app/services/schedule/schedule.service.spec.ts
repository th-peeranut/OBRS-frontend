import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { ScheduleService } from './schedule.service';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

describe('ScheduleService', () => {
  let service: ScheduleService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ScheduleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // OBRS-1364. This lookup fires on every passenger-type click and its caller
  // already treats a failure as "nothing is blocked", so it must not reach the
  // global interceptor: without these two flags the full-screen loading overlay
  // flashes on each click, and one failed lookup opens a SweetAlert whose
  // backdrop swallows the click on Next.
  it('asks for blocked seats without the global loading overlay or error alert', () => {
    service.getBlockedSeats(7, 'monk', 11, 12).subscribe();

    const req = httpMock.expectOne((r) =>
      r.url.endsWith('/api/schedules/7/blocked-seats')
    );
    expect(req.request.params.get('passengerType')).toBe('monk');
    expect(req.request.params.get('fromStopId')).toBe('11');
    expect(req.request.params.get('toStopId')).toBe('12');
    expect(req.request.context.get(SKIP_GLOBAL_LOADING_ALERT)).toBeTrue();
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();

    req.flush({ code: 200, data: [] });
  });
});
