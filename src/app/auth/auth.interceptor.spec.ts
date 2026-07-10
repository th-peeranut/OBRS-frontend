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

import { authInterceptor, SESSION_EXPIRED_MESSAGE } from './auth.interceptor';
import { AuthService } from './auth.service';
import { AlertService } from '../shared/services/alert.service';
import { APP_LANGUAGE_KEY } from '../shared/services/language.service';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
} from '../shared/interceptors/http-context-tokens';

// Regression for OBRS-181/OBRS-187: SKIP_AUTH_LOGOUT (not SKIP_GLOBAL_ERROR_ALERT)
// governs whether a 401 forces logout. A silent-toast request (SKIP_GLOBAL_ERROR_ALERT
// only, e.g. an admin/protected call) must still logout on a real 401 — that's the
// OBRS-187 bug (expired sessions on protected pages got stuck instead of redirecting).
// Only a request that explicitly opts out via SKIP_AUTH_LOGOUT (e.g. the promo-code
// validate preview) is exempt. The catchError path (real HTTP 401) is the one observed
// logging customers out mid-checkout on a transient blip / leaving admin pages stuck.
describe('authInterceptor — SKIP_AUTH_LOGOUT governs force-logout (OBRS-181/OBRS-187)', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let clearSpy: jasmine.Spy;
  let alertWarningSpy: jasmine.Spy;

  const silentToastOnlyCtx = () =>
    new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true);

  const skipAuthLogoutCtx = () =>
    new HttpContext()
      .set(SKIP_GLOBAL_ERROR_ALERT, true)
      .set(SKIP_AUTH_LOGOUT, true);

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
        // Full spy object (not spyOn+callThrough) — a real AlertService.warning()
        // calls Swal.fire() and pops an actual dialog in the ChromeHeadless run,
        // matching the pattern used elsewhere (e.g. reschedule.effect.spec.ts).
        {
          provide: AlertService,
          useValue: jasmine.createSpyObj('AlertService', ['warning']),
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    localStorage.setItem('auth_token', 'valid-token'); // present so getToken() is truthy
    clearSpy = spyOn(TestBed.inject(AuthService), 'clearAuthData').and.callThrough();
    alertWarningSpy = TestBed.inject(AlertService).warning as jasmine.Spy;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('normal 401 (no SKIP_AUTH_LOGOUT) → clears auth (logout) — existing behavior preserved', fakeAsync(() => {
    http.get('/api/private/bookings').subscribe({ next: fail, error: () => {} });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(clearSpy).toHaveBeenCalled();
    expect(alertWarningSpy).toHaveBeenCalled();
    tick(); // flush the setTimeout navigate so the module auth-error guard resets
  }));

  it('OBRS-187: 401 on a protected admin-style call that only suppresses the toast (SKIP_GLOBAL_ERROR_ALERT) still force-logouts', fakeAsync(() => {
    http
      .get('/api/private/vehicles', { context: silentToastOnlyCtx() })
      .subscribe({ next: fail, error: () => {} });
    httpTesting
      .expectOne('/api/private/vehicles')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(clearSpy).toHaveBeenCalled();
    expect(alertWarningSpy).toHaveBeenCalled();
    tick();
  }));

  it('silent 401 (validate preview, SKIP_AUTH_LOGOUT) → does NOT clear auth / logout', fakeAsync(() => {
    http
      .post('/api/private/promotions/validate', { code: 'CHILD50', amount: 200 }, { context: skipAuthLogoutCtx() })
      .subscribe({ next: fail, error: () => {} });
    httpTesting
      .expectOne('/api/private/promotions/validate')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(clearSpy).not.toHaveBeenCalled();
    expect(alertWarningSpy).not.toHaveBeenCalled();
    tick();
  }));

  it('silent 200-with-401-body (SKIP_AUTH_LOGOUT) → does NOT clear auth / logout, still errors to caller', fakeAsync(() => {
    let errored = false;
    http
      .post('/api/private/promotions/validate', {}, { context: skipAuthLogoutCtx() })
      .subscribe({ next: fail, error: () => (errored = true) });
    httpTesting
      .expectOne('/api/private/promotions/validate')
      .flush({ status: 401, message: 'Unauthorized' }); // HTTP 200, unauthorized-shaped body

    expect(clearSpy).not.toHaveBeenCalled();
    expect(errored).toBeTrue();
    tick();
  }));

  it('OBRS-187: 3 parallel protected 401s (dashboard fan-out) → single toast + single navigate, not one per in-flight request', fakeAsync(() => {
    const urls = [
      '/api/private/vehicles',
      '/api/private/bookings',
      '/api/private/dashboard/summary',
    ];

    // Fire all 3 requests before any of them resolve, mirroring a dashboard
    // that fans out several parallel calls on load.
    urls.forEach((url) =>
      http.get(url, { context: silentToastOnlyCtx() }).subscribe({ next: fail, error: () => {} })
    );

    // Flush all 3 with a 401 synchronously (no tick() between them), so the
    // module-level isHandlingAuthError guard is still set from the first one
    // when the 2nd/3rd flush arrive.
    urls.forEach((url) =>
      httpTesting.expectOne(url).flush({}, { status: 401, statusText: 'Unauthorized' })
    );

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(alertWarningSpy).toHaveBeenCalledTimes(1);

    const navigateSpy = TestBed.inject(Router).navigate as jasmine.Spy;
    tick(); // flush the single scheduled setTimeout navigate
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  }));

  it('OBRS-187: mergeMap branch — 200-with-401-body on a protected call (no SKIP_AUTH_LOGOUT) force-logs-out', fakeAsync(() => {
    let errored = false;
    http
      .get('/api/private/bookings-summary', { context: silentToastOnlyCtx() })
      .subscribe({ next: fail, error: () => (errored = true) });
    httpTesting
      .expectOne('/api/private/bookings-summary')
      .flush({ status: 401, message: 'Unauthorized' }); // HTTP 200, unauthorized-shaped body

    expect(clearSpy).toHaveBeenCalled();
    expect(alertWarningSpy).toHaveBeenCalled();
    expect(errored).toBeTrue();

    const navigateSpy = TestBed.inject(Router).navigate as jasmine.Spy;
    tick();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  }));

  it('OBRS-187: session-expired toast text follows APP_LANGUAGE_KEY — en', fakeAsync(() => {
    localStorage.setItem(APP_LANGUAGE_KEY, 'en');

    http.get('/api/private/bookings').subscribe({ next: fail, error: () => {} });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(alertWarningSpy).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE['en']);
    tick();
  }));

  it('OBRS-187: session-expired toast text falls back to Thai when no language is stored', fakeAsync(() => {
    // beforeEach already localStorage.clear()s, so APP_LANGUAGE_KEY is unset
    // and the interceptor's DEFAULT_LANGUAGE ('th') applies.
    http.get('/api/private/bookings').subscribe({ next: fail, error: () => {} });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(alertWarningSpy).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE['th']);
    tick();
  }));
});
