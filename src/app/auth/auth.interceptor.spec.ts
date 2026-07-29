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

import {
  authInterceptor,
  LOGIN_REQUIRED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from './auth.interceptor';
import { AuthService } from './auth.service';
import { AlertService } from '../shared/services/alert.service';
import { APP_LANGUAGE_KEY, DEFAULT_LANGUAGE } from '../shared/services/language.service';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
} from '../shared/interceptors/http-context-tokens';
import { environment } from '../../environments/environment';

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

  // OBRS-601 (Scrutinize): the site the sweep missed. `appLanguage` is raw,
  // un-normalized localStorage — unlike every other locale-keyed map in this
  // repo, which narrows to the en|th|zh union first — so all eight prototype
  // members are reachable, not just the two that survive a lower-case.
  ['constructor', '__proto__', 'toString', 'valueOf'].forEach((planted) => {
    it(`OBRS-601: a planted "${planted}" app_language still shows a real message`, fakeAsync(() => {
      localStorage.setItem(APP_LANGUAGE_KEY, planted);

      http.get('/api/private/bookings').subscribe({ next: fail, error: () => {} });
      httpTesting
        .expectOne('/api/private/bookings')
        .flush({}, { status: 401, statusText: 'Unauthorized' });

      expect(alertWarningSpy)
        .withContext(planted)
        .toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE['th']);
      tick();
    }));
  });
});

// OBRS-856: a guest who never registered walks the booking flow (customer-area
// routes admit guests by design) and the first thing that rejects them is
// POST /api/private/bookings — a 401 on a request that carried NO Authorization
// header. The old code could not tell that apart from a dead session, so it
// announced "your session has expired" to someone who never had one and wiped
// storage that was already empty.
//
// This suite is deliberately two-directional. The "no token" cases are the bug;
// the "token present" case at the end is the must-NOT — it proves the fix did
// not quietly demote a REAL expiry (OBRS-187's force-logout) into a soft prompt.
describe('authInterceptor — a 401 with no token is not an expired session (OBRS-856)', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let clearSpy: jasmine.Spy;
  let alertWarningSpy: jasmine.Spy;
  let auth: AuthService;

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
        {
          provide: AlertService,
          useValue: jasmine.createSpyObj('AlertService', ['warning']),
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    // NOTE the contrast with the suite above: no auth_token is seeded here, so
    // getToken() is null and the request goes out with no Authorization header.
    clearSpy = spyOn(auth, 'clearAuthData').and.callThrough();
    alertWarningSpy = TestBed.inject(AlertService).warning as jasmine.Spy;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('guest 401 → says "please sign in", NOT "session expired"', fakeAsync(() => {
    http.post('/api/private/bookings', {}).subscribe({ next: fail, error: () => {} });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(alertWarningSpy).toHaveBeenCalledWith(LOGIN_REQUIRED_MESSAGE['th']);
    expect(alertWarningSpy).not.toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE['th']);
    tick();
  }));

  it('guest 401 → does NOT call clearAuthData (there is nothing to clear)', fakeAsync(() => {
    http.post('/api/private/bookings', {}).subscribe({ next: fail, error: () => {} });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(clearSpy).not.toHaveBeenCalled();
    tick();
  }));

  it('guest 401 → still routes to /login and remembers where to come back to', fakeAsync(() => {
    const redirectSpy = spyOn(auth, 'setPostLoginRedirectUrl').and.callThrough();

    http.post('/api/private/bookings', {}).subscribe({ next: fail, error: () => {} });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(redirectSpy).toHaveBeenCalledWith('/passenger-info');

    const navigateSpy = TestBed.inject(Router).navigate as jasmine.Spy;
    tick();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  }));

  it('guest 401 → the request really did go out with no Authorization header', fakeAsync(() => {
    http.post('/api/private/bookings', {}).subscribe({ next: fail, error: () => {} });
    const sent = httpTesting.expectOne('/api/private/bookings');

    expect(sent.request.headers.has('Authorization')).toBeFalse();

    sent.flush({}, { status: 401, statusText: 'Unauthorized' });
    tick();
  }));

  it('guest copy follows APP_LANGUAGE_KEY — en', fakeAsync(() => {
    localStorage.setItem(APP_LANGUAGE_KEY, 'en');

    http.post('/api/private/bookings', {}).subscribe({ next: fail, error: () => {} });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(alertWarningSpy).toHaveBeenCalledWith(LOGIN_REQUIRED_MESSAGE['en']);
    tick();
  }));

  // Same OBRS-601 threat model as SESSION_EXPIRED_MESSAGE: `appLanguage` is raw
  // localStorage, so the new map is reachable by prototype keys too and must
  // fall back to a real string rather than a function.
  ['constructor', '__proto__', 'toString', 'valueOf'].forEach((planted) => {
    it(`a planted "${planted}" app_language still shows a real guest message`, fakeAsync(() => {
      localStorage.setItem(APP_LANGUAGE_KEY, planted);

      http.post('/api/private/bookings', {}).subscribe({ next: fail, error: () => {} });
      httpTesting
        .expectOne('/api/private/bookings')
        .flush({}, { status: 401, statusText: 'Unauthorized' });

      expect(alertWarningSpy)
        .withContext(planted)
        .toHaveBeenCalledWith(LOGIN_REQUIRED_MESSAGE['th']);
      tick();
    }));
  });

  // MUST-NOT: the fix keys off the token, so seeding one inside THIS suite must
  // flip every assertion above back to the OBRS-187 behaviour. If this test ever
  // goes green while reading LOGIN_REQUIRED_MESSAGE, the branch has inverted and
  // real expired sessions are no longer being logged out.
  it('must-NOT: with a token present, the same 401 still expires the session and clears auth', fakeAsync(() => {
    localStorage.setItem('auth_token', 'a-real-but-rejected-token');

    http.post('/api/private/bookings', {}).subscribe({ next: fail, error: () => {} });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(alertWarningSpy).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE['th']);
    expect(alertWarningSpy).not.toHaveBeenCalledWith(LOGIN_REQUIRED_MESSAGE['th']);
    expect(clearSpy).toHaveBeenCalled();
    tick();
  }));
});

