import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';

import { LoginComponent } from './login.component';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
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
});
