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
//
// OBRS-703 AC-10: TRAVEL_CONDITIONS now carries {{noShowCutoffMinutes}} too, and moved INSIDE
// the policyParams gate — see the "before the APIs resolve" / "on API error" tests below, which
// pin the new (no-longer-unconditional) behaviour.
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
        '2. Change up to {{rescheduleWindowHours}}h before departure, within {{rescheduleMaxDaysAhead}} days. {{rescheduleCountRule}} {{rescheduleFeeLateThb}} THB per seat, every time. 4. Refund {{refundPercentEarly}}% early above {{earlyWindowHours}}h, {{refundPercentLate}}% late, none inside {{cancelWindowHours}}h.',
      TRAVEL_CONDITIONS:
        'Travel conditions for passengers. Item one. No-show after {{noShowCutoffMinutes}} minutes. Item seven.',
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
        '2. เลื่อนก่อนออก {{rescheduleWindowHours}} ชม. ภายใน {{rescheduleMaxDaysAhead}} วัน {{rescheduleCountRule}} ค่าธรรมเนียม {{rescheduleFeeLateThb}} บาทต่อที่นั่งทุกครั้ง 4. คืน {{refundPercentEarly}}% เมื่อเกิน {{earlyWindowHours}} ชม. หรือ {{refundPercentLate}}% และยกเลิกไม่ได้ใน {{cancelWindowHours}} ชม.',
      TRAVEL_CONDITIONS:
        'เงื่อนไขการเดินทางสำหรับผู้โดยสาร ข้อหนึ่ง ไม่มาขึ้นรถเกิน {{noShowCutoffMinutes}} นาที ข้อเจ็ด',
      RESCHEDULE_COUNT_UNLIMITED: 'เลื่อนได้ไม่จำกัดจำนวนครั้ง',
      RESCHEDULE_COUNT_LIMITED: 'เลื่อนได้ไม่เกิน {{rescheduleMaxCount}} ครั้งต่อการจองหนึ่งรายการ',
    },
  },
};

const BOOKING_URL = `${environment.apiUrl}/api/booking-policy`;
const RESCHEDULE_URL = `${environment.apiUrl}/api/reschedule-policy`;
const CANCELLATION_URL = `${environment.apiUrl}/api/cancellation-policy`;
const OPERATIONS_URL = `${environment.apiUrl}/api/operations-policy`;

