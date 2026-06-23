import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PrimeNGConfig } from 'primeng/api';

import { AdminLayoutComponent } from './admin-layout.component';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';

describe('AdminLayoutComponent', () => {
  let fixture: ComponentFixture<AdminLayoutComponent>;

  const authStub = {
    getUsername: () => 'admin@obrs.test',
    logout: jasmine.createSpy('logout'),
    hasAnyRole: (_roles: string[]) => false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AdminLayoutComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNGConfig, useValue: { setTranslation: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminLayoutComponent);
    fixture.detectChanges();
  });

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
});
