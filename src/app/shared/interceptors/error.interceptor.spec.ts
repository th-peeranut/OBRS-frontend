import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { EventEmitter } from '@angular/core';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import { AlertService } from '../services/alert.service';
import { APP_LANGUAGE_KEY } from '../services/language.service';
import { errorInterceptor, IDEMPOTENT_REQUEST_TIMEOUT_MS } from './error.interceptor';
import { ApiLatencyTelemetryService } from '../../services/analytics/api-latency-telemetry.service';
import { SKIP_REQUEST_TIMEOUT } from './http-context-tokens';

// Regression guard for OBRS-352: errorInterceptor injected TranslateService
// unconditionally at the top of the functional interceptor, so it re-entered
// TranslateService while its own HTTP loader (GET /i18n/{lang}.json) was still
// constructing -> NG0200 circular DI -> raw i18n keys app-wide on cold load.
// The fix resolves TranslateService lazily, only for /api/ requests. These
// tests pin: (1) a non-/api/ request must NOT depend on TranslateService at all
// (fails on the old code with NullInjectorError — the unit-test-observable proxy
// for the reentrant NG0200), and (2) the /api/ 503 message still gets translated.
describe('errorInterceptor', () => {
  let alertService: jasmine.SpyObj<AlertService>;

  function configure(providers: unknown[] = []): void {
    // OBRS-930 reads the customer's chosen language from localStorage, and karma
    // shares one across the whole run: a test that leaves 'en' behind would
    // silently change what the NEXT test is exercising.
    localStorage.removeItem(APP_LANGUAGE_KEY);
    alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'showLoading',
      'updateLoadingTitle',
      'hideLoading',
      'error',
    ]);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alertService },
        ...(providers as never[]),
      ],
    });
  }

  /**
   * A TranslateService double that can answer the question OBRS-930 made this
   * interceptor ask: WHICH language bundles are in the store right now.
   *
   * `jasmine.createSpyObj`'s property bag cannot express that, because the store
   * has to CHANGE mid-test — a bundle landing is the event under test. So this
   * is a plain object with a real spy on `instant`, a mutable `translations`,
   * and a real EventEmitter for `onLangChange`.
   */
  interface TranslateDouble extends TranslateService {
    instant: jasmine.Spy;
    translations: Record<string, unknown>;
    onLangChange: EventEmitter<LangChangeEvent>;
  }

  function translateDouble(loaded: string[]): TranslateDouble {
    const translations: Record<string, unknown> = {};
    for (const lang of loaded) {
      translations[lang] = { COMMON: {} };
    }
    return {
      // What ngx-translate does with a key it cannot resolve: hands it back.
      instant: jasmine.createSpy('instant').and.callFake((key: string) => key),
      translations,
      currentLang: loaded[0] ?? 'th',
      onLangChange: new EventEmitter<LangChangeEvent>(),
    } as unknown as TranslateDouble;
  }

  /** The warm state every test here except the OBRS-930 group means to exercise. */
  const loadedTranslateSpy = (): TranslateDouble => translateDouble(['th']);

  it('does not resolve TranslateService for a non-/api/ request (the i18n loader path) — guards the NG0200 cold-load cycle', () => {
    // No TranslateService provider on purpose: the old top-level inject() would
    // throw NullInjectorError here for EVERY request, including GET /i18n/*. The
    // fix skips the inject for non-/api/ URLs, so this request must succeed.
    configure();
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    let ok = false;
    http.get('/i18n/en.json').subscribe({ next: () => (ok = true) });
    httpMock.expectOne('/i18n/en.json').flush({ WELCOME: 'ยินดีต้อนรับ' });

    expect(ok).toBeTrue();
    httpMock.verify();
  });

  it('shows the backend message verbatim for the gateway-ceiling refusal — the precondition the payment components rely on (OBRS-736)', () => {
    // Load-bearing, not decorative. payment-creditcard / payment-qrcode now SKIP
    // their generic "payment failed" toast for this errorCode, on the strength of
    // this interceptor having already shown the backend's own message. If that
    // ever stopped being true, the passenger would see nothing at all — a worse
    // outcome than the double toast this replaced. So the assumption is pinned
    // here rather than assumed there.
    const translate = loadedTranslateSpy();
    configure([{ provide: TranslateService, useValue: translate }]);
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);
    const backendMessage =
      'ยอดนี้ชำระออนไลน์ไม่ได้ เพราะผู้ให้บริการชำระเงินรับได้สูงสุด 10,000 บาทต่อหนึ่งรายการ กดชำระซ้ำก็จะไม่ผ่าน กรุณาแยกเป็นหลายการจอง หรือชำระเป็นเงินสดที่เคาน์เตอร์';

    http
      .post('/api/private/payments', {})
      .subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('/api/private/payments').flush(
      {
        errorCode: 'PAYMENT_AMOUNT_EXCEEDS_GATEWAY_LIMIT',
        message: backendMessage,
      },
      { status: 400, statusText: 'Bad Request' }
    );

    // Verbatim, not a translated key: a 400 is not one of the transport statuses
    // statusAlertMessageKey() maps, so the backend's own wording passes through.
    expect(alertService.error).toHaveBeenCalledWith(backendMessage);
    expect(translate.instant).not.toHaveBeenCalledWith(
      'COMMON.ERROR.REQUEST_FAILED'
    );
    httpMock.verify();
  });

  // OBRS-1381: the two signup ceilings added by OBRS-1375 reach the browser as
  // the same status with different bodies, and the interceptor used to throw
  // both bodies away. What the user was told for the shared daily cap — "wait a
  // moment and try again" — is advice that cannot work before tomorrow.
  it('shows the backend message on a 429 that carries one', () => {
    const translate = loadedTranslateSpy();
    configure([{ provide: TranslateService, useValue: translate }]);
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);
    const backendMessage =
      'ระบบสมัครสมาชิกไม่พร้อมให้บริการชั่วคราว กรุณาลองใหม่อีกครั้งภายหลัง';

    http.post('/api/auth/signup', {}).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('/api/auth/signup').flush(
      {
        errorCode: 'AUTH_SIGNUP_ERROR_TEMPORARILY_UNAVAILABLE',
        message: backendMessage,
      },
      { status: 429, statusText: 'Too Many Requests' }
    );

    expect(alertService.error).toHaveBeenCalledWith(backendMessage);
    expect(translate.instant).not.toHaveBeenCalledWith(
      'COMMON.ERROR.TOO_MANY_REQUESTS'
    );
    httpMock.verify();
  });

  it('still translates the generic rate-limit message for a 429 with no message of ours', () => {
    const translate = loadedTranslateSpy();
    translate.instant.and.returnValue('มีคำขอเข้ามามากเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง');
    configure([{ provide: TranslateService, useValue: translate }]);
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    http.get('/api/foo').subscribe({ next: () => {}, error: () => {} });
    // The edge refusing on its own behalf: no body of ours to prefer.
    httpMock
      .expectOne('/api/foo')
      .flush(null, { status: 429, statusText: 'Too Many Requests' });

    expect(translate.instant).toHaveBeenCalledWith('COMMON.ERROR.TOO_MANY_REQUESTS');
    expect(alertService.error).toHaveBeenCalledWith(
      'มีคำขอเข้ามามากเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'
    );
    httpMock.verify();
  });

  it('translates the dedicated 503 dependency-outage message on an /api/ request (behavior preserved)', () => {
    const translate = loadedTranslateSpy();
    translate.instant.and.returnValue('บริการไม่พร้อมใช้งานชั่วคราว');
    configure([{ provide: TranslateService, useValue: translate }]);
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    http.get('/api/foo').subscribe({ next: () => {}, error: () => {} });
    httpMock
      .expectOne('/api/foo')
      .flush({}, { status: 503, statusText: 'Service Unavailable' });

    expect(translate.instant).toHaveBeenCalledWith(
      'COMMON.ERROR.SERVICE_UNAVAILABLE'
    );
    expect(alertService.error).toHaveBeenCalledWith(
      'บริการไม่พร้อมใช้งานชั่วคราว'
    );
    httpMock.verify();
  });

  // OBRS-567: the end-to-end assertion the unit tests on api-error.ts cannot
  // make — what the USER is actually shown. Before the fix this alert read
  // "Http failure response for /api/external/otp/request/test: 0 Unknown Error".
  it('shows a translated message, never the transport string, when the request never reached the server', () => {
    const translate = loadedTranslateSpy();
    translate.instant.and.returnValue('ระบบมีปัญหาชั่วคราว กรุณาลองใหม่ภายหลัง');
    configure([{ provide: TranslateService, useValue: translate }]);
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    http
      .get('/api/external/otp/request/test')
      .subscribe({ next: () => {}, error: () => {} });
    // error() with a ProgressEvent is how HttpClient reports a connection that
    // never completed — status 0, the exact shape the OTP page hit.
    httpMock
      .expectOne('/api/external/otp/request/test')
      .error(new ProgressEvent('error'));

    expect(alertService.error).toHaveBeenCalledTimes(1);
    const shown = alertService.error.calls.mostRecent().args[0] as string;
    expect(shown).toBe('ระบบมีปัญหาชั่วคราว กรุณาลองใหม่ภายหลัง');
    expect(shown).not.toContain('Http failure');
    expect(shown).not.toContain('/api/');
    httpMock.verify();
  });

  it('falls back to a translated generic message when the body carries nothing readable', () => {
    const translate = loadedTranslateSpy();
    translate.instant.and.returnValue('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    configure([{ provide: TranslateService, useValue: translate }]);
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    http.get('/api/foo').subscribe({ next: () => {}, error: () => {} });
    // A 400 keeps the backend-message path (statusAlertMessageKey returns null),
    // but this body has no message — so the hardcoded English 'Request failed.'
    // used to appear here regardless of the user's language.
    httpMock
      .expectOne('/api/foo')
      .flush({ errorCode: 'SOMETHING' }, { status: 400, statusText: 'Bad Request' });

    expect(translate.instant).toHaveBeenCalledWith('COMMON.ERROR.REQUEST_FAILED');
    expect(alertService.error).toHaveBeenCalledWith('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    httpMock.verify();
  });

  // OBRS-569. This one needs a spec rather than the check-alert-i18n.mjs gate:
  // the bug was showLoading() called with NO argument, silently taking the
  // service's English 'Loading...' default. There is no string literal at the
  // call site, so a source-scanning gate cannot see it — only asserting the
  // argument can. Every /api/ request in the app went through this line, so the
  // English word was on screen for a moment on literally every page.
  it('translates the loading spinner title instead of the English default', () => {
    const translate = loadedTranslateSpy();
    translate.instant.and.returnValue('กำลังโหลด…');
    configure([{ provide: TranslateService, useValue: translate }]);
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    http.get('/api/foo').subscribe({ next: () => {}, error: () => {} });

    expect(translate.instant).toHaveBeenCalledWith('COMMON.LOADING');
    // OBRS-642 added two further arguments (the slow-load hint and the close-button
    // label). This assertion stays on the TITLE alone — pinning the whole argument list
    // would make it fail again for the next argument, which is not what OBRS-569 is
    // guarding: that the title is translated rather than the English default.
    const title = alertService.showLoading.calls.mostRecent().args[0];
    expect(title).toBe('กำลังโหลด…');
    expect(title).not.toBe('Loading...');
    expect(title).not.toBeUndefined();

    httpMock.expectOne('/api/foo').flush({});
    httpMock.verify();
  });

  /**
   * OBRS-930, and the test above is its positive control: same call, same
   * assertion on the same argument, with the only difference being whether the
   * selected language's bundle has landed. A cold-load test that can pass
   * because nothing rendered proves nothing on its own — the repro for this bug
   * reported "no spinner at all" three times before a positive control showed
   * the harness was broken, not the app.
   *
   * The mechanism in one line: `instant()` is synchronous and reads the store as
   * it is right now, so on an empty store it hands back the KEY as if it were
   * text. A customer whose first /api/ request beat GET /i18n/{lang}.json read
   * `COMMON.LOADING` off the spinner (reproduced on SIT by delaying the bundle
   * 4s).
   */
  it('never puts a raw i18n key on the spinner while the chosen language bundle is still loading', () => {
    const translate = translateDouble([]);
    configure([{ provide: TranslateService, useValue: translate }]);
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    http.get('/api/foo').subscribe({ next: () => {}, error: () => {} });

    // All three, not just the title: the slow-load hint is rendered as the
    // popup's text once the escape hatch opens, so a key there reaches the
    // screen too.
    const args = alertService.showLoading.calls.mostRecent().args;
    for (const arg of args) {
      expect(arg ?? '').not.toMatch(/^COMMON\./);
    }
    expect(args[0]).toBeUndefined();

    // The bundle lands while the request is still in flight.
    translate.translations['th'] = { COMMON: { LOADING: 'กำลังโหลด…' } };
    translate.instant.and.returnValue('กำลังโหลด…');
    translate.onLangChange.emit({ lang: 'th' } as LangChangeEvent);
    expect(alertService.updateLoadingTitle).toHaveBeenCalledWith('กำลังโหลด…');

    httpMock.expectOne('/api/foo').flush({});

    // `onLangChange` never completes, so the binding has to end with the request
    // or every /api/ call in the session leaves one behind.
    alertService.updateLoadingTitle.calls.reset();
    translate.onLangChange.emit({ lang: 'th' } as LangChangeEvent);
    expect(alertService.updateLoadingTitle).not.toHaveBeenCalled();

    httpMock.verify();
  });

  it('never shows the default language while the chosen one is still loading, and switches to it when it lands', () => {
    // The other face of the same race, and the one that survived the first
    // attempt at this fix: `app_language` is `en`, but `use('en')` leaves
    // `currentLang` on `th` until en.json lands, and `getParsedResult` falls
    // back to the default bundle. So `instant()` answers 'กำลังโหลด…' and looks
    // perfectly healthy doing it — a Thai spinner for an English visitor, which
    // is what AC3 forbids. Only the CHOSEN language may reach this overlay.
    const translate = translateDouble(['th']);
    translate.instant.and.returnValue('กำลังโหลด…');
    configure([{ provide: TranslateService, useValue: translate }]);
    // After configure(), which clears it for every other test in this file.
    localStorage.setItem(APP_LANGUAGE_KEY, 'en');
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    http.get('/api/foo').subscribe({ next: () => {}, error: () => {} });

    expect(alertService.showLoading.calls.mostRecent().args[0]).toBeUndefined();
    expect(translate.instant).not.toHaveBeenCalledWith('COMMON.LOADING');

    // th.json finishing is not the customer's language finishing.
    translate.onLangChange.emit({ lang: 'th' } as LangChangeEvent);
    expect(alertService.updateLoadingTitle).not.toHaveBeenCalled();

    // en.json is.
    translate.translations['en'] = { COMMON: { LOADING: 'Loading…' } };
    translate.instant.and.returnValue('Loading…');
    translate.onLangChange.emit({ lang: 'en' } as LangChangeEvent);
    expect(alertService.updateLoadingTitle).toHaveBeenCalledWith('Loading…');

    httpMock.expectOne('/api/foo').flush({});
    httpMock.verify();
  });

  it('does not repaint the overlay when a language change resolves to the title it already has', () => {
    // `Swal.update()` re-renders the popup and drops the spinner (armEscapeHatch
    // documents the same), so repainting to the identical string is a flicker
    // with no reader.
    const translate = loadedTranslateSpy();
    translate.instant.and.returnValue('กำลังโหลด…');
    configure([{ provide: TranslateService, useValue: translate }]);
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    http.get('/api/foo').subscribe({ next: () => {}, error: () => {} });

    expect(alertService.showLoading.calls.mostRecent().args[0]).toBe('กำลังโหลด…');
    translate.onLangChange.emit({ lang: 'th' } as LangChangeEvent);
    expect(alertService.updateLoadingTitle).not.toHaveBeenCalled();

    httpMock.expectOne('/api/foo').flush({});
    httpMock.verify();
  });

  it('leaves the spinner title to the service default when TranslateService is unavailable (non-/api/ path stays cycle-free)', () => {
    // Guards the OBRS-352 cycle from creeping back in through the new call:
    // the loading title must never be the reason TranslateService gets injected.
    configure();
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    http.get('/i18n/en.json').subscribe({ next: () => {} });
    httpMock.expectOne('/i18n/en.json').flush({});

    expect(alertService.showLoading).not.toHaveBeenCalled();
    httpMock.verify();
  });

  /**
   * OBRS-642. `grep -rn 'timeout(' src/app` returned 0 hits before this card, so a
   * request that never answered stayed pending until the browser itself gave up —
   * minutes — holding the blocking loading overlay over the page the whole time.
   *
   * The asymmetry between these two tests IS the design, and both are here so that a
   * later "simplification" into a blanket timeout fails loudly: abandoning a GET costs
   * the customer a retry, abandoning a POST /payments would report "failed" for a
   * charge that actually went through.
   */
  describe('pending-request ceiling (OBRS-642)', () => {
    const translateStub = () => {
      const translate = loadedTranslateSpy();
      translate.instant.and.callFake((key: string | string[]) => key as string);
      return translate;
    };

    it('gives up on an idempotent GET that never answers, as a translatable transport error', fakeAsync(() => {
      configure([{ provide: TranslateService, useValue: translateStub() }]);
      const http = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);

      let error: unknown = null;
      http.get('/api/stops').subscribe({ error: (e) => (error = e) });
      httpMock.expectOne('/api/stops'); // deliberately never flushed

      tick(IDEMPOTENT_REQUEST_TIMEOUT_MS - 1);
      expect(error).toBeNull();

      tick(1);
      // An HttpErrorResponse, not RxJS's TimeoutError: every catchError downstream was
      // written against the former, and status 0 is what routes this through
      // api-error.ts to translated copy instead of the English "Timeout has occurred".
      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).status).toBe(0);
      // And the overlay comes down with it — the whole point of the ceiling.
      expect(alertService.hideLoading).toHaveBeenCalled();

      httpMock.verify({ ignoreCancelled: true });
    }));

    it('never abandons a mutation, however long it takes — a charged payment must not be reported as failed', fakeAsync(() => {
      configure([{ provide: TranslateService, useValue: translateStub() }]);
      const http = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);

      let error: unknown = null;
      let body: unknown = null;
      http.post('/api/payments', { amount: 1 }).subscribe({
        next: (b) => (body = b),
        error: (e) => (error = e),
      });
      const req = httpMock.expectOne('/api/payments');

      tick(IDEMPOTENT_REQUEST_TIMEOUT_MS * 3);
      expect(error).toBeNull();

      req.flush({ ok: true });
      expect(body).toEqual({ ok: true });
      httpMock.verify();
    }));

    it('does not put a ceiling on the i18n bundle — a cancelled translation load renders raw keys', fakeAsync(() => {
      // GET /i18n/{lang}.json is idempotent and would have been swept up by a
      // method-only rule. Killing it at 30s trades a slow page for a broken one and
      // walks straight back into OBRS-352/OBRS-930 territory.
      configure();
      const http = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);

      let error: unknown = null;
      let body: unknown = null;
      http.get('/i18n/th.json').subscribe({
        next: (b) => (body = b),
        error: (e) => (error = e),
      });
      const req = httpMock.expectOne('/i18n/th.json');

      tick(IDEMPOTENT_REQUEST_TIMEOUT_MS * 2);
      expect(error).toBeNull();

      req.flush({ COMMON: { LOADING: 'กำลังโหลด…' } });
      expect(body).toEqual({ COMMON: { LOADING: 'กำลังโหลด…' } });
      httpMock.verify();
    }));

    it('honours SKIP_REQUEST_TIMEOUT — a GET whose wait IS the backend building a file', fakeAsync(() => {
      // ExportService sets this. `timeout({each})` resets per HttpEvent, so with
      // reportProgress off it is a time-to-first-byte limit: a report that takes 40s to
      // generate would be cancelled mid-build and reported as a plain export failure.
      configure([{ provide: TranslateService, useValue: translateStub() }]);
      const http = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);

      let error: unknown = null;
      let body: unknown = null;
      http
        .get('/api/private/exports/bookings', {
          context: new HttpContext().set(SKIP_REQUEST_TIMEOUT, true),
        })
        .subscribe({ next: (b) => (body = b), error: (e) => (error = e) });
      const req = httpMock.expectOne('/api/private/exports/bookings');

      tick(IDEMPOTENT_REQUEST_TIMEOUT_MS + 10_000);
      expect(error).toBeNull();

      req.flush({ rows: 1 });
      expect(body).toEqual({ rows: 1 });
      httpMock.verify();
    }));
  });

  /**
   * OBRS-1223. What is measured, and — more load-bearing — what is NOT.
   *
   * `performance.now` is stubbed rather than advanced with `tick`: fakeAsync moves
   * the RxJS scheduler, not the wall clock, so a timed-out request would otherwise
   * be recorded as having taken 0ms and every duration assertion here would pass
   * for the wrong reason.
   */
  describe('client-observed latency (OBRS-1223)', () => {
    let telemetry: jasmine.SpyObj<ApiLatencyTelemetryService>;

    const translateStub = () => {
      const translate = loadedTranslateSpy();
      translate.instant.and.callFake((key: string | string[]) => key as string);
      return translate;
    };

    function configureWithTelemetry(providers: unknown[] = []): void {
      telemetry = jasmine.createSpyObj<ApiLatencyTelemetryService>(
        'ApiLatencyTelemetryService',
        ['record']
      );
      configure([
        { provide: ApiLatencyTelemetryService, useValue: telemetry },
        ...(providers as never[]),
      ]);
    }

    /** Pins the clock so a request "takes" exactly `durationMs`. */
    function stubClock(durationMs: number): void {
      let call = 0;
      spyOn(performance, 'now').and.callFake(() => (call++ === 0 ? 0 : durationMs));
    }

    it('records a healthy idempotent /api/ GET with its real duration and outcome', () => {
      stubClock(7_400);
      configureWithTelemetry([{ provide: TranslateService, useValue: translateStub() }]);
      const http = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);

      http.get('/api/stops').subscribe({ next: () => {}, error: () => {} });
      httpMock.expectOne('/api/stops').flush({ data: [] });

      expect(telemetry.record).toHaveBeenCalledTimes(1);
      expect(telemetry.record.calls.mostRecent().args[0]).toEqual({
        url: '/api/stops',
        method: 'GET',
        durationMs: 7_400,
        outcome: 'ok',
      });
      httpMock.verify();
    });

    it('AC4 — a request the 30s ceiling killed is recorded as timed_out, not as a plain error', fakeAsync(() => {
      // The two are indistinguishable downstream ON PURPOSE: the ceiling raises the
      // same `status: 0` HttpErrorResponse the transport raises for a dead
      // connection, so every catchError in the app keeps seeing one error type.
      // Which is exactly why this has to be flagged where the timeout fires rather
      // than inferred from the error afterwards.
      stubClock(IDEMPOTENT_REQUEST_TIMEOUT_MS);
      configureWithTelemetry([{ provide: TranslateService, useValue: translateStub() }]);
      const http = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);

      http.get('/api/stops').subscribe({ next: () => {}, error: () => {} });
      httpMock.expectOne('/api/stops');

      tick(IDEMPOTENT_REQUEST_TIMEOUT_MS);

      expect(telemetry.record.calls.mostRecent().args[0].outcome).toBe('timed_out');
    }));

    it('records a server error as error', () => {
      stubClock(6_000);
      configureWithTelemetry([{ provide: TranslateService, useValue: translateStub() }]);
      const http = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);

      http.get('/api/stops').subscribe({ next: () => {}, error: () => {} });
      httpMock
        .expectOne('/api/stops')
        .flush({}, { status: 503, statusText: 'Service Unavailable' });

      expect(telemetry.record.calls.mostRecent().args[0].outcome).toBe('error');
      httpMock.verify();
    });

    it('records an abandoned request as cancelled, never as ok', () => {
      // `finalize` runs on unsubscribe too — a component destroyed mid-flight.
      // Defaulting the outcome to 'ok' would relabel every abandoned request as a
      // healthy one and quietly inflate the good half of the denominator.
      stubClock(8_000);
      configureWithTelemetry([{ provide: TranslateService, useValue: translateStub() }]);
      const http = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);

      const sub = http.get('/api/stops').subscribe({ next: () => {}, error: () => {} });
      httpMock.expectOne('/api/stops');
      sub.unsubscribe();

      expect(telemetry.record.calls.mostRecent().args[0].outcome).toBe('cancelled');
    });

    describe('the measured population is exactly the population the ceiling applies to', () => {
      it('does NOT measure a request carrying SKIP_REQUEST_TIMEOUT', () => {
        // ExportService waits while the server builds a file, so 45s there is the
        // feature working. Counting it would pad the tail with samples that say
        // nothing about whether 30s is right for the requests 30s can actually
        // kill — and that tail is the entire deliverable of this card.
        stubClock(45_000);
        configureWithTelemetry([{ provide: TranslateService, useValue: translateStub() }]);
        const http = TestBed.inject(HttpClient);
        const httpMock = TestBed.inject(HttpTestingController);

        http
          .get('/api/private/exports/bookings', {
            context: new HttpContext().set(SKIP_REQUEST_TIMEOUT, true),
          })
          .subscribe({ next: () => {}, error: () => {} });
        httpMock.expectOne('/api/private/exports/bookings').flush({ rows: 1 });

        expect(telemetry.record).not.toHaveBeenCalled();
        httpMock.verify();
      });

      it('does NOT measure a mutation — the ceiling deliberately does not apply to one', () => {
        stubClock(45_000);
        configureWithTelemetry([{ provide: TranslateService, useValue: translateStub() }]);
        const http = TestBed.inject(HttpClient);
        const httpMock = TestBed.inject(HttpTestingController);

        http.post('/api/private/payments', {}).subscribe({ next: () => {}, error: () => {} });
        httpMock.expectOne('/api/private/payments').flush({ ok: true });

        expect(telemetry.record).not.toHaveBeenCalled();
        httpMock.verify();
      });

      it('does NOT measure the i18n bundle, and resolves nothing analytics-shaped for it', () => {
        // The same NG0200 boundary this whole file guards: no TranslateService is
        // provided here, so if the interceptor resolved anything on the analytics
        // side for a non-/api/ request, this would die with NullInjectorError.
        stubClock(45_000);
        configureWithTelemetry();
        const http = TestBed.inject(HttpClient);
        const httpMock = TestBed.inject(HttpTestingController);

        let ok = false;
        http.get('/i18n/th.json').subscribe({ next: () => (ok = true) });
        httpMock.expectOne('/i18n/th.json').flush({ COMMON: {} });

        expect(ok).toBeTrue();
        expect(telemetry.record).not.toHaveBeenCalled();
        httpMock.verify();
      });
    });
  });
});
