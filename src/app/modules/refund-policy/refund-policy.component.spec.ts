import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { RefundPolicyComponent } from './refund-policy.component';
import { environment } from '../../../environments/environment';
import { CancellationPolicyDto } from '../../services/cancellation-policy/cancellation-policy.service';

// OBRS-627: real translation fixtures rather than a stub pipe, for the same reason
// the OBRS-564 business-policy suite uses them — every assertion below is about the
// RENDERED text ("does the page say 80?", "did a raw {{ leak?"), which only means
// anything if TranslatePipe actually interpolates. Both languages carry the SAME
// four placeholders so the language-switch test proves the numbers survive a
// translate.use() without a second fetch.
const PLACEHOLDER_RATES =
  'more than {{earlyWindowHours}} hours: {{refundRateEarlyPercent}}%; ' +
  'from {{cancelWindowHours}} to {{earlyWindowHours}} hours: {{refundRateLatePercent}}%; ' +
  'under {{cancelWindowHours}} hours: closed';

const EN_TRANSLATIONS = {
  POLICY: {
    REFUND: {
      TITLE: 'Refund Policy',
      CONTENT_1: 'You can cancel a booking yourself from My Bookings.',
      RATES: PLACEHOLDER_RATES,
      RATES_ERROR: 'The refund rates cannot be shown right now.',
      RETRY: 'Try again',
      CONTENT_2: 'Where the money goes back. No-show forfeits the fare.',
      SEE_BUSINESS_POLICY: 'Rescheduling and other terms of service',
    },
  },
};

const TH_TRANSLATIONS = {
  POLICY: {
    REFUND: {
      TITLE: 'นโยบายการคืนเงิน',
      CONTENT_1: 'ท่านยกเลิกการจองได้ด้วยตนเอง',
      RATES:
        'มากกว่า {{earlyWindowHours}} ชั่วโมง: {{refundRateEarlyPercent}}%; ' +
        'ตั้งแต่ {{cancelWindowHours}} ถึง {{earlyWindowHours}} ชั่วโมง: {{refundRateLatePercent}}%; ' +
        'น้อยกว่า {{cancelWindowHours}} ชั่วโมง: ยกเลิกไม่ได้',
      RATES_ERROR: 'ขณะนี้ไม่สามารถแสดงอัตราคืนเงินได้',
      RETRY: 'ลองใหม่',
      CONTENT_2: 'เงินคืนกลับทางไหน กรณีไม่มาขึ้นรถถือว่าสละสิทธิ์',
      SEE_BUSINESS_POLICY: 'เงื่อนไขการเลื่อนวันเดินทาง',
    },
  },
};

// Deliberately NOT 0.80/0.50/2/24: the shipped defaults are the one set of values a
// hardcoded fallback would also produce, so a test using them could not tell the two
// apart. These can only appear on screen if they came off the wire.
const WIRE: CancellationPolicyDto = {
  cancelWindowHours: 3,
  earlyWindowHours: 36,
  refundRateEarly: 0.9,
  refundRateLate: 0.45,
};

