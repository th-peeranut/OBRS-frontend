import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../services/alert.service';
import { PendingButtonDirective } from '../../directives/pending-button.directive';
import { EmailVerifyBlockModalComponent } from './email-verify-block-modal.component';

/**
 * OBRS-643 AC-3 — the modal both `เลือก` (schedule-booking-list) and
 * `ยืนยันข้อมูล` (review-schedule-booking-total) show instead of navigating
 * while the signed-in customer's email is unverified.
 */
describe('EmailVerifyBlockModalComponent', () => {
  let fixture: ComponentFixture<EmailVerifyBlockModalComponent>;
  let httpTesting: HttpTestingController;
  let alertService: jasmine.SpyObj<AlertService>;

  function modal(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.evb-modal');
  }

  function resendButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('.evb-modal .btn-primary');
  }

  function cancelButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('.evb-modal .btn-secondary');
  }

  async function mount(): Promise<void> {
    alertService = jasmine.createSpyObj('AlertService', ['success', 'error']);
    localStorage.setItem('auth_username', 'rider@example.com');

    await TestBed.configureTestingModule({
      declarations: [EmailVerifyBlockModalComponent, PendingButtonDirective],
      imports: [TranslateModule.forRoot(), RouterTestingModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alertService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EmailVerifyBlockModalComponent);
    httpTesting = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    httpTesting.verify();
  });

  it('renders nothing while isOpen is false', async () => {
    await mount();
    fixture.componentInstance.isOpen = false;
    fixture.detectChanges();

    expect(modal()).toBeNull();
  });

  it('renders the reason AND the remedy while isOpen is true (AC-3)', async () => {
    await mount();
    fixture.componentInstance.isOpen = true;
    fixture.detectChanges();

    const el = modal();
    expect(el).not.toBeNull();
    expect(el?.getAttribute('role')).toBe('dialog');
    expect(el?.querySelector('.evb-modal__title')?.textContent).toBeTruthy();
    expect(el?.querySelector('.evb-modal__body')?.textContent).toBeTruthy();
    // The remedy: a resend action AND a link to /verify-email (AC-7), not a
    // dead end.
    expect(resendButton()).not.toBeNull();
    const link = el?.querySelector('.evb-modal__link') as HTMLAnchorElement | null;
    expect(link?.getAttribute('routerLink') ?? link?.getAttribute('href')).toContain(
      '/verify-email'
    );
  });

  it('the cancel button emits closed without calling the resend endpoint', async () => {
    await mount();
    fixture.componentInstance.isOpen = true;
    fixture.detectChanges();
    const closed = spyOn(fixture.componentInstance.closed, 'emit');

    cancelButton()?.click();

    expect(closed).toHaveBeenCalled();
    httpTesting.expectNone(`${environment.apiUrl}/api/auth/verify-email/resend`);
  });

  it('resend posts the SIGNED-IN user\'s own email (AuthService.getUsername), not a typed one', async () => {
    await mount();
    fixture.componentInstance.isOpen = true;
    fixture.detectChanges();

    resendButton()?.click();

    const req = httpTesting.expectOne(
      `${environment.apiUrl}/api/auth/verify-email/resend`
    );
    expect(req.request.body).toEqual({ email: 'rider@example.com' });
    req.flush({ code: 200 });
    await fixture.whenStable();

    expect(alertService.success).toHaveBeenCalled();
  });

  it('VERIFICATION_ALREADY_VERIFIED marks the account verified and closes the modal instead of leaving the customer stuck', async () => {
    await mount();
    const authService = TestBed.inject(AuthService);
    fixture.componentInstance.isOpen = true;
    fixture.detectChanges();
    const closed = spyOn(fixture.componentInstance.closed, 'emit');

    resendButton()?.click();

    const req = httpTesting.expectOne(
      `${environment.apiUrl}/api/auth/verify-email/resend`
    );
    req.flush(
      { errorCode: 'VERIFICATION_ALREADY_VERIFIED' },
      { status: 409, statusText: 'Conflict' }
    );
    await fixture.whenStable();

    expect(authService.isEmailVerified()).toBeTrue();
    expect(closed).toHaveBeenCalled();
  });
});
