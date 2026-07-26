import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../services/alert.service';
import { errorInterceptor } from './error.interceptor';

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
    alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'showLoading',
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
    const translate = jasmine.createSpyObj<TranslateService>(
      'TranslateService',
      ['instant']
    );
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

  it('translates the dedicated 503 dependency-outage message on an /api/ request (behavior preserved)', () => {
    const translate = jasmine.createSpyObj<TranslateService>(
      'TranslateService',
      ['instant']
    );
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
    const translate = jasmine.createSpyObj<TranslateService>(
      'TranslateService',
      ['instant']
    );
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
    const translate = jasmine.createSpyObj<TranslateService>(
      'TranslateService',
      ['instant']
    );
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
    const translate = jasmine.createSpyObj<TranslateService>(
      'TranslateService',
      ['instant']
    );
    translate.instant.and.returnValue('กำลังโหลด…');
    configure([{ provide: TranslateService, useValue: translate }]);
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    http.get('/api/foo').subscribe({ next: () => {}, error: () => {} });

    expect(translate.instant).toHaveBeenCalledWith('COMMON.LOADING');
    expect(alertService.showLoading).toHaveBeenCalledWith('กำลังโหลด…');
    const title = alertService.showLoading.calls.mostRecent().args[0];
    expect(title).not.toBe('Loading...');
    expect(title).not.toBeUndefined();

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
});
