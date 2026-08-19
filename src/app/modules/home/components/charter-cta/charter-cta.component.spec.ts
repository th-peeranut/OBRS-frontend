import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AnalyticsService } from '../../../../services/analytics/analytics.service';
import { CharterCtaComponent } from './charter-cta.component';

describe('CharterCtaComponent', () => {
  let fixture: ComponentFixture<CharterCtaComponent>;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  beforeEach(async () => {
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['track']);

    await TestBed.configureTestingModule({
      imports: [CharterCtaComponent, TranslateModule.forRoot()],
      providers: [{ provide: AnalyticsService, useValue: analytics }],
    }).compileComponents();

    // Real copy for CALL_CTA, because the number only reaches the screen through
    // that key's `{{phone}}` interpolation — with the key left untranslated the
    // "is the number rendered" assertion below would pass against a raw key.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      HOME: { CHARTER: { CALL_CTA: 'Call {{phone}}' } },
    });
    translate.use('en');

    fixture = TestBed.createComponent(CharterCtaComponent);
    fixture.detectChanges();
  });

  function html(): string {
    return fixture.nativeElement.innerHTML as string;
  }

  function revealButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('button.charter-call-btn');
  }

  function callLink(): HTMLAnchorElement | null {
    return fixture.nativeElement.querySelector('a.charter-call-btn');
  }

  function reveal(): void {
    revealButton()!.click();
    fixture.detectChanges();
  }

  // The point of the whole click-to-reveal design: a crawler that does not run
  // the click finds nothing to harvest. If this ever fails, the feature is
  // cosmetic.
  it('does not put the number in the DOM before the click', () => {
    expect(revealButton()).not.toBeNull();
    expect(callLink()).toBeNull();
    expect(html()).not.toContain('0814284492');
    expect(html()).not.toContain('428-4492');
  });

  it('reveals a dialable link only after the click', () => {
    reveal();

    expect(callLink()!.getAttribute('href')).toBe('tel:0814284492');
    expect(html()).toContain('081-428-4492');
    expect(revealButton()).toBeNull();
  });

  it('records the lead on the reveal, not on the tel: tap', () => {
    reveal();

    expect(analytics.track).toHaveBeenCalledOnceWith('charter_phone_revealed', {
      placement: 'home',
    });
  });

  it('carries no phone number in the payload — the PII guard refuses one', () => {
    reveal();

    const params = analytics.track.calls.mostRecent().args[1];
    expect(JSON.stringify(params)).not.toContain('0814284492');
  });

  // Phase 0 is a phone call ON PURPOSE: contract E-51-29 clause 8 needs บขส.'s
  // written permission 3 days before a bus may leave its route, so a control
  // that confirmed a charter here would be selling what nobody can promise yet.
  it('offers no booking control in either state', () => {
    expect(fixture.nativeElement.querySelectorAll('form').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);

    reveal();

    expect(fixture.nativeElement.querySelectorAll('form').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
  });
});
