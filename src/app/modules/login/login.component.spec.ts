import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';

import { LoginComponent } from './login.component';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let queryParams: Record<string, string | null>;

  function createActivatedRouteStub(): unknown {
    return {
      snapshot: {
        queryParamMap: {
          get: (key: string) => queryParams[key] ?? null,
        },
      },
    };
  }

  beforeEach(async () => {
    queryParams = {};

    await TestBed.configureTestingModule({
      declarations: [LoginComponent],
      imports: [
        ReactiveFormsModule,
        RouterTestingModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: AlertService, useValue: {} },
        { provide: ActivatedRoute, useFactory: createActivatedRouteStub },
      ],
      // app-theme-toggle / app-lang-switcher are exercised by their own specs;
      // ignore them here so this spec stays focused on the login layout.
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    // Tears down the GIS-ready polling interval started in ngAfterViewInit.
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Locks the centered auth-card layout (design-system §12). Regressing to the
  // old 60/40 split (.left-section + .bg-img) would push the Google sign-in
  // button below the fold on a laptop again — the bug this pattern fixed.
  describe('centered auth-card layout', () => {
    let el: HTMLElement;
    beforeEach(() => (el = fixture.nativeElement as HTMLElement));

    it('renders a single centered card', () => {
      expect(el.querySelector('.login-card')).toBeTruthy();
    });

    it('does not use the old split-column layout', () => {
      expect(el.querySelector('.left-section')).toBeNull();
      expect(el.querySelector('.bg-img')).toBeNull();
    });

    it('keeps the Google sign-in button inside the card', () => {
      const card = el.querySelector('.login-card');
      expect(card?.querySelector('#google-signin-btn-container')).toBeTruthy();
    });
  });

  // Locks OBRS-90: a language change re-localizes the Google button by
  // re-injecting the gsi/client script with the new `hl` — NOT via a full
  // window.location.reload(). Regressing to a reload would drop entered form
  // state on every language toggle.
  describe('GSI language switch (OBRS-90)', () => {
    afterEach(() => {
      document
        .querySelectorAll('script[src*="gsi/client"]')
        .forEach((s) => s.remove());
    });

    it('re-injects the gsi/client script with the new hl (no page reload)', () => {
      // The old behavior was window.location.reload() with no script injection;
      // asserting a fresh gsi/client script with the new hl locks the re-init path.
      (component as unknown as { reloadGisForLanguage(l: string): void })
        .reloadGisForLanguage('en');

      const script = document.querySelector('script[src*="gsi/client"]');
      expect(script?.getAttribute('src')).toContain('hl=en');
    });
  });

  it('does not show the email-changed banner without ?reason=email-changed', () => {
    expect(component.showEmailChangedBanner).toBe(false);
  });

  // OBRS-628 AC-1. This checkbox is a real consent point — the overlay above the
  // Google button swallows the click until it is ticked — yet the only route to
  // /privacy-policy anywhere in the app was the home-page footer, which this page
  // does not render. So people consented to a notice they had no way to open.
  describe('PDPA consent links to the notice being consented to (OBRS-628)', () => {
    function link(): HTMLAnchorElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector(
        'a[data-testid="pdpa-privacy-policy-link"]'
      );
    }

    it('renders a link to /privacy-policy beside the consent checkbox', () => {
      const anchor = link();
      expect(anchor).toBeTruthy();
      expect(anchor?.getAttribute('href')).toBe('/privacy-policy');
    });

    it('sits inside the same block as the consent checkbox, not adrift on the page', () => {
      // A link somewhere on the screen is not the same as a link AT the consent.
      const block = link()?.closest('.form-check');
      expect(block?.querySelector('#pdpaGoogleConsent')).toBeTruthy();
    });

    it('opens in a new tab so a typed username and password survive the trip', () => {
      // Load-bearing: an in-tab navigation would tear down the login form. rel is
      // asserted with it because target="_blank" without noopener hands the opened
      // page a window.opener handle back into this one.
      expect(link()?.getAttribute('target')).toBe('_blank');
      expect(link()?.getAttribute('rel')).toContain('noopener');
    });
  });
});

describe('LoginComponent — email-changed banner (OBRS-84)', () => {
  function setUp(routeQueryParams: Record<string, string | null>): {
    component: LoginComponent;
    fixture: ComponentFixture<LoginComponent>;
  } {
    TestBed.configureTestingModule({
      declarations: [LoginComponent],
      imports: [ReactiveFormsModule, RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: AlertService, useValue: {} },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: (key: string) => routeQueryParams[key] ?? null },
            },
          },
        },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });

    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return { component, fixture };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the banner when ?reason=email-changed is present', () => {
    const { component } = setUp({ reason: 'email-changed' });
    expect(component.showEmailChangedBanner).toBe(true);
  });

  it('prefills the email field from ?email= when present', () => {
    const { component } = setUp({ reason: 'email-changed', email: 'new@example.com' });
    expect(component.loginForm.get('email')?.value).toBe('new@example.com');
  });

  it('does not prefill the email field when ?email= is absent', () => {
    const { component } = setUp({ reason: 'email-changed' });
    expect(component.loginForm.get('email')?.value).toBe('');
  });

  it('renders the banner text in the template', () => {
    const { fixture } = setUp({ reason: 'email-changed' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.email-changed-banner')).toBeTruthy();
  });
});
