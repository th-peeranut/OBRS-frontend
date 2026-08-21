import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { BusinessPolicyComponent } from './business-policy.component';
import { environment } from '../../../environments/environment';
import {
  BUSINESS_POLICY_EFFECTIVE_DATE,
  BUSINESS_POLICY_VERSION,
} from './business-policy.version';

// OBRS-564: real translation fixtures (not a stub pipe) — this suite asserts
// on the RENDERED DOM (does it contain "45"? does it contain a raw "{{"?),
// which only means anything if TranslatePipe actually interpolates. Both
// languages carry the SAME placeholders so the language-switch test can prove
// the values survive a `translate.use()` call, not just a fresh fetch.
//
// OBRS-623/659: CONTENT now carries placeholders too, so the fixtures below spell out every one
// the real files use. A fixture that dropped a placeholder would let a regression through by
// simply having nothing to interpolate.
const EN_TRANSLATIONS = {
  POLICY: {
    BUSINESS: {
      TITLE: 'Terms and Conditions',
      // OBRS-658: same placeholders as the real en.json key — the point of using real fixtures
      // here is that TranslatePipe genuinely interpolates, so a stubbed literal would prove nothing.
      VERSION_LINE: 'Version {{version}} · In force from {{effectiveDate}}',
      SALES_CHANNELS:
        '1. Regular sale: up to {{cutoffMinutes}} minutes before departure. Advance sale: up to {{maxAdvanceDays}} days ahead.',
      SALES_CHANNELS_ERROR: 'Unable to load the terms that read the current system values.',
      RETRY: 'Retry',
      CONTENT:
        '2. Change up to {{rescheduleWindowHours}}h before departure, within {{rescheduleMaxDaysAhead}} days. {{rescheduleCountRule}} Free above {{earlyWindowHours}}h, else {{rescheduleFeeLateThb}} THB per seat. 4. Refund {{refundPercentEarly}}% early, {{refundPercentLate}}% late, none inside {{cancelWindowHours}}h.',
      TRAVEL_CONDITIONS: 'Travel conditions for passengers. Item one. Item seven.',
      RESCHEDULE_COUNT_UNLIMITED: 'A booking may be changed an unlimited number of times.',
      RESCHEDULE_COUNT_LIMITED: 'A booking may be changed at most {{rescheduleMaxCount}} time(s).',
    },
  },
};

const TH_TRANSLATIONS = {
  POLICY: {
    BUSINESS: {
      TITLE: 'ข้อกำหนดและเงื่อนไข',
      VERSION_LINE: 'ฉบับที่ {{version}} · มีผลตั้งแต่ {{effectiveDate}}',
      SALES_CHANNELS:
        '1. ขายปกติ: ก่อนออกเดินทาง {{cutoffMinutes}} นาที ขายล่วงหน้า: สูงสุด {{maxAdvanceDays}} วัน',
      SALES_CHANNELS_ERROR: 'ไม่สามารถโหลดเงื่อนไขที่อ้างอิงค่าปัจจุบันของระบบได้',
      RETRY: 'ลองใหม่',
      CONTENT:
        '2. เลื่อนก่อนออก {{rescheduleWindowHours}} ชม. ภายใน {{rescheduleMaxDaysAhead}} วัน {{rescheduleCountRule}} เกิน {{earlyWindowHours}} ชม. ไม่มีค่าธรรมเนียม ไม่ถึงนั้น {{rescheduleFeeLateThb}} บาทต่อที่นั่ง 4. คืน {{refundPercentEarly}}% หรือ {{refundPercentLate}}% และยกเลิกไม่ได้ใน {{cancelWindowHours}} ชม.',
      TRAVEL_CONDITIONS: 'เงื่อนไขการเดินทางสำหรับผู้โดยสาร ข้อหนึ่ง ข้อเจ็ด',
      RESCHEDULE_COUNT_UNLIMITED: 'เลื่อนได้ไม่จำกัดจำนวนครั้ง',
      RESCHEDULE_COUNT_LIMITED: 'เลื่อนได้ไม่เกิน {{rescheduleMaxCount}} ครั้งต่อการจองหนึ่งรายการ',
    },
  },
};

