import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { HowToBookComponent } from './how-to-book.component';
import { environment } from '../../../environments/environment';

const EN_TRANSLATIONS = {
  HOW_TO_BOOK: {
    TITLE: 'How to book',
    INTRO: 'Intro',
    BOOKING_TITLE: 'Booking',
    STEP_1: 'Step 1',
    STEP_2: 'Step 2',
    STEP_3: 'Step 3',
    STEP_4: 'Step 4',
    STEP_5: 'Step 5',
    PAYMENT_TITLE: 'Payment',
    PAYMENT_INTRO: 'Payment intro',
    PAYMENT_1: 'Payment 1',
    PAYMENT_2: 'Payment 2',
    PAYMENT_NOTE: 'Payment note',
    ETICKET_TITLE: 'E-ticket',
    ETICKET_TEXT: 'E-ticket text',
    TIPS_TITLE: 'Tips',
    // OBRS-703 AC-10: real placeholder, same rule as business-policy.component.spec.ts's
    // fixtures — a stubbed literal would prove nothing about interpolation actually happening.
    TIP_1: 'Arrive within {{noShowCutoffMinutes}} minutes or lose your ticket.',
    TIP_2: 'Tip 2',
    TIP_3: 'Tip 3',
    TIP_4: 'Tip 4',
    HELP_TITLE: 'Help',
    HELP_TEXT: 'Help text',
  },
};

const OPERATIONS_POLICY_URL = `${environment.apiUrl}/api/operations-policy`;

describe('HowToBookComponent (OBRS-703 AC-10)', () => {
  let fixture: ComponentFixture<HowToBookComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HowToBookComponent],
      imports: [CommonModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA], // app-navbar / app-footer are real children; not declared here
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', EN_TRANSLATIONS, true);
    translate.use('en');

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HowToBookComponent);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('does not render TIP_1 before the fetch resolves — never a stale/wrong grace period', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('lose your ticket');

    httpMock.expectOne(OPERATIONS_POLICY_URL).flush({
      code: 200,
      message: 'OK',
      data: { noShowCutoffMinutes: 5 },
    });
  });

  it('renders TIP_1 with the live no-show cutoff once the fetch resolves', () => {
    fixture.detectChanges();

    httpMock.expectOne(OPERATIONS_POLICY_URL).flush({
      code: 200,
      message: 'OK',
      data: { noShowCutoffMinutes: 5 },
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Arrive within 5 minutes or lose your ticket.');
    expect(text).not.toContain('{{');
  });

  it('omits TIP_1 rather than show a stale number when the fetch fails', () => {
    fixture.detectChanges();

    httpMock.expectOne(OPERATIONS_POLICY_URL).error(new ProgressEvent('error'));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('lose your ticket');
  });
});
