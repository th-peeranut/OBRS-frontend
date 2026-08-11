import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { StationService } from './station.service';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
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

  // OBRS-1056. Asserts the token ON THE REQUEST, not the argument we passed:
  // the defect was that no context object reached `HttpClient` at all, so the
  // token fell back to its `() => false` default and `error.interceptor.ts`
  // raised the blocking SweetAlert2 loading popup over an already-open dialog.
  // Reading `req.request.context` is the only thing that distinguishes "opted
  // out" from "never set".
  it('opts the request out of the global loading alert when asked', () => {
    service.getAll({ skipLoadingAlert: true }).subscribe();

    const req = httpMock.expectOne((r) => r.url.endsWith('/api/stops'));
    expect(req.request.context.get(SKIP_GLOBAL_LOADING_ALERT)).toBeTrue();
    req.flush({ code: 200, message: 'OK', data: [] });
  });

  // OBRS-1222 AC4 — the half of the guard that lives at the service. The two
  // flags are INDEPENDENT: opting out of the spinner must never quietly opt a
  // caller out of the error modal too. Both dialog lanes (change-stop,
  // reschedule) pass exactly this argument, and their own specs pin it there.
  it('opting out of the loading alert does NOT opt out of the error alert', () => {
    service.getAll({ skipLoadingAlert: true }).subscribe();

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
    service.getAll({ skipLoadingAlert: true, skipErrorAlert: true }).subscribe();

    const req = httpMock.expectOne((r) => r.url.endsWith('/api/stops'));
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();
    expect(req.request.context.get(SKIP_GLOBAL_LOADING_ALERT)).toBeTrue();
    req.flush({ code: 200, message: 'OK', data: [] });
  });

  // The no-argument callers (ParcelBookingPageComponent today) still want both
  // globals, so the default must stay the interceptor's default — for BOTH
  // flags. ⛔ If this test ever has to change, the change is wrong: it is the
  // one that fails when someone moves a per-call decision into the service.
  it('leaves both globals on by default', () => {
    service.getAll().subscribe();

    const req = httpMock.expectOne((r) => r.url.endsWith('/api/stops'));
    expect(req.request.context.get(SKIP_GLOBAL_LOADING_ALERT)).toBeFalse();
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeFalse();
    req.flush({ code: 200, message: 'OK', data: [] });
  });
});
