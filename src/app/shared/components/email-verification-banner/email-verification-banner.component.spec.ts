import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { AlertService } from '../../services/alert.service';
import { PendingButtonDirective } from '../../directives/pending-button.directive';
import { EmailVerificationBannerComponent } from './email-verification-banner.component';

/**
 * OBRS-643 AC-2. Every case sets `auth_token`/`auth_email_verified` directly
 * in localStorage BEFORE the component is created, because AuthService reads
 * both into its BehaviorSubjects at construction (`providedIn: 'root'`, so
 * TestBed builds exactly one instance per spec).
 */
describe('EmailVerificationBannerComponent', () => {
  let fixture: ComponentFixture<EmailVerificationBannerComponent>;
  let httpTesting: HttpTestingController;
  let alertService: jasmine.SpyObj<AlertService>;

  function banner(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.email-verify-banner');
  }

  function resendButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('.email-verify-banner__btn');
  }

  async function mount(): Promise<void> {
    alertService = jasmine.createSpyObj('AlertService', ['success', 'error']);

    await TestBed.configureTestingModule({
      declarations: [EmailVerificationBannerComponent, PendingButtonDirective],
      imports: [TranslateModule.forRoot(), RouterTestingModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alertService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EmailVerificationBannerComponent);
    httpTesting = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    httpTesting.verify();
  });

  it('renders nothing for a signed-out visitor, verified or not', async () => {
    localStorage.setItem('auth_email_verified', 'false');
    await mount();

    expect(banner()).toBeNull();
  });

  it('renders nothing for a signed-in, verified account', async () => {
    localStorage.setItem('auth_token', 'tok');
    localStorage.setItem('auth_email_verified', 'true');
    await mount();

    expect(banner()).toBeNull();
  });

  it('renders nothing when the flag is ABSENT - the pre-rollout / Google case', async () => {
    // No auth_email_verified key at all: AuthService.isEmailVerified() reads
    // this as verified, and this is also the shape a Google account's
    // isEmailVerify:true is stored as once the flag IS present ('true'), so a
    // dedicated Google-provider check would only ever duplicate this branch.
    localStorage.setItem('auth_token', 'tok');
    await mount();

    expect(banner()).toBeNull();
  });

  it('shows the banner for a signed-in account with isEmailVerify:false (AC-2)', async () => {
    localStorage.setItem('auth_token', 'tok');
    localStorage.setItem('auth_email_verified', 'false');
    await mount();

    const el = banner();
    expect(el).not.toBeNull();
    expect(el?.getAttribute('role')).toBe('region');
    expect(el?.getAttribute('aria-label')).toBeTruthy();
  });

  it('AC-7: links to /verify-email for someone who never received the mail', async () => {
    localStorage.setItem('auth_token', 'tok');
    localStorage.setItem('auth_email_verified', 'false');
    await mount();

    const link = fixture.nativeElement.querySelector(
      '.email-verify-banner__link'
    ) as HTMLAnchorElement | null;
    expect(link?.getAttribute('routerLink') ?? link?.getAttribute('href')).toContain(
      '/verify-email'
    );
  });

  it('resend calls the resend endpoint with the SIGNED-IN user\'s own email, not a typed one', async () => {
    localStorage.setItem('auth_token', 'tok');
    localStorage.setItem('auth_username', 'rider@example.com');
    localStorage.setItem('auth_email_verified', 'false');
    await mount();

    resendButton()?.click();

    const req = httpTesting.expectOne(
      `${environment.apiUrl}/api/auth/verify-email/resend`
    );
    expect(req.request.body).toEqual({ email: 'rider@example.com' });
    req.flush({ code: 200 });
    await fixture.whenStable();

    expect(alertService.success).toHaveBeenCalled();
  });

  it('a VERIFICATION_ALREADY_VERIFIED resend response flips the flag and the banner removes itself', async () => {
    localStorage.setItem('auth_token', 'tok');
    localStorage.setItem('auth_username', 'rider@example.com');
    localStorage.setItem('auth_email_verified', 'false');
    await mount();

    resendButton()?.click();

    const req = httpTesting.expectOne(
      `${environment.apiUrl}/api/auth/verify-email/resend`
    );
    req.flush(
      { errorCode: 'VERIFICATION_ALREADY_VERIFIED' },
      { status: 409, statusText: 'Conflict' }
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(localStorage.getItem('auth_email_verified')).toBe('true');
    expect(banner()).toBeNull();
  });
});
