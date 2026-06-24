import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PrimeNGConfig } from 'primeng/api';

import { StaffLayoutComponent } from './staff-layout.component';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';

describe('StaffLayoutComponent', () => {
  let fixture: ComponentFixture<StaffLayoutComponent>;

  const authStub = {
    getUsername: () => 'staff@obrs.test',
    hasAnyRole: () => false,
    logout: jasmine.createSpy('logout'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StaffLayoutComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNGConfig, useValue: { setTranslation: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StaffLayoutComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders a link back to the public home page', () => {
    // Regression for #16: the staff shell must always provide a UI path to /home.
    // Per #20 that path is the brand logo itself.
    const homeLink = fixture.debugElement.query(By.css('a[href="/home"]'));
    expect(homeLink).withContext('home link should exist').toBeTruthy();
  });

  it('renders the brand as the logo image linking to /home', () => {
    // Regression for #20: the brand logo is the home navigation (links to
    // /home), replacing the separate Home button.
    // After the staff-shell restructure the brand lives inside .admin-brand
    // (shared shell); the link uses .admin-brand-link and the logo .admin-brand-logo.
    const logo = fixture.debugElement.query(
      By.css('a.admin-brand-link[href="/home"] img.admin-brand-logo'),
    );
    expect(logo).withContext('brand logo image should exist').toBeTruthy();
    expect(logo.nativeElement.getAttribute('src')).toBe('images/logo.svg');
  });

  it('has no separate Home button in the nav menu', () => {
    // Regression for #20: home navigation lives on the brand logo only; the
    // dedicated Home nav-item must not exist inside the .admin-nav list.
    const menuHomeLink = fixture.debugElement.query(
      By.css('.admin-nav a[href="/home"]'),
    );
    expect(menuHomeLink)
      .withContext('separate Home menu link should be removed')
      .toBeNull();
  });

  it('renders nav icons with the bound material-symbols-outlined class', () => {
    // Regression for #31: the staff portal must use .material-symbols-outlined
    // (the webfont class loaded by the app), not the legacy .material-icons class.
    const original = authStub.hasAnyRole;
    authStub.hasAnyRole = () => true; // salesperson + driver → nav items render
    try {
      const f = TestBed.createComponent(StaffLayoutComponent);
      f.detectChanges();

      const boundIcons = f.debugElement.queryAll(
        By.css('.admin-nav-link span.material-symbols-outlined'),
      );
      expect(boundIcons.length)
        .withContext('nav icons should use the bound material-symbols-outlined class')
        .toBeGreaterThan(0);

      const legacyIcons = f.debugElement.queryAll(
        By.css('.admin-nav-link span.material-icons'),
      );
      expect(legacyIcons.length)
        .withContext('unbound legacy material-icons class must not be used')
        .toBe(0);
    } finally {
      authStub.hasAnyRole = original; // never leak the mutated stub into later specs
    }
  });
});
