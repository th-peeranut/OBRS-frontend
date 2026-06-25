import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PrimeNGConfig } from 'primeng/api';
import { BehaviorSubject } from 'rxjs';
import { NavbarComponent } from './navbar.component';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../services/alert.service';
import {
  createElementRefStub,
  createLanguageServiceStub,
  createRouterStub,
  createTranslateStub,
} from '../../../testing/test-stubs';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let authStatus$: BehaviorSubject<boolean>;
  let roles: string[];
  let languageServiceStub: ReturnType<typeof createLanguageServiceStub>;

  function createAuthStub(): any {
    return {
      authStatus$,
      getUsername: () => 'tester',
      hasAnyRole: (required: string[]) =>
        required.some((role) => roles.includes(role)),
    };
  }

  beforeEach(() => {
    authStatus$ = new BehaviorSubject<boolean>(false);
    roles = [];
    languageServiceStub = createLanguageServiceStub();
    component = new NavbarComponent(
      createTranslateStub(),
      {} as never,
      createElementRefStub(),
      createAuthStub(),
      createRouterStub(),
      {} as never,
      languageServiceStub
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('flags admin users when logged in with the admin role', () => {
    roles = ['admin'];
    authStatus$.next(true);

    component.ngOnInit();

    expect(component.isAdmin).toBe(true);
  });

  it('does not flag logged-in users without the admin role', () => {
    roles = ['user'];
    authStatus$.next(true);

    component.ngOnInit();

    expect(component.isAdmin).toBe(false);
  });

  it('clears the admin flag on logout', () => {
    roles = ['admin'];
    authStatus$.next(true);
    component.ngOnInit();
    expect(component.isAdmin).toBe(true);

    roles = [];
    authStatus$.next(false);

    expect(component.isAdmin).toBe(false);
  });

  it('flags salesperson users when logged in with the salesperson role', () => {
    roles = ['salesperson'];
    authStatus$.next(true);

    component.ngOnInit();

    expect(component.isSalesperson).toBe(true);
    expect(component.isDriver).toBe(false);
  });

  it('flags driver users when logged in with the driver role', () => {
    roles = ['driver'];
    authStatus$.next(true);

    component.ngOnInit();

    expect(component.isDriver).toBe(true);
    expect(component.isSalesperson).toBe(false);
  });

  it('flags both roles when user has salesperson and driver roles', () => {
    roles = ['salesperson', 'driver'];
    authStatus$.next(true);

    component.ngOnInit();

    expect(component.isSalesperson).toBe(true);
    expect(component.isDriver).toBe(true);
  });

  it('clears staff flags on logout', () => {
    roles = ['salesperson', 'driver'];
    authStatus$.next(true);
    component.ngOnInit();
    expect(component.isSalesperson).toBe(true);
    expect(component.isDriver).toBe(true);

    roles = [];
    authStatus$.next(false);

    expect(component.isSalesperson).toBe(false);
    expect(component.isDriver).toBe(false);
  });

  it('delegates language switching to LanguageService (which persists it)', () => {
    // Regression for #22: switching must go through LanguageService so the
    // choice is persisted and the authInterceptor sends a matching
    // Accept-Language header (instead of each component re-implementing it).
    const switchSpy = spyOn(languageServiceStub, 'switch').and.resolveTo();

    component.switchLanguage('en');

    expect(switchSpy).toHaveBeenCalledWith('en');
  });

  it('reflects currentLanguage when TH is selected', () => {
    component.switchLanguage('th');
    expect(component.currentLanguage).toBe('th');
  });

  it('reflects currentLanguage when EN is selected', () => {
    component.switchLanguage('en');
    expect(component.currentLanguage).toBe('en');
  });

  it('reflects currentLanguage when ZH is selected', () => {
    component.switchLanguage('zh');
    expect(component.currentLanguage).toBe('zh');
  });

  it('delegates ZH language switching to LanguageService', () => {
    const switchSpy = spyOn(languageServiceStub, 'switch').and.resolveTo();

    component.switchLanguage('zh');

    expect(switchSpy).toHaveBeenCalledWith('zh');
  });

  it('clears auth and navigates to /home on sign out', async () => {
    // Parity with the admin topbar: sign-out must navigate away, not leave the
    // user on the current (possibly auth-gated) page.
    const router = createRouterStub();
    const navSpy = spyOn(router, 'navigate').and.resolveTo(true);
    const auth: any = createAuthStub();
    auth.clearAuthData = () => {};
    const clearSpy = spyOn(auth, 'clearAuthData');
    const comp = new NavbarComponent(
      createTranslateStub(),
      {} as never,
      createElementRefStub(),
      auth,
      router,
      { success: () => {} } as never,
      createLanguageServiceStub()
    );

    await comp.onLogout();

    expect(clearSpy).toHaveBeenCalled();
    expect(navSpy).toHaveBeenCalledWith(['/home']);
  });

  it('scrolls to the footer contact section', () => {
    const target = document.createElement('div');
    target.id = 'footer-contact';
    const scrollSpy = spyOn(target, 'scrollIntoView');
    document.body.appendChild(target);

    try {
      component.scrollToContact();
      expect(scrollSpy).toHaveBeenCalled();
    } finally {
      document.body.removeChild(target);
    }
  });

  // ── Language dropdown state ─────────────────────────────────────────────────

  it('isLangDropdownOpen starts as false', () => {
    // Verify the initial state — toggle logic is exercised in the template suite
    // where Renderer2 is provided by TestBed.
    expect(component.isLangDropdownOpen).toBe(false);
  });

  it('closeLangDropdown sets isLangDropdownOpen to false', () => {
    component.isLangDropdownOpen = true;
    component.closeLangDropdown();
    expect(component.isLangDropdownOpen).toBe(false);
  });

  it('selectLanguage switches the language and closes the dropdown', () => {
    const switchSpy = spyOn(languageServiceStub, 'switch').and.resolveTo();
    component.isLangDropdownOpen = true;

    component.selectLanguage('zh');

    expect(switchSpy).toHaveBeenCalledWith('zh');
    expect(component.currentLanguage).toBe('zh');
    expect(component.isLangDropdownOpen).toBe(false);
  });

  it('selectLanguage works for all three language codes', () => {
    for (const code of ['en', 'th', 'zh']) {
      component.selectLanguage(code);
      expect(component.currentLanguage).toBe(code);
    }
  });

  it('Escape closes the language dropdown', () => {
    component.isLangDropdownOpen = true;
    component.closeDropdownsOnEscape();
    expect(component.isLangDropdownOpen).toBe(false);
  });

  it('Escape closes the profile dropdown', () => {
    component.isProfileDropdownOpen = true;
    component.closeDropdownsOnEscape();
    expect(component.isProfileDropdownOpen).toBe(false);
  });

  it('Escape closes the mobile menu', () => {
    component.isMobileMenuOpen = true;
    component.closeDropdownsOnEscape();
    expect(component.isMobileMenuOpen).toBe(false);
  });

  // ── Mobile hamburger state ──────────────────────────────────────────────────

  it('isMobileMenuOpen starts as false', () => {
    expect(component.isMobileMenuOpen).toBe(false);
  });

  it('closeMobileMenu sets isMobileMenuOpen to false', () => {
    component.isMobileMenuOpen = true;
    component.closeMobileMenu();
    expect(component.isMobileMenuOpen).toBe(false);
  });

  it('closeMobileMenu also closes the language sub-dropdown', () => {
    component.isMobileMenuOpen = true;
    component.isLangDropdownOpen = true;
    component.closeMobileMenu();
    expect(component.isMobileMenuOpen).toBe(false);
    expect(component.isLangDropdownOpen).toBe(false);
  });

  it('selectLanguage does NOT close the mobile menu', () => {
    component.isMobileMenuOpen = true;
    component.selectLanguage('en');
    expect(component.isMobileMenuOpen).toBe(true);
  });

  it('languages list has exactly three entries: en, th, zh', () => {
    const codes = component.languages.map((l) => l.code);
    expect(codes).toEqual(['en', 'th', 'zh']);
  });

  it('currentEndonym returns English for EN', () => {
    component.currentLanguage = 'en';
    expect(component.currentEndonym).toBe('English');
  });

  it('currentEndonym returns ไทย for TH', () => {
    component.currentLanguage = 'th';
    expect(component.currentEndonym).toBe('ไทย');
  });

  it('currentEndonym returns 中文 for ZH', () => {
    component.currentLanguage = 'zh';
    expect(component.currentEndonym).toBe('中文');
  });

  describe('userInitials getter', () => {
    it('returns two initials from a dot-separated username', () => {
      const stub: any = {
        authStatus$,
        getUsername: () => 'john.doe',
        hasAnyRole: () => false,
      };
      const comp = new NavbarComponent(
        createTranslateStub(),
        {} as never,
        createElementRefStub(),
        stub,
        createRouterStub(),
        {} as never,
        createLanguageServiceStub()
      );
      expect(comp.userInitials).toBe('JD');
    });

    it('returns first two chars when username has a single segment', () => {
      const stub: any = {
        authStatus$,
        getUsername: () => 'alice',
        hasAnyRole: () => false,
      };
      const comp = new NavbarComponent(
        createTranslateStub(),
        {} as never,
        createElementRefStub(),
        stub,
        createRouterStub(),
        {} as never,
        createLanguageServiceStub()
      );
      expect(comp.userInitials).toBe('AL');
    });

    it('strips the email domain before computing initials', () => {
      const stub: any = {
        authStatus$,
        getUsername: () => 'jane.smith@example.com',
        hasAnyRole: () => false,
      };
      const comp = new NavbarComponent(
        createTranslateStub(),
        {} as never,
        createElementRefStub(),
        stub,
        createRouterStub(),
        {} as never,
        createLanguageServiceStub()
      );
      expect(comp.userInitials).toBe('JS');
    });

    it('falls back to AD when username is null', () => {
      const stub: any = {
        authStatus$,
        getUsername: () => null,
        hasAnyRole: () => false,
      };
      const comp = new NavbarComponent(
        createTranslateStub(),
        {} as never,
        createElementRefStub(),
        stub,
        createRouterStub(),
        {} as never,
        createLanguageServiceStub()
      );
      expect(comp.userInitials).toBe('AD');
    });
  });
});

describe('NavbarComponent template', () => {
  let fixture: ComponentFixture<NavbarComponent>;

  const authStub = {
    authStatus$: new BehaviorSubject<boolean>(false),
    getUsername: () => 'tester',
    hasAnyRole: () => false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NavbarComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNGConfig, useValue: { setTranslation: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();
  });

  it('makes the logo navigate to /home', () => {
    // Regression for #20: the logo is the home navigation, replacing the
    // separate Home menu link.
    const logoLink = fixture.debugElement.query(
      By.css('a.logo[href="/home"] img.logo'),
    );
    expect(logoLink).withContext('logo should link to /home').toBeTruthy();
    expect(logoLink.nativeElement.getAttribute('src')).toBe('images/logo.svg');
  });

  it('has no separate Home menu link', () => {
    // Regression for #20: home navigation lives on the logo only; the
    // dedicated Home menu link must be gone.
    const menuHomeLink = fixture.debugElement.query(
      By.css('a.menu-font[href="/home"]'),
    );
    expect(menuHomeLink)
      .withContext('separate Home menu link should be removed')
      .toBeNull();
  });

  it('renders the language trigger button', () => {
    const trigger = fixture.debugElement.query(
      By.css('.navbar-lang-trigger')
    );
    expect(trigger).withContext('language trigger should be present').toBeTruthy();
  });

  it('language trigger has aria-haspopup="menu"', () => {
    const trigger = fixture.debugElement.query(By.css('.navbar-lang-trigger'));
    expect(trigger.nativeElement.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('language dropdown is closed initially', () => {
    const menu = fixture.debugElement.query(By.css('.navbar-lang-menu'));
    expect(menu).withContext('language menu should not be rendered initially').toBeNull();
  });

  it('clicking the trigger opens the language dropdown', () => {
    const trigger = fixture.debugElement.query(By.css('.navbar-lang-trigger'));
    trigger.nativeElement.click();
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('.navbar-lang-menu'));
    expect(menu).withContext('language menu should open after click').toBeTruthy();
  });

  it('clicking the trigger twice closes the language dropdown', () => {
    const trigger = fixture.debugElement.query(By.css('.navbar-lang-trigger'));
    trigger.nativeElement.click();
    fixture.detectChanges();
    trigger.nativeElement.click();
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('.navbar-lang-menu'));
    expect(menu).withContext('language menu should close on second click').toBeNull();
  });

  it('open language menu has role="menu"', () => {
    fixture.componentInstance.isLangDropdownOpen = true;
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('.navbar-lang-menu'));
    expect(menu.nativeElement.getAttribute('role')).toBe('menu');
  });

  it('language menu contains items with role="menuitemradio"', () => {
    fixture.componentInstance.isLangDropdownOpen = true;
    fixture.detectChanges();

    const items = fixture.debugElement.queryAll(By.css('.navbar-lang-item[role="menuitemradio"]'));
    expect(items.length).toBe(3);
  });

  it('renders all three endonyms in the open menu', () => {
    fixture.componentInstance.isLangDropdownOpen = true;
    fixture.detectChanges();

    const items = fixture.debugElement.queryAll(By.css('.navbar-lang-item'));
    const texts = items.map((i) => i.nativeElement.textContent.trim());
    expect(texts.some((t) => t.includes('English'))).toBe(true);
    expect(texts.some((t) => t.includes('ไทย'))).toBe(true);
    expect(texts.some((t) => t.includes('中文'))).toBe(true);
  });

  it('active language item has aria-checked="true"', () => {
    fixture.componentInstance.currentLanguage = 'th';
    fixture.componentInstance.isLangDropdownOpen = true;
    fixture.detectChanges();

    const items = fixture.debugElement.queryAll(By.css('.navbar-lang-item'));
    const thItem = items.find((i) => i.nativeElement.textContent.includes('ไทย'));
    expect(thItem).toBeTruthy();
    expect(thItem!.nativeElement.getAttribute('aria-checked')).toBe('true');
  });

  it('active language item has the active CSS class', () => {
    fixture.componentInstance.currentLanguage = 'en';
    fixture.componentInstance.isLangDropdownOpen = true;
    fixture.detectChanges();

    const items = fixture.debugElement.queryAll(By.css('.navbar-lang-item'));
    const enItem = items.find((i) => i.nativeElement.textContent.includes('English'));
    expect(enItem!.nativeElement.classList.contains('active')).toBe(true);
  });

  it('selecting a language item calls switchLanguage and closes the menu', () => {
    fixture.componentInstance.isLangDropdownOpen = true;
    fixture.detectChanges();

    const switchSpy = spyOn(fixture.componentInstance, 'selectLanguage').and.callThrough();
    const items = fixture.debugElement.queryAll(By.css('.navbar-lang-item'));
    const zhItem = items.find((i) => i.nativeElement.textContent.includes('中文'));
    zhItem!.nativeElement.click();
    fixture.detectChanges();

    expect(switchSpy).toHaveBeenCalledWith('zh');
    expect(fixture.debugElement.query(By.css('.navbar-lang-menu'))).toBeNull();
  });

  it('trigger label shows the current language endonym', () => {
    fixture.componentInstance.currentLanguage = 'zh';
    fixture.detectChanges();

    const label = fixture.debugElement.query(By.css('.navbar-lang-label'));
    expect(label.nativeElement.textContent.trim()).toBe('中文');
  });

  it('does not show the avatar when logged out', () => {
    const avatar = fixture.debugElement.query(By.css('.navbar-avatar'));
    expect(avatar).withContext('avatar should not render when logged out').toBeNull();
  });
});

describe('NavbarComponent template (logged in)', () => {
  let fixture: ComponentFixture<NavbarComponent>;
  let component: NavbarComponent;

  const authStub = {
    authStatus$: new BehaviorSubject<boolean>(true),
    getUsername: () => 'john.doe',
    hasAnyRole: (required: string[]) => required.includes('admin'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NavbarComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNGConfig, useValue: { setTranslation: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the avatar with user initials when logged in', () => {
    const avatar = fixture.debugElement.query(By.css('.navbar-avatar'));
    expect(avatar).withContext('avatar should render when logged in').toBeTruthy();
    expect(avatar.nativeElement.textContent.trim()).toBe('JD');
  });

  it('opens and closes the profile menu when the avatar is toggled', () => {
    expect(fixture.debugElement.query(By.css('.navbar-profile-menu'))).toBeNull();

    component.toggleProfileDropdown();
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.css('.navbar-profile-menu')),
    ).withContext('menu should open on first toggle').toBeTruthy();

    component.toggleProfileDropdown();
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.css('.navbar-profile-menu')),
    ).withContext('menu should close on second toggle').toBeNull();
  });

  it('closes the open profile menu on Escape (parity with admin topbar)', () => {
    component.toggleProfileDropdown();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.navbar-profile-menu'))).toBeTruthy();

    component.closeProfileDropdownOnEscape();
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.css('.navbar-profile-menu')),
    ).withContext('Escape should close the menu').toBeNull();
  });

  it('shows the admin dashboard link in the menu for admin users', () => {
    component.toggleProfileDropdown();
    fixture.detectChanges();

    const dashboardLink = fixture.debugElement.query(
      By.css('.navbar-profile-item[href="/admin/dashboard"]'),
    );
    expect(dashboardLink)
      .withContext('admin users should see the dashboard link')
      .toBeTruthy();
  });
});