const BOOKING_URL = `${environment.apiUrl}/api/booking-policy`;
const RESCHEDULE_URL = `${environment.apiUrl}/api/reschedule-policy`;
const CANCELLATION_URL = `${environment.apiUrl}/api/cancellation-policy`;

describe('BusinessPolicyComponent (OBRS-564 / OBRS-658 / OBRS-623+659)', () => {
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

  /**
   * Match all three in-flight requests BEFORE resolving any of them.
   *
   * ⚠️ Order matters and is not cosmetic. forkJoin unsubscribes from its siblings the instant one
   * source errors, so a test that errors the first request and only then calls expectOne() for the
   * second finds nothing — the request was cancelled out from under it. All three are issued
   * eagerly on subscribe, so matching them up front is both possible and the only thing that
   * works. They stay MATCHED once captured, which is also what keeps httpMock.verify() happy
   * about the two the component went on to cancel.
   */
  function expectAllThree(): {
    booking: TestRequest;
    reschedule: TestRequest;
    cancellation: TestRequest;
  } {
    return {
      booking: httpMock.expectOne(BOOKING_URL),
      reschedule: httpMock.expectOne(RESCHEDULE_URL),
      cancellation: httpMock.expectOne(CANCELLATION_URL),
    };
  }

  /**
   * Flush all three policy endpoints. Deliberately one helper rather than three call sites: the
   * component forkJoins them, so a test that flushed only one would hang on a half-resolved page
   * and assert nothing — and httpMock.verify() would then blame the wrong test.
   */
  function flushAllPolicies(
    overrides: {
      booking?: { maxAdvanceDays: number; cutoffMinutes: number };
      reschedule?: Partial<{
        rescheduleWindowHours: number;
        rescheduleMaxDaysAhead: number;
        rescheduleFeeLateThb: number;
        earlyWindowHours: number;
        rescheduleMaxCount: number;
      }>;
      cancellation?: Partial<{
        cancelWindowHours: number;
        earlyWindowHours: number;
        refundRateEarly: number;
        refundRateLate: number;
      }>;
    } = {}
  ): void {
    const reqs = expectAllThree();
    reqs.booking.flush({
      code: 200,
      message: 'OK',
      data: overrides.booking ?? { maxAdvanceDays: 45, cutoffMinutes: 20 },
    });
    reqs.reschedule.flush({
      code: 200,
      message: 'OK',
      data: {
        rescheduleWindowHours: 2,
        rescheduleMaxDaysAhead: 60,
        rescheduleFeeLateThb: 30,
        earlyWindowHours: 24,
        rescheduleMaxCount: 0,
        ...overrides.reschedule,
      },
    });
    reqs.cancellation.flush({
      code: 200,
      message: 'OK',
      data: {
        cancelWindowHours: 2,
        earlyWindowHours: 24,
        refundRateEarly: 0.8,
        refundRateLate: 0.5,
        ...overrides.cancellation,
      },
    });
  }

  // OBRS-658: the rendered text MINUS the version line. Assertions below check that a policy
  // number does not leak onto the page, and the version line legitimately carries a date whose
  // digits collide with them ("2026-08-27" contains "20"). Those assertions are about the policy
  // NUMBERS, so they read the page without the metadata stamp rather than being weakened — the
  // version line has its own tests further down.
  function textWithoutVersionLine(): string {
    const clone = fixture.nativeElement.cloneNode(true) as HTMLElement;
    clone.querySelector('[data-testid="business-policy-version"]')?.remove();
    return clone.textContent as string;
  }

  it('before the APIs resolve: the config-bearing terms are absent, no raw "{{" leaks, and the travel conditions already render', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('{{');
    expect(text).not.toContain('45');
    // OBRS-623/659 moved CONTENT behind the gate because it now interpolates. This pins the half
    // that must NOT move with it: a reader during an outage still gets the baggage, no-show and
    // liability rules, which carry no config value at all.
    expect(text).toContain('Travel conditions for passengers');
    expect(text).toContain('Item seven');

    // Drain the still-pending requests so httpMock.verify() (afterEach) passes
    // — this test's assertions above are about the state BEFORE the flush.
    flushAllPolicies();
  });

  it('renders every live policy value once all three APIs resolve, and no raw placeholder survives', () => {
    fixture.detectChanges();
    flushAllPolicies();
    fixture.detectChanges();

    const text = textWithoutVersionLine();
    expect(text).not.toContain('{{');
    // booking-policy (OBRS-564): 45, not the old hardcoded 60/12
    expect(text).toContain('45');
    // reschedule-policy (OBRS-655/657): 2h window, 60-day horizon, THB 30 fee, 24h boundary
    expect(text).toContain('2h before departure');
    expect(text).toContain('within 60 days');
    expect(text).toContain('30 THB per seat');
    expect(text).toContain('above 24h');
    // cancellation-policy (OBRS-627): the 0.0-1.0 rates arrive as percentages
    expect(text).toContain('80%');
    expect(text).toContain('50%');
  });

  // OBRS-657 shipped reschedule_max_count = 0 meaning UNLIMITED. The number therefore cannot be
  // printed into the sentence, and both branches need pinning: a component that always returned
  // the unlimited string would pass a test that only ever sent 0.
  describe('reschedule cap sentence (OBRS-657)', () => {
    it('0 from the server renders the UNLIMITED sentence, and never the literal 0', () => {
      fixture.detectChanges();
      flushAllPolicies({ reschedule: { rescheduleMaxCount: 0 } });
      fixture.detectChanges();

      const text = textWithoutVersionLine();
      expect(text).toContain('unlimited number of times');
      expect(text).not.toContain('at most 0');
    });

    it('a positive cap renders the LIMITED sentence with that number', () => {
      fixture.detectChanges();
      flushAllPolicies({ reschedule: { rescheduleMaxCount: 3 } });
      fixture.detectChanges();

      const text = textWithoutVersionLine();
      expect(text).toContain('at most 3 time(s)');
      expect(text).not.toContain('unlimited');
    });

    it('a negative cap left by a bad config edit reads as unlimited, matching the n <= 0 test at the server read site', () => {
      fixture.detectChanges();
      flushAllPolicies({ reschedule: { rescheduleMaxCount: -1 } });
      fixture.detectChanges();

      const text = textWithoutVersionLine();
      expect(text).toContain('unlimited number of times');
      expect(text).not.toContain('-1');
    });
  });

  it('survives a language switch without re-fetching: values stay correct AND the cap sentence changes language', () => {
    fixture.detectChanges();
    flushAllPolicies({ reschedule: { rescheduleMaxCount: 0 } });
    fixture.detectChanges();

    translate.use('th');
    fixture.detectChanges();

    const text = textWithoutVersionLine();
    expect(text).toContain('ข้อกำหนดและเงื่อนไข');
    expect(text).toContain('45');
    expect(text).toContain('80%');
    // The load-bearing half: rescheduleCountRule is an already-TRANSLATED sentence substituted
    // into the params object, so unlike every other value here it does not re-interpolate for
    // free. Without the onLangChange rebuild it would leave an English sentence sitting inside
    // the Thai paragraph.
    expect(text).toContain('เลื่อนได้ไม่จำกัดจำนวนครั้ง');
    expect(text).not.toContain('unlimited number of times');
    // httpMock.verify() in afterEach fails this test if a second request was made for the
    // language switch — the assertion IS the absence of a call.
  });

  it('on API error: the config-bearing terms are replaced by an inline error + retry, the travel conditions still render, and no policy number leaks', () => {
    fixture.detectChanges();
    // Only the first is errored: forkJoin cancels the other two the moment it does, and a
    // TestRequest that has been cancelled can no longer be flushed or errored.
    expectAllThree().booking.error(new ProgressEvent('error'));
    fixture.detectChanges();

    const text = textWithoutVersionLine();
    expect(text).toContain('Unable to load the terms that read the current system values.');
    expect(text).toContain('Retry');
    expect(text).toContain('Travel conditions for passengers');
    expect(text).not.toContain('{{');
    expect(text).not.toContain('80%');
    expect(text).not.toContain('45');
  });

  // forkJoin means one failure fails the block. That is the intended behaviour and not an
  // accident: these are ONE document, and a half-rendered set of terms is worse than the inline
  // error because a customer cannot tell which half is missing.
  it('one endpoint failing while the other two succeed still shows the inline error, never a partial set of terms', () => {
    fixture.detectChanges();
    const reqs = expectAllThree();
    reqs.booking.flush({
      code: 200,
      message: 'OK',
      data: { maxAdvanceDays: 45, cutoffMinutes: 20 },
    });
    // The cancellation request is deliberately left un-resolved: forkJoin cancels it the moment
    // the reschedule one errors, which is the behaviour under test. It was matched above, so
    // httpMock.verify() is satisfied without it ever being flushed.
    reqs.reschedule.error(new ProgressEvent('error'));
    fixture.detectChanges();

    const text = textWithoutVersionLine();
    expect(text).toContain('Unable to load the terms that read the current system values.');
    expect(text).not.toContain('45');
    expect(text).not.toContain('80%');
    expect(text).toContain('Travel conditions for passengers');
  });

  it('retry re-fetches all three after a failure and renders the values on success', () => {
    fixture.detectChanges();
    expectAllThree().booking.error(new ProgressEvent('error'));
    fixture.detectChanges();

    const retryButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.policy-inline-retry'
    );
    retryButton.click();
    fixture.detectChanges();

    flushAllPolicies();
    fixture.detectChanges();

    const text = textWithoutVersionLine();
    expect(text).toContain('45');
    expect(text).toContain('80%');
    expect(text).not.toContain('Unable to load');
  });

  // OBRS-658 AC 2 (ADR-0125). The terms on this page are a contract with a consumer; without a
  // version and an effective date on screen, nothing can say which wording a ticket was sold under.
  describe('published version line (OBRS-658)', () => {
    it('states the version and effective date from business-policy.version.ts, not from i18n', () => {
      fixture.detectChanges();
      flushAllPolicies();
      fixture.detectChanges();

      const line: HTMLElement = fixture.nativeElement.querySelector(
        '[data-testid="business-policy-version"]'
      );
      expect(line).toBeTruthy();
      const text = line.textContent as string;
      expect(text).toContain(BUSINESS_POLICY_VERSION);
      expect(text).toContain(BUSINESS_POLICY_EFFECTIVE_DATE);
      // A dropped placeholder renders the literal, which is the failure this asserts against:
      // a version line that omits the version is worse than no version line at all.
      expect(text).not.toContain('{{');
    });

    it('still states which wording is on screen when the live config fetch fails', () => {
      fixture.detectChanges();
      expectAllThree().booking.error(new ProgressEvent('error'));
      fixture.detectChanges();

      // The version identifies the TEXT, which is on the page whether or not the numbers
      // resolved — so it must sit outside the policyParams gate, and this is what pins that.
      const text = fixture.nativeElement.querySelector(
        '[data-testid="business-policy-version"]'
      ).textContent as string;
      expect(text).toContain(BUSINESS_POLICY_VERSION);
      expect(text).toContain(BUSINESS_POLICY_EFFECTIVE_DATE);
    });

    it('survives a language switch with the same version and date', () => {
      fixture.detectChanges();
      flushAllPolicies();
      fixture.detectChanges();

      translate.use('th');
      fixture.detectChanges();

      const text = fixture.nativeElement.querySelector(
        '[data-testid="business-policy-version"]'
      ).textContent as string;
      expect(text).toContain('ฉบับที่');
      expect(text).toContain(BUSINESS_POLICY_VERSION);
      // The date is a fact, not a translation — three files must never hold three dates.
      expect(text).toContain(BUSINESS_POLICY_EFFECTIVE_DATE);
    });
  });
});
