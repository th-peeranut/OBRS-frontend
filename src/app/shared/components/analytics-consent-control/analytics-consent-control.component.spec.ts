import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  AnalyticsConsentService,
} from '../../../services/analytics/analytics-consent.service';
import { AnalyticsService } from '../../../services/analytics/analytics.service';
import { AnalyticsTagsService } from '../../../services/analytics/analytics-tags.service';
import { AnalyticsConsentControlComponent } from './analytics-consent-control.component';

/**
 * OBRS-874 AC-1 — the withdrawal surface.
 *
 * The claim under test is not "a button exists". It is that pressing it leaves
 * the app in the state a withdrawal means: no stored answer, and measurement
 * switched off at the vendor without waiting for a reload (AC-6).
 */
describe('AnalyticsConsentControlComponent', () => {
  let fixture: ComponentFixture<AnalyticsConsentControlComponent>;
  let consent: AnalyticsConsentService;

  function query(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      declarations: [AnalyticsConsentControlComponent],
      imports: [TranslateModule.forRoot(), RouterTestingModule],
    }).compileComponents();

    consent = TestBed.inject(AnalyticsConsentService);
    fixture = TestBed.createComponent(AnalyticsConsentControlComponent);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  it('is on the page even before any answer — a control that appears only after consent cannot be found', () => {
    expect(query('analytics-consent-control')).not.toBeNull();
    expect(query('analytics-consent-status')?.getAttribute('data-decision')).toBe(
      'unset'
    );
    expect(query('analytics-consent-grant')).not.toBeNull();
    expect(query('analytics-consent-withdraw')).toBeNull();
  });

  it('offers withdrawal — and only withdrawal — to a visitor who accepted', () => {
    consent.grant();
    fixture.detectChanges();

    expect(query('analytics-consent-status')?.getAttribute('data-decision')).toBe(
      'granted'
    );
    expect(query('analytics-consent-withdraw')).not.toBeNull();
    expect(query('analytics-consent-grant')).toBeNull();
  });

  it('withdraws: the stored answer is gone, not overwritten with a refusal', () => {
    consent.grant();
    fixture.detectChanges();

    (query('analytics-consent-withdraw') as HTMLButtonElement).click();
    fixture.detectChanges();

    // `unset`, not `denied`. A withdrawal removes consent; it does not record a
    // refusal on the visitor's behalf.
    expect(consent.decision).toBe('unset');
    expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBeNull();
    expect(query('analytics-consent-status')?.getAttribute('data-decision')).toBe(
      'unset'
    );
  });

  it('lets a visitor who withdrew consent again — withdrawal is not a one-way door', () => {
    consent.grant();
    fixture.detectChanges();
    (query('analytics-consent-withdraw') as HTMLButtonElement).click();
    fixture.detectChanges();

    (query('analytics-consent-grant') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(consent.decision).toBe('granted');
  });

  it('shows a visitor who declined the way back in', () => {
    consent.deny();
    fixture.detectChanges();

    expect(query('analytics-consent-status')?.getAttribute('data-decision')).toBe(
      'denied'
    );
    expect(query('analytics-consent-grant')).not.toBeNull();
  });

  it('AC-6: withdrawing suspends collection at the vendor in the same tick, with no reload', () => {
    // What makes this true is the `isGranted$` subscription in
    // `AnalyticsService.init()` — not anything in this component. Asserted here
    // because this is the button whose copy promises it; the network-level proof
    // is e2e/tests/obrs-874-analytics-consent-withdraw.spec.ts.
    const tags = TestBed.inject(AnalyticsTagsService);
    const suspend = spyOn(tags, 'setSuspended').and.callThrough();
    TestBed.inject(AnalyticsService).init();

    consent.grant();
    fixture.detectChanges();
    suspend.calls.reset();

    (query('analytics-consent-withdraw') as HTMLButtonElement).click();

    expect(suspend).toHaveBeenCalledWith(true);
  });
});