// OBRS-855: the customer this card exists for is signed in, has been filling in passenger details
// for over an hour, and presses Pay. Their access token died on a timer while they typed. Before
// this suite, the only answer to that 401 was to sign them out at the payment button.
//
// The whole point is that these tests seed `auth_refresh_token`. The suites above deliberately do
// NOT, which is why they still describe the old behaviour and must keep passing unchanged — a
// session with nothing to refresh with has nothing new to try.
describe('authInterceptor — refresh-and-retry on an expired access token (OBRS-855)', () => {
  const REFRESH_URL = `${environment.apiUrl}/api/auth/refresh`;

  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let clearSpy: jasmine.Spy;
  let alertWarningSpy: jasmine.Spy;
  let navigateSpy: jasmine.Spy;

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
            url: '/payment',
            navigate: jasmine
              .createSpy('navigate')
              .and.returnValue(Promise.resolve(true)),
          },
        },
        {
          provide: AlertService,
          useValue: jasmine.createSpyObj('AlertService', ['warning']),
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    localStorage.setItem('auth_token', 'expired-access-token');
    localStorage.setItem('auth_refresh_token', 'live-refresh-token');
    clearSpy = spyOn(TestBed.inject(AuthService), 'clearAuthData').and.callThrough();
    alertWarningSpy = TestBed.inject(AlertService).warning as jasmine.Spy;
    navigateSpy = TestBed.inject(Router).navigate as jasmine.Spy;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  const refreshOk = (accessToken = 'fresh-access-token', refreshToken = 'rotated-refresh-token') => ({
    code: 200,
    data: {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3600,
      refreshToken,
      refreshExpiresIn: 604800,
      user: { id: 1, fullName: 'R', email: 'rider@example.com', preferredLocale: 'th', status: 'ACTIVE', roles: ['user'] },
    },
  });

  it('401 → refreshes, REPLAYS the original request with the new bearer, and the caller sees the success', fakeAsync(() => {
    let received: unknown = null;
    http.post('/api/private/bookings', { seats: 2 }).subscribe({
      next: (body) => (received = body),
      error: fail,
    });

    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    httpTesting.expectOne(REFRESH_URL).flush(refreshOk());

    // The replay is what makes this a fix rather than a nicer error message: the page that asked
    // for the booking never learns the 401 happened.
    const replay = httpTesting.expectOne('/api/private/bookings');
    expect(replay.request.headers.get('Authorization')).toBe('Bearer fresh-access-token');
    replay.flush({ code: 200, data: { bookingId: 9 } });

    expect(received).toEqual({ code: 200, data: { bookingId: 9 } } as never);
    expect(clearSpy).not.toHaveBeenCalled();
    expect(alertWarningSpy).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
    tick();
  }));

  it('stores the ROTATED refresh token — keeping the spent one would make the next refresh look like a replay', fakeAsync(() => {
    http.get('/api/private/bookings').subscribe({ next: () => undefined, error: fail });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    const refresh = httpTesting.expectOne(REFRESH_URL);
    expect(refresh.request.body).toEqual({ refreshToken: 'live-refresh-token' });
    refresh.flush(refreshOk());

    httpTesting.expectOne('/api/private/bookings').flush({});

    expect(localStorage.getItem('auth_refresh_token')).toBe('rotated-refresh-token');
    expect(localStorage.getItem('auth_token')).toBe('fresh-access-token');
    tick();
  }));

  it('THREE simultaneous 401s produce exactly ONE refresh call — N rotations would trip the backend reuse detector', fakeAsync(() => {
    const urls = ['/api/private/bookings', '/api/private/promotions', '/api/private/users/me'];
    urls.forEach((url) => http.get(url).subscribe({ next: () => undefined, error: fail }));

    urls.forEach((url) =>
      httpTesting.expectOne(url).flush({}, { status: 401, statusText: 'Unauthorized' })
    );

    // The measurement. expectOne throws if a second POST to the refresh endpoint exists, which is
    // exactly the failure the single-flight guard exists to prevent — and the one that only shows
    // up under concurrency, i.e. only in production.
    httpTesting.expectOne(REFRESH_URL).flush(refreshOk());

    urls.forEach((url) => {
      const replay = httpTesting.expectOne(url);
      expect(replay.request.headers.get('Authorization')).toBe('Bearer fresh-access-token');
      replay.flush({});
    });

    expect(clearSpy).not.toHaveBeenCalled();
    tick();
  }));

  it('must-NOT: a REFUSED refresh still force-logouts — recovery may not become a way to survive a dead session', fakeAsync(() => {
    http.get('/api/private/bookings').subscribe({ next: fail, error: () => undefined });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    httpTesting
      .expectOne(REFRESH_URL)
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(clearSpy).toHaveBeenCalled();
    // DEFAULT_LANGUAGE, not a literal: this suite clears localStorage, so the interceptor falls
    // back to the app default. Spelling that default out here would make the assertion decay into
    // a false failure the day it changes.
    expect(alertWarningSpy).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE[DEFAULT_LANGUAGE]);
    tick();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  }));

  it('must-NOT: a 200 refresh response carrying no accessToken counts as REFUSED, not as success', fakeAsync(() => {
    http.get('/api/private/bookings').subscribe({ next: fail, error: () => undefined });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    // A friendly-looking envelope with nothing usable in it. Treating this as success would
    // replay the original request with the SAME dead token and loop the user through a second
    // 401 for no reason.
    httpTesting.expectOne(REFRESH_URL).flush({ code: 200, data: {} });

    expect(clearSpy).toHaveBeenCalled();
    tick();
  }));

  it('must-NOT: a 500 on the REPLAY is not an auth verdict — the user keeps their session', fakeAsync(() => {
    let status = 0;
    http.get('/api/private/bookings').subscribe({
      next: fail,
      error: (err) => (status = err.status),
    });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    httpTesting.expectOne(REFRESH_URL).flush(refreshOk());

    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 500, statusText: 'Server Error' });

    // Signing someone out over a backend blip is the OBRS-181 mistake wearing a new hat: the
    // token they now hold is provably fresh, so a 500 says nothing about their session.
    expect(status).toBe(500);
    expect(clearSpy).not.toHaveBeenCalled();
    expect(alertWarningSpy).not.toHaveBeenCalled();
    tick();
  }));

  it('must-NOT: a 401 on the REPLAY does force-logout — a brand-new token being refused ends the session', fakeAsync(() => {
    http.get('/api/private/bookings').subscribe({ next: fail, error: () => undefined });
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    httpTesting.expectOne(REFRESH_URL).flush(refreshOk());

    httpTesting
      .expectOne('/api/private/bookings')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(clearSpy).toHaveBeenCalled();
    tick();
  }));

  it('must-NOT: SKIP_AUTH_LOGOUT still opts a request out entirely — no refresh is attempted', fakeAsync(() => {
    http
      .post(
        '/api/private/promotions/validate',
        { code: 'CHILD50' },
        { context: new HttpContext().set(SKIP_AUTH_LOGOUT, true) }
      )
      .subscribe({ next: fail, error: () => undefined });

    httpTesting
      .expectOne('/api/private/promotions/validate')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    // OBRS-181 chose to let a silent preview fail quietly rather than disturb the session.
    // Spending a refresh token on its behalf would disturb it.
    httpTesting.expectNone(REFRESH_URL);
    expect(clearSpy).not.toHaveBeenCalled();
    tick();
  }));

  it('a 200 whose BODY says 401 takes the same recovery path as a transport 401', fakeAsync(() => {
    let received: unknown = null;
    http.get('/api/private/bookings').subscribe({
      next: (body) => (received = body),
      error: fail,
    });

    // OBRS-181's shape: HTTP 200, envelope says unauthorized.
    httpTesting
      .expectOne('/api/private/bookings')
      .flush({ status: 401, message: 'Unauthorized' });

    httpTesting.expectOne(REFRESH_URL).flush(refreshOk());

    const replay = httpTesting.expectOne('/api/private/bookings');
    expect(replay.request.headers.get('Authorization')).toBe('Bearer fresh-access-token');
    replay.flush({ code: 200, data: 'ok' });

    expect(received).toEqual({ code: 200, data: 'ok' } as never);
    expect(clearSpy).not.toHaveBeenCalled();
    tick();
  }));
});