describe('NavbarComponent hamburger menu', () => {
  let fixture: ComponentFixture<NavbarComponent>;
  let component: NavbarComponent;

  const authStub = {
    authStatus$: new BehaviorSubject<boolean>(false),
    getUsername: () => 'tester',
    hasAnyRole: () => false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NavbarComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNGConfig, useValue: { setTranslation: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the hamburger button', () => {
    const btn = fixture.debugElement.query(By.css('.navbar-hamburger'));
    expect(btn).withContext('hamburger button should be in the DOM').toBeTruthy();
  });

  it('hamburger button has aria-controls="navbar-mobile-panel"', () => {
    const btn = fixture.debugElement.query(By.css('.navbar-hamburger'));
    expect(btn.nativeElement.getAttribute('aria-controls')).toBe('navbar-mobile-panel');
  });

  it('hamburger button has aria-expanded="false" initially', () => {
    const btn = fixture.debugElement.query(By.css('.navbar-hamburger'));
    expect(btn.nativeElement.getAttribute('aria-expanded')).toBe('false');
  });

  it('mobile panel is not rendered initially', () => {
    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    expect(panel).withContext('mobile panel should be absent initially').toBeNull();
  });

  it('clicking the hamburger button opens the mobile panel', () => {
    const btn = fixture.debugElement.query(By.css('.navbar-hamburger'));
    btn.nativeElement.click();
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    expect(panel).withContext('mobile panel should appear after click').toBeTruthy();
  });

  it('hamburger aria-expanded becomes true when panel is open', () => {
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    const btn = fixture.debugElement.query(By.css('.navbar-hamburger'));
    expect(btn.nativeElement.getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking the hamburger again closes the mobile panel', () => {
    const btn = fixture.debugElement.query(By.css('.navbar-hamburger'));
    btn.nativeElement.click();
    fixture.detectChanges();
    btn.nativeElement.click();
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    expect(panel).withContext('mobile panel should close on second click').toBeNull();
  });

  it('mobile panel has role="navigation"', () => {
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    expect(panel.nativeElement.getAttribute('role')).toBe('navigation');
  });

  it('mobile panel has id="navbar-mobile-panel"', () => {
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('#navbar-mobile-panel'));
    expect(panel).toBeTruthy();
  });

  it('mobile panel contains the language switcher trigger', () => {
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    const triggers = panel.queryAll(By.css('.navbar-lang-trigger'));
    expect(triggers.length).toBeGreaterThan(0);
  });

  it('mobile panel language switcher is in the first section (top position)', () => {
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    const sections = panel.queryAll(By.css('.navbar-mobile-section'));
    expect(sections.length).toBeGreaterThan(0);

    // The first section must contain the language trigger.
    const langInFirstSection = sections[0].query(By.css('.navbar-lang-trigger'));
    expect(langInFirstSection)
      .withContext('language switcher should be in the first section of the mobile panel')
      .toBeTruthy();
  });

  it('mobile panel contains the how-to-book nav link', () => {
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    const link = panel.query(By.css('a.navbar-mobile-link[href="/how-to-book"]'));
    expect(link).withContext('how-to-book link should be in the panel').toBeTruthy();
  });

  it('mobile panel contains sign-in and register links when logged out', () => {
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    const loginLink = panel.query(By.css('a.navbar-mobile-link[href="/login"]'));
    const registerLink = panel.query(By.css('a.navbar-mobile-link[href="/register"]'));
    expect(loginLink).withContext('sign-in link should be present').toBeTruthy();
    expect(registerLink).withContext('register link should be present').toBeTruthy();
  });

  it('Escape closes the mobile panel', () => {
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    component.closeDropdownsOnEscape();
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    expect(panel).withContext('Escape should close the mobile panel').toBeNull();
  });

  it('clicking a nav link in the mobile panel closes the panel', () => {
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    const link = panel.query(By.css('a.navbar-mobile-link[href="/how-to-book"]'));
    link.nativeElement.click();
    fixture.detectChanges();

    expect(component.isMobileMenuOpen).toBe(false);
  });

  it('language selection inside mobile panel does NOT close the panel', () => {
    component.isMobileMenuOpen = true;
    component.isLangDropdownOpen = true;
    fixture.detectChanges();

    // Click a language item in the mobile panel.
    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    const items = panel.queryAll(By.css('.navbar-lang-item'));
    expect(items.length).toBeGreaterThan(0);
    items[0].nativeElement.click();
    fixture.detectChanges();

    // Language sub-dropdown closes but mobile panel stays open.
    expect(component.isMobileMenuOpen).toBe(true);
    expect(component.isLangDropdownOpen).toBe(false);
  });

  it('opening the lang dropdown via the MOBILE trigger keeps it open', () => {
    // Regression: the switcher template renders twice (desktop + mobile). The
    // same-click guard must treat a click on EITHER trigger as inside, otherwise
    // the menu opened from the mobile panel snaps shut on the same click. Drive
    // the real toggle + outside-click guard with the mobile trigger as target.
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    const triggers = fixture.debugElement.queryAll(By.css('.navbar-lang-trigger'));
    expect(triggers.length).toBe(2);
    const mobileTrigger = fixture.debugElement
      .query(By.css('.navbar-mobile-panel'))
      .query(By.css('.navbar-lang-trigger')).nativeElement;

    component.toggleLangDropdown();
    expect(component.isLangDropdownOpen).toBe(true);

    // Simulate the same opening click bubbling to document, target = MOBILE trigger.
    component.handleLangDropdownOutsideClick({ target: mobileTrigger } as unknown as Event);

    expect(component.isLangDropdownOpen)
      .withContext('lang menu must stay open when opened from the mobile trigger')
      .toBe(true);
  });
});
