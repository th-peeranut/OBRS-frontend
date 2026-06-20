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

  it('renders a navbar link back to the public home page', () => {
    // Regression for #16: the staff shell had no UI path to /home.
    // Per #20 that path is now the brand logo itself.
    const homeLink = fixture.debugElement.query(By.css('a[href="/home"]'));
    expect(homeLink).withContext('home link should exist').toBeTruthy();
  });

  it('renders the brand as the logo image linking to /home', () => {
    // Regression for #20: the brand logo is the home navigation (links to
    // /home), replacing the separate Home button. (Supersedes #19's /staff
    // destination per the user request.)
    const logo = fixture.debugElement.query(
      By.css('a.navbar-brand[href="/home"] img.staff-brand-logo'),
    );
    expect(logo).withContext('brand logo image should exist').toBeTruthy();
    expect(logo.nativeElement.getAttribute('src')).toBe('images/logo.svg');
  });

  it('has no separate Home button in the navbar menu', () => {
    // Regression for #20: home navigation lives on the brand logo only; the
    // dedicated Home nav-item must be gone.
    const menuHomeLink = fixture.debugElement.query(
      By.css('ul.navbar-nav a[href="/home"]'),
    );
    expect(menuHomeLink)
      .withContext('separate Home menu link should be removed')
      .toBeNull();
  });
});
