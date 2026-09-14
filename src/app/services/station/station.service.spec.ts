import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { StationService } from './station.service';
import {
  SHOW_BLOCKING_LOADING,
  SKIP_GLOBAL_ERROR_ALERT,
} from '../../shared/interceptors/http-context-tokens';

describe('StationService', () => {
  let service: StationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // OBRS-1056 needed a per-call opt-out here, because `error.interceptor.ts`
  // raised the blocking SweetAlert2 popup over an already-open dialog for every
  // `/api/` request. OBRS-908 removed the flag AND the reason for it: this asserts
  // the token ON THE REQUEST (not on an argument), because the failure mode is a
  // context that never reaches `HttpClient` and a token that silently falls back to
  // its default — which is now the safe answer, so the assertion is that the safe
  // answer is what arrives.
  it('never opts a stop lookup into the blocking overlay', () => {
    service.getAll().subscribe();

    const req = httpMock.expectOne((r) => r.url.endsWith('/api/stops'));
    expect(req.request.context.get(SHOW_BLOCKING_LOADING)).toBeFalse();
    req.flush({ code: 200, message: 'OK', data: [] });
  });

  // OBRS-1222 AC4 — the half of the guard that lives at the service: the error
  // modal is a SEPARATE decision, and the overlay's disappearance must not quietly
  // take it with it. Both dialog lanes (change-stop, reschedule) rely on the error
  // alert still firing, and their own specs pin it there.
  it('leaves the error alert on for a caller that did not opt out', () => {
    service.getAll().subscribe();

    const req = httpMock.expectOne((r) => r.url.endsWith('/api/stops'));
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeFalse();
    req.flush({ code: 200, message: 'OK', data: [] });
  });

  // OBRS-1222 — the ProvinceEffect argument. Asserted on the REQUEST, not on
  // what we passed: the failure this catches is a context object that never
  // reaches HttpClient, where the token silently falls back to `() => false`
  // and the modal this card removed comes straight back (that is exactly how
  // OBRS-1056 shipped broken).
  it('opts the request out of the global error alert when asked', () => {
    service.getAll({ skipErrorAlert: true }).subscribe();

    const req = httpMock.expectOne((r) => r.url.endsWith('/api/stops'));
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();
    expect(req.request.context.get(SHOW_BLOCKING_LOADING)).toBeFalse();
    req.flush({ code: 200, message: 'OK', data: [] });
  });

  // The no-argument callers (ParcelBookingPageComponent today) must get the
  // interceptor's own defaults for both tokens — no overlay, error alert on.
  // ⛔ If this test ever has to change, the change is wrong: it is the one that
  // fails when someone moves a per-call decision into the service.
  it('leaves both tokens at the interceptor default', () => {
    service.getAll().subscribe();

    const req = httpMock.expectOne((r) => r.url.endsWith('/api/stops'));
    expect(req.request.context.get(SHOW_BLOCKING_LOADING)).toBeFalse();
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeFalse();
    req.flush({ code: 200, message: 'OK', data: [] });
  });
});
