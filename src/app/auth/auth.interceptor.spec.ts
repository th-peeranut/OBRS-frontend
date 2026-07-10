import {
  HttpClient,
  HttpContext,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';

import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { SKIP_GLOBAL_ERROR_ALERT } from '../shared/interceptors/http-context-tokens';

// Regression for OBRS-181: a 401 on a SILENT request (SKIP_GLOBAL_ERROR_ALERT,
// e.g. the promo-code validate preview) must NOT clear auth / redirect to login.
// A 401 on a normal request still must. The catchError path (real HTTP 401) is
// the one observed logging customers out mid-checkout on a transient blip.
describe('authInterceptor — silent 401 does not force logout (OBRS-181)', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let clearSpy: jasmine.Spy;

  const silentCtx = () =>
    new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: Router,
          useValue: {
            url: '/passenger-info',
            navigate: jasmine
              .createSpy('navigate')
              .and.returnValue(Promise.resolve(true)),
          },
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    localStorage.setItem('auth_token', 'valid-token'); // present so getToken() is truthy
    clearSpy = spyOn(TestBed.inject(AuthService), 'clearAuthData').and.callThrough();
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('normal 401 → clears auth (logout) — existing behavior preserved', fakeAsync(() => {
    http.get('/api/private/bookings').subscribe({ next: fail, error: () => {} });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(clearSpy).toHaveBeenCalled();
    tick(); // flush the setTimeout navigate so the module auth-error guard resets
  }));

  it('silent 401 (validate preview) → does NOT clear auth / logout', fakeAsync(() => {
    http
      .post('/api/private/promotions/validate', { code: 'CHILD50', amount: 200 }, { context: silentCtx() })
      .subscribe({ next: fail, error: () => {} });
    httpTesting
      .expectOne('/api/private/promotions/validate')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(clearSpy).not.toHaveBeenCalled();
    tick();
  }));

  it('silent 200-with-401-body → does NOT clear auth / logout, still errors to caller', fakeAsync(() => {
    let errored = false;
    http
      .post('/api/private/promotions/validate', {}, { context: silentCtx() })
      .subscribe({ next: fail, error: () => (errored = true) });
    httpTesting
      .expectOne('/api/private/promotions/validate')
      .flush({ status: 401, message: 'Unauthorized' }); // HTTP 200, unauthorized-shaped body

    expect(clearSpy).not.toHaveBeenCalled();
    expect(errored).toBeTrue();
    tick();
  }));
});
