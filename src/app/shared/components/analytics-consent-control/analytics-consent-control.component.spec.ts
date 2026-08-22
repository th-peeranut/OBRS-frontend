import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  AnalyticsConsentService,
} from '../../../services/analytics/analytics-consent.service';
import { AnalyticsService } from '../../../services/analytics/analytics.service';
import { AnalyticsTagsService } from '../../../services/analytics/analytics-tags.service';
import { environment } from '../../../../environments/environment';
import { AnalyticsConsentControlComponent } from './analytics-consent-control.component';

/**
 * OBRS-874 AC-1 — the withdrawal surface.
 *
 * The claim under test is not "a button exists". It is that pressing it leaves
 * the app in the state a withdrawal means: no stored answer, and measurement
 * switched off at the vendor without waiting for a reload (AC-6).
 */
/** `environment.analytics` is shared by reference — always restore it. */
const originalAnalytics = { ...environment.analytics };

function setMeasurementIds(ga4: string, clarity: string): void {
  environment.analytics.ga4MeasurementId = ga4;
  environment.analytics.clarityProjectId = clarity;
}

function restoreMeasurementIds(): void {
  setMeasurementIds(
    originalAnalytics.ga4MeasurementId,
    originalAnalytics.clarityProjectId
  );
}

describe('AnalyticsConsentControlComponent', () => {
  let fixture: ComponentFixture<AnalyticsConsentControlComponent>;
  let consent: AnalyticsConsentService;

  function query(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  beforeEach(async () => {
    localStorage.clear();
    // OBRS-1179. The Karma build ships the blank IDs every checkout has, and the
    // control now stands down on those — so without an ID here every case below
    // would be asserting the empty-build arm by accident. Only GA4 is filled:
    // either ID is enough, so this doubles as the "Clarity blank" case.
    setMeasurementIds('G-OBRS1179TEST', '');

    await TestBed.configureTestingModule({
      declarations: [AnalyticsConsentControlComponent],
      imports: [TranslateModule.forRoot(), RouterTestingModule],
    }).compileComponents();

    consent = TestBed.inject(AnalyticsConsentService);
    fixture = TestBed.createComponent(AnalyticsConsentControlComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    restoreMeasurementIds();
  });

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

/**
 * OBRS-1179 — the control is a switch, and a switch wired to nothing is worse
 * than no switch.
 *
 * The banner and this share one condition on purpose (`hasAnyMeasurementId`):
 * hiding the ask while leaving a "stop collecting" button on the policy page
 * would still be telling a visitor we collect something.
 *
 * Both arms, as AC-4 requires — the cases above are the "IDs present" half.
 */
describe('AnalyticsConsentControlComponent — with nothing to measure', () => {
  let fixture: ComponentFixture<AnalyticsConsentControlComponent>;

  function control(): HTMLElement | null {
    return fixture.nativeElement.querySelector(
      '[data-testid="analytics-consent-control"]'
    );
  }

  /** Built after the IDs are set — the component reads them as it is created. */
  async function render(): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [AnalyticsConsentControlComponent],
      imports: [TranslateModule.forRoot(), RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsConsentControlComponent);
    fixture.detectChanges();
  }

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    localStorage.clear();
    restoreMeasurementIds();
  });

  it('is not on the policy page when neither ID is configured', async () => {
    setMeasurementIds('', '');

    await render();

    expect(control()).toBeNull();
  });

  it('is there when only Clarity is configured — either ID is enough', async () => {
    setMeasurementIds('', 'obrs1179clarity');

    await render();

    expect(control()).not.toBeNull();
  });

  /**
   * AC-3, from the other side: the answer outlives the control. A visitor who
   * accepted keeps that record while the IDs are gone, so configuring one does
   * not silently re-ask a question they already answered.
   */
  it('does not touch a stored answer on its way off the page', async () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, 'granted');
    setMeasurementIds('', '');

    await render();

    expect(control()).toBeNull();
    expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe('granted');
  });
});
