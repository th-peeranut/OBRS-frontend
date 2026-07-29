import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AnalyticsConsentService } from '../../../services/analytics/analytics-consent.service';
import { AnalyticsConsentBannerComponent } from './analytics-consent-banner.component';

describe('AnalyticsConsentBannerComponent', () => {
  let fixture: ComponentFixture<AnalyticsConsentBannerComponent>;
  let consent: AnalyticsConsentService;

  function banner(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.consent-banner');
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.consent-banner__btn'));
  }

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      declarations: [AnalyticsConsentBannerComponent],
      imports: [TranslateModule.forRoot(), RouterTestingModule],
    }).compileComponents();

    consent = TestBed.inject(AnalyticsConsentService);
    fixture = TestBed.createComponent(AnalyticsConsentBannerComponent);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  it('is on screen while the question is unanswered', () => {
    expect(banner()).not.toBeNull();
  });

  it('is not rendered at all for a visitor who already accepted', () => {
    consent.grant();
    fixture.detectChanges();

    expect(banner()).toBeNull();
  });

  it('is not rendered at all for a visitor who already declined — it must not nag', () => {
    consent.deny();
    fixture.detectChanges();

    expect(banner()).toBeNull();
  });

  it('records the accept', () => {
    const accept = fixture.nativeElement.querySelector(
      '.consent-banner__btn--accept'
    ) as HTMLButtonElement;

    accept.click();
    fixture.detectChanges();

    expect(consent.decision).toBe('granted');
    expect(banner()).toBeNull();
  });

  it('records the decline', () => {
    const decline = buttons().find(
      (b) => !b.classList.contains('consent-banner__btn--accept')
    );

    decline?.click();
    fixture.detectChanges();

    expect(consent.decision).toBe('denied');
    expect(banner()).toBeNull();
  });

  describe('the ask must not be a dark pattern', () => {
    it('offers exactly two buttons — no hidden "manage preferences" detour', () => {
      expect(buttons().length).toBe(2);
    });

    it('puts Decline first in the DOM, and therefore first in the tab order', () => {
      // The cheaper answer for us must not also be the easier one to reach.
      expect(buttons()[0].classList).not.toContain('consent-banner__btn--accept');
      expect(buttons()[1].classList).toContain('consent-banner__btn--accept');
    });

    it('gives both buttons the same class-driven geometry', () => {
      // Both carry the shared `.consent-banner__btn` class; only the accept
      // button adds a modifier, and the modifier changes fill, not size.
      for (const button of buttons()) {
        expect(button.classList).toContain('consent-banner__btn');
      }
    });

    it('does not block the page — it is a region, not a modal dialog', () => {
      const el = banner();

      expect(el?.getAttribute('role')).toBe('region');
      expect(el?.getAttribute('aria-modal')).toBeNull();
    });
  });
});
