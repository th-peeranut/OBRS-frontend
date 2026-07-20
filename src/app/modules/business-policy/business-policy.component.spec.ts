import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { BusinessPolicyComponent } from './business-policy.component';
import { environment } from '../../../environments/environment';

// OBRS-564: real translation fixtures (not a stub pipe) — this suite asserts
// on the RENDERED DOM (does it contain "45"? does it contain a raw "{{"?),
// which only means anything if TranslatePipe actually interpolates. Both
// languages carry the SAME {{maxAdvanceDays}}/{{cutoffMinutes}} placeholders
// so the language-switch test can prove the numbers survive a `translate.use()`
// call, not just a fresh fetch.
const EN_TRANSLATIONS = {
  POLICY: {
    BUSINESS: {
      TITLE: 'Terms and Conditions',
      SALES_CHANNELS:
        '1. Regular sale: up to {{cutoffMinutes}} minutes before departure. Advance sale: up to {{maxAdvanceDays}} days ahead.',
      SALES_CHANNELS_ERROR: 'Unable to load the current advance-booking policy.',
      RETRY: 'Retry',
      CONTENT:
        '2. Item two. 3. Item three. 4. Item four. 5. Item five. 6. Item six.',
    },
  },
};

const TH_TRANSLATIONS = {
  POLICY: {
    BUSINESS: {
      TITLE: 'ข้อกำหนดและเงื่อนไข',
      SALES_CHANNELS:
        '1. ขายปกติ: ก่อนออกเดินทาง {{cutoffMinutes}} นาที ขายล่วงหน้า: สูงสุด {{maxAdvanceDays}} วัน',
      SALES_CHANNELS_ERROR: 'ไม่สามารถโหลดนโยบายการจองล่วงหน้าได้',
      RETRY: 'ลองใหม่',
      CONTENT: 'ข้อ 2 ข้อ 3 ข้อ 4 ข้อ 5 ข้อ 6',
    },
  },
};

describe('BusinessPolicyComponent (OBRS-564)', () => {
  let fixture: ComponentFixture<BusinessPolicyComponent>;
  let httpMock: HttpTestingController;
  let translate: TranslateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BusinessPolicyComponent],
      imports: [CommonModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA], // app-navbar / app-footer are real children; not declared here
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', EN_TRANSLATIONS, true);
    translate.setTranslation('th', TH_TRANSLATIONS, true);
    translate.use('en');

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BusinessPolicyComponent);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushPolicy(data: { maxAdvanceDays: number; cutoffMinutes: number }): void {
    const req = httpMock.expectOne(`${environment.apiUrl}/api/booking-policy`);
    req.flush({ code: 200, message: 'OK', data });
  }

  it('before the API resolves: item 1 is absent, no raw "{{" leaks, and items 2-6 already render', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('{{');
    expect(text).not.toContain('45');
    expect(text).toContain('Item two');
    expect(text).toContain('Item six');

    // Drain the still-pending request so httpMock.verify() (afterEach) passes
    // — this test's assertions above are about the state BEFORE the flush.
    flushPolicy({ maxAdvanceDays: 45, cutoffMinutes: 20 });
  });

  it('renders the real config numbers (45, not the old hardcoded 60/12) once the API resolves', () => {
    fixture.detectChanges();
    flushPolicy({ maxAdvanceDays: 45, cutoffMinutes: 20 });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('{{');
    expect(text).toContain('45');
    expect(text).toContain('20');
    expect(text).toContain('Item two');
  });

  it('survives a language switch without re-fetching: numbers stay correct in the new language, and httpMock.verify() proves no extra request', () => {
    fixture.detectChanges();
    flushPolicy({ maxAdvanceDays: 45, cutoffMinutes: 20 });
    fixture.detectChanges();

    translate.use('th');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('ข้อกำหนดและเงื่อนไข');
    expect(text).toContain('45');
    expect(text).toContain('20');
    // httpMock.verify() in afterEach fails this test if a second request for
    // the language switch was made — the assertion IS the absence of a call.
  });

  it('on API error: item 1 is replaced by an inline error + retry, items 2-6 still render, and neither the old 30 nor 20 leaks in', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(`${environment.apiUrl}/api/booking-policy`);
    req.error(new ProgressEvent('error'));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Unable to load the current advance-booking policy.');
    expect(text).toContain('Retry');
    expect(text).toContain('Item two');
    expect(text).toContain('Item six');
    expect(text).not.toContain('30');
    expect(text).not.toContain('20');
  });

  it('retry re-fetches after a failure and renders the numbers on success', () => {
    fixture.detectChanges();
    const failedReq = httpMock.expectOne(`${environment.apiUrl}/api/booking-policy`);
    failedReq.error(new ProgressEvent('error'));
    fixture.detectChanges();

    const retryButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.policy-inline-retry'
    );
    retryButton.click();
    fixture.detectChanges();

    flushPolicy({ maxAdvanceDays: 45, cutoffMinutes: 20 });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('45');
    expect(text).not.toContain('Unable to load');
  });
});
