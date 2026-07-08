import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PrimeNGConfig } from 'primeng/api';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';

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
import { AdminApiService } from '../../services/admin/admin-api.service';

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
        {
          provide: AdminApiService,
          useValue: { getNewUsabilityReportCount: () => of(0) },
        },
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
    expect(brandLink.nativeElement.getAttribute('href')).toBe('/');
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

  // ── Always-reserved-column toggle behaviour ─────────────────────────────────

  it('sidebar starts EXPANDED by default (is-sidebar-pinned on shell, no localStorage entry)', () => {
    // Default for new users: expanded 280px reserved column.
    const shell = fixture.debugElement.query(By.css('.admin-shell'));
    expect(shell.nativeElement.classList.contains('is-sidebar-pinned'))
      .withContext('shell should carry is-sidebar-pinned by default (expanded is the default)')
      .toBeTrue();
  });

  it('aside never carries is-expanded class (overlay model removed)', () => {
    // The hover-overlay .is-expanded class must not appear in the always-reserved model.
    const aside = fixture.debugElement.query(By.css('.admin-sidebar'));
    expect(aside.nativeElement.classList.contains('is-expanded'))
      .withContext('is-expanded must not be bound in the always-reserved-column model')
      .toBeFalse();
  });

  it('shell loses is-sidebar-pinned after togglePin collapses the sidebar', () => {
    // Default is expanded → one togglePin call collapses.
    const comp = fixture.componentInstance as AdminLayoutComponent & { togglePin: () => void };
    comp.togglePin();
    fixture.detectChanges();
    const shell = fixture.debugElement.query(By.css('.admin-shell'));
    expect(shell.nativeElement.classList.contains('is-sidebar-pinned'))
      .withContext('shell should lose is-sidebar-pinned when collapsed')
      .toBeFalse();
  });

  it('renders the toggle button inside .admin-sidebar-panel', () => {
    const pinBtn = fixture.debugElement.query(By.css('.admin-sidebar-panel .admin-sidebar-pin'));
    expect(pinBtn).withContext('toggle button should exist inside .admin-sidebar-panel').toBeTruthy();
  });

  it('the .admin-collapse-toggle button is absent (replaced by sidebar-pin toggle)', () => {
    const collapseBtn = fixture.debugElement.query(By.css('.admin-collapse-toggle'));
    expect(collapseBtn).withContext('old collapse toggle must not exist').toBeNull();
  });

  it('togglePin collapses the sidebar and writes "1" to localStorage (default is expanded "0")', () => {
    // On init (no storage entry), readPinPreference canonicalises to "0" (expanded).
    // One togglePin flips to collapsed → writes "1".
    const comp = fixture.componentInstance as AdminLayoutComponent & { togglePin: () => void };
    comp.togglePin(); // expand → collapse
    fixture.detectChanges();
    expect(localStorage.getItem('obrs-sidebar-collapsed'))
      .withContext('localStorage should be "1" when collapsed')
      .toBe('1');
  });

  it('togglePin restores expanded state and writes "0" to localStorage', () => {
    const comp = fixture.componentInstance as AdminLayoutComponent & { togglePin: () => void };
    comp.togglePin(); // collapse
    comp.togglePin(); // re-expand
    fixture.detectChanges();
    expect(localStorage.getItem('obrs-sidebar-collapsed'))
      .withContext('localStorage should be "0" when expanded')
      .toBe('0');
  });
});

// ── Usability Reports nav badge ───────────────────────────────────────────────
// Separate top-level describe (not nested) so its own beforeEach — which needs
// to run entirely inside fakeAsync to deterministically flush the component's
// timer(0, 60_000) initial fetch — does not also inherit/duplicate the outer
// describe's non-fakeAsync beforeEach above.
describe('AdminLayoutComponent — usability report badge', () => {
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
        // Placeholder — each test overrides this with its own count source
        // via TestBed.overrideProvider before creating the component, so the
        // resulting timer(0, ...) subscription is registered inside that
        // test's own fakeAsync zone and can be flushed deterministically.
        { provide: AdminApiService, useValue: { getNewUsabilityReportCount: () => of(0) } },
      ],
    }).compileComponents();
  });

  afterEach(() => { clearSidebarStorage(); });

  function createWithCountSource(
    source: () => Observable<number>
  ): ComponentFixture<AdminLayoutComponent> {
    TestBed.overrideProvider(AdminApiService, {
      useValue: { getNewUsabilityReportCount: jasmine.createSpy('getNewUsabilityReportCount').and.callFake(source) },
    });
    const f = TestBed.createComponent(AdminLayoutComponent);
    f.detectChanges();
    return f;
  }

  it('hides the badge when the fetched count is 0', fakeAsync(() => {
    fixture = createWithCountSource(() => of(0));
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();

    const badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge).withContext('badge should not render when count is 0').toBeNull();
  }));

  it('shows the badge with the fetched numeric count when > 0', fakeAsync(() => {
    fixture = createWithCountSource(() => of(5));
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();

    const badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge).withContext('badge should render when count > 0').toBeTruthy();
    expect(badge.nativeElement.textContent.trim()).toBe('5');
  }));

  it('caps the displayed badge text at "99+" when the count exceeds 99', fakeAsync(() => {
    fixture = createWithCountSource(() => of(150));
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();

    const badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.textContent.trim()).toBe('99+');
  }));

  it('keeps the last known count (does not throw / reset to 0) when a later poll fails', fakeAsync(() => {
    let callCount = 0;
    fixture = createWithCountSource(() => {
      callCount++;
      return callCount === 1 ? of(3) : throwError(() => new Error('network error'));
    });

    tick(); // initial fetch (dueTime 0) succeeds -> count = 3
    fixture.detectChanges();
    let badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.textContent.trim()).toBe('3');

    expect(() => {
      tick(60_000); // next periodic tick fails; must be swallowed, not thrown
    }).not.toThrow();
    fixture.detectChanges();
    discardPeriodicTasks();

    badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge).withContext('previous count should be retained after a failed poll').toBeTruthy();
    expect(badge.nativeElement.textContent.trim())
      .withContext('failed poll must not reset the badge to 0')
      .toBe('3');
  }));
});
