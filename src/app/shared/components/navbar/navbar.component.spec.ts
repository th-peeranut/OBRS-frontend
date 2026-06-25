import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PrimeNGConfig } from 'primeng/api';
import { BehaviorSubject, of } from 'rxjs';
import { NavbarComponent } from './navbar.component';
import { LangSwitcherComponent } from '../lang-switcher/lang-switcher.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../services/alert.service';
import { LanguageService } from '../../services/language.service';
import { ThemeService } from '../../services/theme.service';
import {
  createElementRefStub,
  createLanguageServiceStub,
  createRouterStub,
  createTranslateStub,
} from '../../../testing/test-stubs';

function createThemeServiceStub(): any {
  return {
    mode$: of('light'),
    toggle: jasmine.createSpy('toggle'),
    getStoredMode: () => 'light',
    setMode: () => {},
    init: () => {},
  };
}

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let authStatus$: BehaviorSubject<boolean>;
  let roles: string[];

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
    component = new NavbarComponent(
      createTranslateStub(),
      {} as never,
      createElementRefStub(),
      createAuthStub(),
      createRouterStub(),
      {} as never
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
      { success: () => {} } as never
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

  // ── Overlay state (profile + mobile; language lives in LangSwitcherComponent) ──

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

  it('isMobileMenuOpen starts as false', () => {
    expect(component.isMobileMenuOpen).toBe(false);
  });

  it('closeMobileMenu sets isMobileMenuOpen to false', () => {
    component.isMobileMenuOpen = true;
    component.closeMobileMenu();
    expect(component.isMobileMenuOpen).toBe(false);
  });

  describe('userInitials getter', () => {
    function makeComp(getUsername: () => string | null): NavbarComponent {
      const stub: any = {
        authStatus$,
        getUsername,
        hasAnyRole: () => false,
      };
      return new NavbarComponent(
        createTranslateStub(),
        {} as never,
        createElementRefStub(),
        stub,
        createRouterStub(),
        {} as never
      );
    }

    it('returns two initials from a dot-separated username', () => {
      expect(makeComp(() => 'john.doe').userInitials).toBe('JD');
    });

    it('returns first two chars when username has a single segment', () => {
      expect(makeComp(() => 'alice').userInitials).toBe('AL');
    });

    it('strips the email domain before computing initials', () => {
      expect(makeComp(() => 'jane.smith@example.com').userInitials).toBe('JS');
    });

    it('falls back to AD when username is null', () => {
      expect(makeComp(() => null).userInitials).toBe('AD');
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
      declarations: [NavbarComponent, LangSwitcherComponent, ThemeToggleComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNGConfig, useValue: { setTranslation: () => {} } },
        { provide: LanguageService, useValue: createLanguageServiceStub() },
        { provide: ThemeService, useValue: createThemeServiceStub() },
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

  it('renders the shared language switcher in the desktop bar', () => {
    const switcher = fixture.debugElement.query(By.css('app-lang-switcher'));
    expect(switcher).withContext('language switcher should be present').toBeTruthy();
    expect(switcher.query(By.css('.navbar-lang-trigger'))).toBeTruthy();
  });

  it('renders the theme toggle in the desktop bar', () => {
    const toggle = fixture.debugElement.query(By.css('app-theme-toggle'));
    expect(toggle).withContext('theme toggle should be present in the desktop bar').toBeTruthy();
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
      declarations: [NavbarComponent, LangSwitcherComponent, ThemeToggleComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNGConfig, useValue: { setTranslation: () => {} } },
        { provide: LanguageService, useValue: createLanguageServiceStub() },
        { provide: ThemeService, useValue: createThemeServiceStub() },
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
      declarations: [NavbarComponent, LangSwitcherComponent, ThemeToggleComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNGConfig, useValue: { setTranslation: () => {} } },
        { provide: LanguageService, useValue: createLanguageServiceStub() },
        { provide: ThemeService, useValue: createThemeServiceStub() },
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

  it('mobile panel contains the language switcher in its first section (top)', () => {
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    const sections = panel.queryAll(By.css('.navbar-mobile-section'));
    expect(sections.length).toBeGreaterThan(0);

    const langInFirstSection = sections[0].query(By.css('app-lang-switcher'));
    expect(langInFirstSection)
      .withContext('language switcher should be in the first section of the mobile panel')
      .toBeTruthy();
  });

  it('the mobile switcher menu aligns left (menuAlign input)', () => {
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    const switcher = panel.query(By.directive(LangSwitcherComponent));
    expect(switcher.componentInstance.menuAlign).toBe('left');
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

  it('selecting a language inside the mobile panel does NOT close the panel', () => {
    component.isMobileMenuOpen = true;
    fixture.detectChanges();

    // Open the in-panel switcher and pick a language.
    const panel = fixture.debugElement.query(By.css('.navbar-mobile-panel'));
    panel.query(By.css('.navbar-lang-trigger')).nativeElement.click();
    fixture.detectChanges();
    panel.query(By.css('.navbar-lang-item')).nativeElement.click();
    fixture.detectChanges();

    // The switcher manages its own state; the parent panel stays open.
    expect(component.isMobileMenuOpen).toBe(true);
  });
});
