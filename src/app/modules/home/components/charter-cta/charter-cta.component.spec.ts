import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

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

    fixture = TestBed.createComponent(CharterCtaComponent);
    fixture.detectChanges();
  });

  /**
   * Clicks the link with the default action cancelled. Without that, Karma
   * follows the `tel:` href and the runner aborts the whole suite with "Some of
   * your tests did a full page reload!" — measured, not defensive.
   */
  function clickCallLink(): HTMLAnchorElement {
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.charter-call-btn');
    link.addEventListener('click', (event: Event) => event.preventDefault());
    link.dispatchEvent(new MouseEvent('click', { cancelable: true }));
    return link;
  }

  it('sends charter_call_click when the phone link is tapped', () => {
    clickCallLink();

    expect(analytics.track).toHaveBeenCalledOnceWith('charter_call_click', {
      placement: 'home',
    });
  });

  it('carries no phone number in the payload — the PII guard refuses one', () => {
    clickCallLink();

    const params = analytics.track.calls.mostRecent().args[1];
    expect(JSON.stringify(params)).not.toContain('0814284492');
  });

  // Phase 0 is a phone call ON PURPOSE: contract E-51-29 clause 8 needs บขส.'s
  // written permission 3 days before a bus may leave its route, so a button
  // that confirmed a charter here would be selling what nobody can promise yet.
  it('offers a tel: link and no booking control', () => {
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.charter-call-btn');

    expect(link.getAttribute('href')).toBe('tel:0814284492');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
