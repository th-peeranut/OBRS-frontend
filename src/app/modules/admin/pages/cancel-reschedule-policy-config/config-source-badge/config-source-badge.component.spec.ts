import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ConfigSourceBadgeComponent } from './config-source-badge.component';

describe('ConfigSourceBadgeComponent (OBRS-699)', () => {
  let fixture: ComponentFixture<ConfigSourceBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ConfigSourceBadgeComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(ConfigSourceBadgeComponent);
  });

  function badge(): HTMLElement {
    return fixture.nativeElement.querySelector('[data-testid="config-source-badge"]');
  }

  it('renders the neutral variant while the value is still the platform default', () => {
    fixture.componentInstance.overridden = false;
    fixture.detectChanges();

    expect(badge().classList).toContain('is-neutral');
    expect(badge().classList).not.toContain('is-info');
    // Never colour alone (design-system rubric): the state has to be readable
    // as text, not only as a hue.
    expect(badge().textContent?.trim()).toBe(
      'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.SOURCE.DEFAULT'
    );
  });

  it('renders the info variant once the owner has set the value', () => {
    fixture.componentInstance.overridden = true;
    fixture.detectChanges();

    expect(badge().classList).toContain('is-info');
    expect(badge().classList).not.toContain('is-neutral');
    expect(badge().textContent?.trim()).toBe(
      'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.SOURCE.CUSTOM'
    );
  });

  it('carries an accessible name that names the source, not a bare chip', () => {
    fixture.componentInstance.overridden = true;
    fixture.detectChanges();

    expect(badge().getAttribute('aria-label')).toContain(
      'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.SOURCE.ARIA'
    );
  });

  // OBRS-703: a second call site (operations-config) reuses this component via
  // `[i18nPrefix]` instead of forking a copy — proves the input actually
  // switches every key, not just the default's call sites above.
  it('reads SOURCE keys from a call-site-supplied i18nPrefix', () => {
    fixture.componentInstance.i18nPrefix = 'ADMIN.OPERATIONS_CONFIG';
    fixture.componentInstance.overridden = true;
    fixture.detectChanges();

    expect(badge().textContent?.trim()).toBe('ADMIN.OPERATIONS_CONFIG.SOURCE.CUSTOM');
    expect(badge().getAttribute('aria-label')).toContain('ADMIN.OPERATIONS_CONFIG.SOURCE.ARIA');
  });
});
