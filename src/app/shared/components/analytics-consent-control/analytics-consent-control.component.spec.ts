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

/**
 * OBRS-969 — the dark block, on the button the e2e sweep can never see.
 *
 * The template renders exactly ONE of the two buttons: withdraw when consent is
 * granted, accept otherwise. Every Playwright lane that visits /privacy-policy
 * seeds `denied` (e2e/support/analytics-consent.ts explains why), so the ACCEPT
 * variant is the only one any sweep has ever measured — and the outline colours
 * that variant overrides went into the same commit unproven. That is exactly the
 * shape the OBRS-767 lesson warns about: a dark rule that is written, valid, and
 * paints nothing.
 *
 * Karma can answer it without a browser lane. The component's own stylesheet is
 * attached by TestBed, the fixture is in the real document, and
 * `:host-context(body.is-dark)` therefore resolves the moment `body` carries the
 * class. Same technique as the `.admin-shell.is-dark` specs in
 * override-cancel-modal.component.spec.ts.
 */
describe('AnalyticsConsentControlComponent — dark mode (OBRS-969)', () => {
  let fixture: ComponentFixture<AnalyticsConsentControlComponent>;

  /** $dk-accent / $dk-bg / $dk-text / $dk-bg-card, from src/styles/_dark-tokens.scss. */
  const DK_ACCENT = 'rgb(75, 194, 247)';
  const DK_BG = 'rgb(15, 17, 23)';
  const DK_TEXT = 'rgb(232, 234, 240)';
  const DK_BG_CARD = 'rgb(26, 29, 39)';
  /** $primary-blue, the light value each rule below has to beat. */
  const LIGHT_BLUE = 'rgb(7, 114, 162)';

  async function renderWith(decision: string): Promise<void> {
    localStorage.clear();
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, decision);
    setMeasurementIds('G-OBRS969TEST', '');
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [AnalyticsConsentControlComponent],
      imports: [TranslateModule.forRoot(), RouterTestingModule],
    }).compileComponents();
    fixture = TestBed.createComponent(AnalyticsConsentControlComponent);
    fixture.detectChanges();
  }

  const btn = (): HTMLElement =>
    fixture.nativeElement.querySelector('.consent-control__btn') as HTMLElement;

  beforeEach(() => document.body.classList.add('is-dark'));

  afterEach(() => {
    document.body.classList.remove('is-dark');
    localStorage.clear();
    restoreMeasurementIds();
  });

  it('paints the panel as a raised dark card, not the white one the light rule asks for', async () => {
    await renderWith('denied');

    const panel = fixture.nativeElement.querySelector('.consent-control') as HTMLElement;
    expect(getComputedStyle(panel).backgroundColor).toBe(DK_BG_CARD);
    expect(getComputedStyle(panel.querySelector('.consent-control__title')!).color).toBe(DK_TEXT);
  });

  /**
   * The withdraw button is the outline variant, and the ONLY assertion in this repo
   * that its dark colours reach it.
   */
  it('gives the withdraw button the accent outline, beating $primary-blue', async () => {
    await renderWith('granted');

    const withdraw = btn();
    expect(withdraw.dataset['testid']).toBe('analytics-consent-withdraw');
    expect(getComputedStyle(withdraw).color).toBe(DK_ACCENT);
    expect(getComputedStyle(withdraw).color).not.toBe(LIGHT_BLUE);
    expect(getComputedStyle(withdraw).borderTopColor).toBe(DK_ACCENT);
  });

  /**
   * And the accept button keeps its own inversion: white on $dk-accent measures
   * 2.03:1 (variables.scss records it for the same hex), so the fill carries dark
   * ink instead. This is the pair the sweep does see; it is here because the two
   * cases are one rule read from both sides.
   */
  it('fills the accept button with the accent and puts dark ink on it, never white', async () => {
    await renderWith('denied');

    const accept = btn();
    expect(accept.dataset['testid']).toBe('analytics-consent-grant');
    expect(getComputedStyle(accept).backgroundColor).toBe(DK_ACCENT);
    expect(getComputedStyle(accept).color).toBe(DK_BG);
  });
});
