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
  createPrimeNgConfigStub,
  createRouterStub,
  createTranslateStub,
} from '../../../testing/test-stubs';

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
      createPrimeNgConfigStub(),
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

  it('persists the selected language so the Accept-Language header matches', () => {
    // Regression for #22: switchLanguage only called translate.use(), so the
    // authInterceptor (Accept-Language = localStorage.app_language || 'th')
    // kept sending 'th' and backend error modals stayed Thai after switching.
    localStorage.removeItem('app_language');

    component.switchLanguage('en');
    expect(localStorage.getItem('app_language')).toBe('en');

    component.switchLanguage('th');
    expect(localStorage.getItem('app_language')).toBe('th');
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
});
