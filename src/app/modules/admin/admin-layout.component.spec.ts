import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PrimeNGConfig } from 'primeng/api';
import { BehaviorSubject } from 'rxjs';

// localStorage shim — keeps spec storage isolated
function clearSidebarStorage(): void {
  try { localStorage.removeItem('obrs-sidebar-collapsed'); } catch { /* ignore */ }
}

import { AdminLayoutComponent } from './admin-layout.component';
import { LangSwitcherComponent } from '../../shared/components/lang-switcher/lang-switcher.component';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { ThemeService, ThemeMode } from '../../shared/services/theme.service';
import { LanguageService } from '../../shared/services/language.service';
import { createLanguageServiceStub } from '../../testing/test-stubs';

describe('AdminLayoutComponent', () => {
  let fixture: ComponentFixture<AdminLayoutComponent>;

  const authStub = {
    getUsername: () => 'admin@obrs.test',
    logout: jasmine.createSpy('logout'),
    hasAnyRole: (_roles: string[]) => false,
  };

  const themeMode$ = new BehaviorSubject<ThemeMode>('light');
  const themeServiceStub: Partial<ThemeService> = {
    getStoredMode: () => 'light',
    setMode: jasmine.createSpy('setMode'),
    toggle: jasmine.createSpy('toggle'),
    mode$: themeMode$.asObservable(),
  };

  beforeEach(async () => {
    clearSidebarStorage();
    await TestBed.configureTestingModule({
      declarations: [AdminLayoutComponent, LangSwitcherComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNGConfig, useValue: { setTranslation: () => {} } },
        { provide: ThemeService, useValue: themeServiceStub },
        { provide: LanguageService, useValue: createLanguageServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminLayoutComponent);
    fixture.detectChanges();
  });

  afterEach(() => { clearSidebarStorage(); });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the brand as a link back to the public home page', () => {
    // Regression for #15: the admin shell had no UI path to /home.
    const brandLink = fixture.debugElement.query(By.css('.admin-brand-link'));
    expect(brandLink).withContext('brand link should exist').toBeTruthy();
    expect(brandLink.nativeElement.getAttribute('href')).toBe('/home');
  });

  it('renders the brand home link as the logo image', () => {
    // Regression for #17: the brand home link should use the logo, not text.
    const logo = fixture.debugElement.query(By.css('.admin-brand-link img.admin-brand-logo'));
    expect(logo).withContext('brand logo image should exist').toBeTruthy();
    expect(logo.nativeElement.getAttribute('src')).toBe('images/logo.svg');
  });

  it('renders the theme-admin variant class on the shell root', () => {
    const shell = fixture.debugElement.query(By.css('.admin-shell.theme-admin'));
    expect(shell).withContext('admin shell should carry theme-admin class').toBeTruthy();
  });

  it('renders the dark mode toggle button', () => {
    const toggleBtn = fixture.debugElement.query(By.css('button[aria-pressed]'));
    expect(toggleBtn).withContext('dark mode toggle button should exist').toBeTruthy();
  });

  // ── Hover-expand / pin behaviour (regression for #tbd) ─────────────────────

  it('sidebar is NOT expanded by default (hover model: icon rail)', () => {
    const aside = fixture.debugElement.query(By.css('.admin-sidebar'));
    expect(aside.nativeElement.classList.contains('is-expanded'))
      .withContext('sidebar should not be expanded on load')
      .toBeFalse();
  });

  it('shell carries is-sidebar-pinned class when sidebar is pinned', () => {
    const comp = fixture.componentInstance as AdminLayoutComponent & { togglePin: () => void };
    comp.togglePin();
    fixture.detectChanges();
    const shell = fixture.debugElement.query(By.css('.admin-shell'));
    expect(shell.nativeElement.classList.contains('is-sidebar-pinned'))
      .withContext('shell should carry is-sidebar-pinned when pinned')
      .toBeTrue();
  });

  it('renders the pin button inside .admin-sidebar-panel', () => {
    const pinBtn = fixture.debugElement.query(By.css('.admin-sidebar-panel .admin-sidebar-pin'));
    expect(pinBtn).withContext('pin button should exist inside .admin-sidebar-panel').toBeTruthy();
  });

  it('the .admin-collapse-toggle button is absent (replaced by pin)', () => {
    const collapseBtn = fixture.debugElement.query(By.css('.admin-collapse-toggle'));
    expect(collapseBtn).withContext('old collapse toggle must not exist').toBeNull();
  });

  it('togglePin writes "0" to localStorage when pinned', () => {
    const comp = fixture.componentInstance as AdminLayoutComponent & { togglePin: () => void };
    comp.togglePin();
    fixture.detectChanges();
    expect(localStorage.getItem('obrs-sidebar-collapsed'))
      .withContext('localStorage should be "0" when pinned')
      .toBe('0');
  });
});
