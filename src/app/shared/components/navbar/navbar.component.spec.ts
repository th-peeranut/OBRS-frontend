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
  let languageServiceStub: any;

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

  it('renders the TH language button', () => {
    const thBtn = fixture.debugElement.query(
      By.css('.navbar-lang-btn[aria-pressed]')
    );
    expect(thBtn).withContext('TH/EN toggle should be present').toBeTruthy();
  });

  it('marks the active language button with the active class', () => {
    fixture.componentInstance.currentLanguage = 'th';
    fixture.detectChanges();

    const buttons = fixture.debugElement.queryAll(By.css('.navbar-lang-btn'));
    const activeButtons = buttons.filter(btn =>
      btn.nativeElement.classList.contains('active')
    );
    expect(activeButtons.length).toBe(1);
    expect(activeButtons[0].nativeElement.textContent.trim()).toBe('TH');
  });

  it('switches the active class to EN when EN is the current language', () => {
    fixture.componentInstance.currentLanguage = 'en';
    fixture.detectChanges();

    const buttons = fixture.debugElement.queryAll(By.css('.navbar-lang-btn'));
    const activeButtons = buttons.filter(btn =>
      btn.nativeElement.classList.contains('active')
    );
    expect(activeButtons.length).toBe(1);
    expect(activeButtons[0].nativeElement.textContent.trim()).toBe('EN');
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