describe('RefundPolicyComponent (OBRS-627)', () => {
  let fixture: ComponentFixture<RefundPolicyComponent>;
  let httpMock: HttpTestingController;
  let translate: TranslateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RefundPolicyComponent],
      imports: [CommonModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA], // app-navbar / app-footer / routerLink are real; not declared here
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', EN_TRANSLATIONS, true);
    translate.setTranslation('th', TH_TRANSLATIONS, true);
    translate.use('en');

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RefundPolicyComponent);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushPolicy(data: CancellationPolicyDto = WIRE): void {
    const req = httpMock.expectOne(`${environment.apiUrl}/api/cancellation-policy`);
    req.flush({ code: 200, message: 'OK', data });
  }

  it('before the API resolves: no rate is stated, no raw "{{" leaks, and the non-numeric text already renders', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('{{');
    expect(text).not.toContain('90');
    expect(text).toContain('You can cancel a booking yourself');
    expect(text).toContain('Where the money goes back');

    flushPolicy(); // drain so afterEach's httpMock.verify() passes
  });

  it('renders the rates that came off the wire once the API resolves', () => {
    fixture.detectChanges();
    flushPolicy();
    fixture.detectChanges();

    const rates = fixture.nativeElement.querySelector('[data-testid="refund-policy-rates"]');
    const text = rates.textContent as string;
    expect(text).not.toContain('{{');
    expect(text).toContain('36');
    expect(text).toContain('90%');
    expect(text).toContain('45%');
    expect(text).toContain('3');
  });

  // The 0.0-1.0 -> percent conversion is the one place the API's representation and
  // the published one differ, so it gets its own case: a customer must read "80%",
  // never "0.8%" and never "80.00%".
  it('renders 0.8 as "80" and drops trailing zeros', () => {
    fixture.detectChanges();
    flushPolicy({ cancelWindowHours: 2, earlyWindowHours: 24, refundRateEarly: 0.8, refundRateLate: 0.5 });
    fixture.detectChanges();

    const text = fixture.nativeElement.querySelector('[data-testid="refund-policy-rates"]')
      .textContent as string;
    expect(text).toContain('80%');
    expect(text).toContain('50%');
    expect(text).not.toContain('80.00');
    expect(text).not.toContain('0.8%');
  });

  it('keeps a fractional rate readable: 0.125 renders as 12.5%', () => {
    fixture.detectChanges();
    flushPolicy({ ...WIRE, refundRateEarly: 0.125 });
    fixture.detectChanges();

    const text = fixture.nativeElement.querySelector('[data-testid="refund-policy-rates"]')
      .textContent as string;
    expect(text).toContain('12.5%');
  });

  it('survives a language switch without re-fetching: the numbers stay correct in the new language', () => {
    fixture.detectChanges();
    flushPolicy();
    fixture.detectChanges();

    translate.use('th');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('นโยบายการคืนเงิน');
    expect(text).toContain('90%');
    expect(text).toContain('36');
    // httpMock.verify() in afterEach fails this test if the switch triggered a
    // second request — the assertion IS the absence of that call.
  });

  // AC-3. The load-bearing one: publishing a WRONG refund rate is worse than
  // publishing none, because the customer relies on it before paying. So the
  // failure path must show an error, and must NOT quietly substitute the shipped
  // defaults (2 / 24 / 80 / 50) the way home-booking's date-picker legitimately
  // does for its own cap.
  it('on API error: shows an inline error + retry and states no rate at all — no hardcoded fallback', () => {
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.apiUrl}/api/cancellation-policy`)
      .error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="refund-policy-rates"]')).toBeNull();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('The refund rates cannot be shown right now.');
    expect(text).toContain('Try again');
    expect(text).toContain('You can cancel a booking yourself');
    expect(text).toContain('Where the money goes back');
    expect(text).not.toContain('80');
    expect(text).not.toContain('50');
    expect(text).not.toContain('24');
  });

  // A 200 whose body carries no data is not an error the error callback ever sees,
  // so it needs its own case or it would render an empty rates section as if the
  // numbers were known.
  it('on a 200 with no data: treated as a failure, not as zero rates', () => {
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.apiUrl}/api/cancellation-policy`)
      .flush({ code: 200, message: 'OK', data: null });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="refund-policy-rates"]')).toBeNull();
    expect(fixture.nativeElement.textContent as string).toContain(
      'The refund rates cannot be shown right now.'
    );
  });

  it('retry re-fetches after a failure and renders the rates on success', () => {
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.apiUrl}/api/cancellation-policy`)
      .error(new ProgressEvent('error'));
    fixture.detectChanges();

    const retryButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('.policy-inline-retry');
    retryButton.click();
    fixture.detectChanges();

    flushPolicy();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('90%');
    expect(text).not.toContain('cannot be shown');
  });

  // AC-5: this page is the single source of the refund terms, and the link back to
  // the page that owns the rest is the other half of that contract.
  it('links to /business-policy for the terms this page does not own', () => {
    fixture.detectChanges();
    flushPolicy();
    fixture.detectChanges();

    const link: HTMLAnchorElement =
      fixture.nativeElement.querySelector('.policy-cross-link a');
    expect(link).not.toBeNull();
    expect(link.getAttribute('routerLink')).toBe('/business-policy');
    expect(link.textContent).toContain('Rescheduling and other terms of service');
  });
});