describe('BusinessPolicyComponent (OBRS-564 / OBRS-658 / OBRS-623+659 / OBRS-703)', () => {
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
   * Match all four in-flight requests BEFORE resolving any of them.
   *
   * ⚠️ Order matters and is not cosmetic. forkJoin unsubscribes from its siblings the instant one
   * source errors, so a test that errors the first request and only then calls expectOne() for the
   * second finds nothing — the request was cancelled out from under it. All four are issued
   * eagerly on subscribe, so matching them up front is both possible and the only thing that
   * works. They stay MATCHED once captured, which is also what keeps httpMock.verify() happy
   * about the ones the component went on to cancel.
   */
  function expectAllFour(): {
    booking: TestRequest;
    reschedule: TestRequest;
    cancellation: TestRequest;
    operations: TestRequest;
  } {
    return {
      booking: httpMock.expectOne(BOOKING_URL),
      reschedule: httpMock.expectOne(RESCHEDULE_URL),
      cancellation: httpMock.expectOne(CANCELLATION_URL),
      operations: httpMock.expectOne(OPERATIONS_URL),
    };
  }

  /**
   * Flush all four policy endpoints. Deliberately one helper rather than four call sites: the
   * component forkJoins them, so a test that flushed only some would hang on a half-resolved page
   * and assert nothing — and httpMock.verify() would then blame the wrong test.
   */
  function flushAllPolicies(
    overrides: {
      booking?: { maxAdvanceDays: number; cutoffMinutes: number };
      // OBRS-656: no earlyWindowHours here any more. The reschedule endpoint stopped serving it
      // when the fee lost its time boundary, and leaving it in the fixture would let the component
      // keep reading it from the wrong payload for as long as both happened to say 24.
      reschedule?: Partial<{
        rescheduleWindowHours: number;
        rescheduleMaxDaysAhead: number;
        rescheduleFeeLateThb: number;
        rescheduleMaxCount: number;
      }>;
      cancellation?: Partial<{
        cancelWindowHours: number;
        earlyWindowHours: number;
        refundRateEarly: number;
        refundRateLate: number;
      }>;
      operations?: Partial<{ noShowCutoffMinutes: number }>;
    } = {}
  ): void {
    const reqs = expectAllFour();
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
    reqs.operations.flush({
      code: 200,
      message: 'OK',
      data: {
        noShowCutoffMinutes: 10,
        ...overrides.operations,
      },
    });
  }

  // OBRS-658: the rendered text MINUS the version line. Assertions below check that a policy
  // number does not leak onto the page, and the version line legitimately carries a date whose
  // digits collide with them ("2026-08-28" contains "20"). Those assertions are about the policy
  // NUMBERS, so they read the page without the metadata stamp rather than being weakened — the
  // version line has its own tests further down.
  function textWithoutVersionLine(): string {
    const clone = fixture.nativeElement.cloneNode(true) as HTMLElement;
    clone.querySelector('[data-testid="business-policy-version"]')?.remove();
    return clone.textContent as string;
  }

  // OBRS-703 AC-10: TRAVEL_CONDITIONS moved INSIDE the policyParams gate because it now carries a
  // live value (noShowCutoffMinutes). Before that card it rendered unconditionally; this test
  // pins the new behaviour — a reader mid-fetch sees the skeleton, not a config-bearing paragraph.
  it('before the APIs resolve: no config-bearing terms render, no raw "{{" leaks, and a skeleton shows instead', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('{{');
    expect(text).not.toContain('45');
    expect(text).not.toContain('Travel conditions for passengers');
    expect(fixture.nativeElement.querySelector('.policy-skeleton-block')).toBeTruthy();

    // Drain the still-pending requests so httpMock.verify() (afterEach) passes
    // — this test's assertions above are about the state BEFORE the flush.
    flushAllPolicies();
  });

  it('renders every live policy value once all four APIs resolve, and no raw placeholder survives', () => {
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
    // operations-policy (OBRS-703 AC-10): the no-show cutoff, no longer a hardcoded "10"
    expect(text).toContain('Travel conditions for passengers');
    expect(text).toContain('No-show after 10 minutes');
  });

  // OBRS-703 AC-10: the number changes when the (strictest-across-owners) server value changes —
  // the exact defect this card fixes ("owner sets 5, page still says 10").
  it('a different noShowCutoffMinutes from the server changes the rendered number', () => {
    fixture.detectChanges();
    flushAllPolicies({ operations: { noShowCutoffMinutes: 5 } });
    fixture.detectChanges();

    const text = textWithoutVersionLine();
    expect(text).toContain('No-show after 5 minutes');
    expect(text).not.toContain('No-show after 10 minutes');
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
    expect(text).toContain('ไม่มาขึ้นรถเกิน 10 นาที');
    // The load-bearing half: rescheduleCountRule is an already-TRANSLATED sentence substituted
    // into the params object, so unlike every other value here it does not re-interpolate for
    // free. Without the onLangChange rebuild it would leave an English sentence sitting inside
    // the Thai paragraph.
    expect(text).toContain('เลื่อนได้ไม่จำกัดจำนวนครั้ง');
    expect(text).not.toContain('unlimited number of times');
    // httpMock.verify() in afterEach fails this test if a second request was made for the
    // language switch — the assertion IS the absence of a call.
  });

  it('on API error: the terms are replaced by an inline error + retry, and no policy number or travel-conditions text leaks', () => {
    fixture.detectChanges();
    // Only the first is errored: forkJoin cancels the other three the moment it does, and a
    // TestRequest that has been cancelled can no longer be flushed or errored.
    expectAllFour().booking.error(new ProgressEvent('error'));
    fixture.detectChanges();

    const text = textWithoutVersionLine();
    expect(text).toContain('Unable to load the terms that read the current system values.');
    expect(text).toContain('Retry');
    // OBRS-703 AC-10: TRAVEL_CONDITIONS is now inside the gate too, so an outage hides it exactly
    // like the others — it must NOT announce a no-show cutoff that failed to load.
    expect(text).not.toContain('Travel conditions for passengers');
    expect(text).not.toContain('{{');
    expect(text).not.toContain('80%');
    expect(text).not.toContain('45');
  });

  // forkJoin means one failure fails the block. That is the intended behaviour and not an
  // accident: these are ONE document, and a half-rendered set of terms is worse than the inline
  // error because a customer cannot tell which half is missing.
  it('one endpoint failing while the other three succeed still shows the inline error, never a partial set of terms', () => {
    fixture.detectChanges();
    const reqs = expectAllFour();
    reqs.booking.flush({
      code: 200,
      message: 'OK',
      data: { maxAdvanceDays: 45, cutoffMinutes: 20 },
    });
    // The cancellation and operations requests are deliberately left un-resolved: forkJoin
    // cancels them the moment the reschedule one errors, which is the behaviour under test. They
    // were matched above, so httpMock.verify() is satisfied without either ever being flushed.
    reqs.reschedule.error(new ProgressEvent('error'));
    fixture.detectChanges();

    const text = textWithoutVersionLine();
    expect(text).toContain('Unable to load the terms that read the current system values.');
    expect(text).not.toContain('45');
    expect(text).not.toContain('80%');
    expect(text).not.toContain('Travel conditions for passengers');
  });

  it('retry re-fetches all four after a failure and renders the values on success', () => {
    fixture.detectChanges();
    expectAllFour().booking.error(new ProgressEvent('error'));
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
    expect(text).toContain('No-show after 10 minutes');
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
      expectAllFour().booking.error(new ProgressEvent('error'));
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
