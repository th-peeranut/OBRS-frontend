import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ChangeEmailDialogComponent } from './change-email-dialog.component';
import { AuthService } from '../../../../auth/auth.service';
import { UserService } from '../../../../services/user/user.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { createTranslateStub } from '../../../../testing/test-stubs';

describe('ChangeEmailDialogComponent', () => {
  function create(): {
    component: ChangeEmailDialogComponent;
    authServiceStub: {
      requestEmailChange: jasmine.Spy;
      resendEmailChangeVerification: jasmine.Spy;
    };
    userServiceStub: { checkExistEmail: jasmine.Spy };
    alertServiceStub: { success: jasmine.Spy; error: jasmine.Spy };
  } {
    const authServiceStub = {
      requestEmailChange: jasmine.createSpy('requestEmailChange').and.resolveTo({ code: 200, message: 'OK' }),
      resendEmailChangeVerification: jasmine
        .createSpy('resendEmailChangeVerification')
        .and.resolveTo({ code: 200, message: 'OK' }),
    };
    const userServiceStub = {
      checkExistEmail: jasmine.createSpy('checkExistEmail').and.returnValue(of({ code: 200, message: 'OK', data: false })),
    };
    const alertServiceStub = {
      success: jasmine.createSpy('success'),
      error: jasmine.createSpy('error'),
    };

    const component = new ChangeEmailDialogComponent(
      new FormBuilder(),
      authServiceStub as never,
      userServiceStub as never,
      alertServiceStub as never,
      createTranslateStub()
    );
    component.ngOnInit();

    return { component, authServiceStub, userServiceStub, alertServiceStub };
  }

  function fillValidForm(component: ChangeEmailDialogComponent, email = 'new@example.com'): void {
    component.changeEmailForm.get('currentPassword')?.setValue('currentpass1');
    component.changeEmailForm.get('newEmail')?.setValue(email);
  }

  it('should create', () => {
    const { component } = create();
    expect(component).toBeTruthy();
  });

  describe('submit', () => {
    it('calls requestEmailChange with the trimmed form values', async () => {
      const { component, authServiceStub } = create();
      fillValidForm(component);

      await component.submit();

      expect(authServiceStub.requestEmailChange).toHaveBeenCalledWith({
        currentPassword: 'currentpass1',
        newEmail: 'new@example.com',
      });
    });

    it('transitions to the sent state on success', async () => {
      const { component } = create();
      fillValidForm(component);

      await component.submit();

      expect(component.dialogState).toBe('sent');
      expect(component.sentToEmail).toBe('new@example.com');
    });

    it('does not call the API when the form is invalid', async () => {
      const { component, authServiceStub } = create();

      await component.submit();

      expect(authServiceStub.requestEmailChange).not.toHaveBeenCalled();
      expect(component.dialogState).toBe('form');
    });

    it('maps AUTH_ERROR_INVALID_CREDENTIALS to the password field, not a global alert, and does not force a logout', async () => {
      const { component, authServiceStub, alertServiceStub } = create();
      authServiceStub.requestEmailChange.and.rejectWith({
        error: { errorCode: 'AUTH_ERROR_INVALID_CREDENTIALS' },
      });
      fillValidForm(component);

      await component.submit();

      expect(component.passwordErrorKey).toBe('EMAIL_CHANGE.ERROR.INVALID_PASSWORD');
      expect(component.emailErrorKey).toBeNull();
      expect(component.dialogState).toBe('form');
      expect(alertServiceStub.error).not.toHaveBeenCalled();
    });

    it('maps USER_EMAIL_CHANGE_ERROR_EMAIL_CONFLICT to the email field', async () => {
      const { component, authServiceStub, alertServiceStub } = create();
      authServiceStub.requestEmailChange.and.rejectWith({
        error: { errorCode: 'USER_EMAIL_CHANGE_ERROR_EMAIL_CONFLICT' },
      });
      fillValidForm(component);

      await component.submit();

      expect(component.emailErrorKey).toBe('EMAIL_CHANGE.ERROR.EMAIL_CONFLICT');
      expect(component.passwordErrorKey).toBeNull();
      expect(alertServiceStub.error).not.toHaveBeenCalled();
    });

    it('maps USER_EMAIL_CHANGE_ERROR_SAME_EMAIL to the email field', async () => {
      const { component, authServiceStub, alertServiceStub } = create();
      authServiceStub.requestEmailChange.and.rejectWith({
        error: { errorCode: 'USER_EMAIL_CHANGE_ERROR_SAME_EMAIL' },
      });
      fillValidForm(component);

      await component.submit();

      expect(component.emailErrorKey).toBe('EMAIL_CHANGE.ERROR.SAME_EMAIL');
      expect(alertServiceStub.error).not.toHaveBeenCalled();
    });

    it('falls back to a global AlertService.error() for an unmapped errorCode', async () => {
      const { component, authServiceStub, alertServiceStub } = create();
      authServiceStub.requestEmailChange.and.rejectWith({ error: { errorCode: 'SOMETHING_ELSE' } });
      fillValidForm(component);

      await component.submit();

      expect(alertServiceStub.error).toHaveBeenCalledWith('EMAIL_CHANGE.ERROR.GENERIC');
      expect(component.passwordErrorKey).toBeNull();
      expect(component.emailErrorKey).toBeNull();
    });

    it('field errors clear on that control changing again', async () => {
      const { component, authServiceStub } = create();
      authServiceStub.requestEmailChange.and.rejectWith({
        error: { errorCode: 'AUTH_ERROR_INVALID_CREDENTIALS' },
      });
      fillValidForm(component);
      await component.submit();
      expect(component.passwordErrorKey).toBe('EMAIL_CHANGE.ERROR.INVALID_PASSWORD');

      component.changeEmailForm.get('currentPassword')?.setValue('a-new-password');

      expect(component.passwordErrorKey).toBeNull();
    });
  });

  describe('resend', () => {
    it('shows a success alert on success', async () => {
      const { component, alertServiceStub } = create();

      await component.resend();

      expect(alertServiceStub.success).toHaveBeenCalledWith('EMAIL_CHANGE.RESEND_SUCCESS');
    });

    it('maps AUTH_ERROR_RATE_LIMIT_EXCEEDED to a rate-limit alert', async () => {
      const { component, authServiceStub, alertServiceStub } = create();
      authServiceStub.resendEmailChangeVerification.and.rejectWith({
        error: { errorCode: 'AUTH_ERROR_RATE_LIMIT_EXCEEDED' },
      });

      await component.resend();

      expect(alertServiceStub.error).toHaveBeenCalledWith('EMAIL_CHANGE.ERROR.RATE_LIMIT');
    });
  });

  describe('close', () => {
    it('emits closed', () => {
      const { component } = create();
      const spy = jasmine.createSpy('closed');
      component.closed.subscribe(spy);

      component.close();

      expect(spy).toHaveBeenCalled();
    });

    it('Escape closes the dialog', () => {
      const { component } = create();
      const spy = jasmine.createSpy('closed');
      component.closed.subscribe(spy);

      component.onEscape();

      expect(spy).toHaveBeenCalled();
    });
  });
});

/**
 * OBRS-1559. Changing an email address re-asks for the account's EXISTING password, and with no
 * token the manager could not fill it — the user had to go find a password they had already
 * stored. `current-password`, not `new-password`: nothing here sets a password.
 *
 * Rendered rather than constructed, unlike the describes above, because the attribute only
 * exists on a compiled element.
 */
describe('ChangeEmailDialogComponent — password manager autofill tokens (OBRS-1559)', () => {
  let fixture: ComponentFixture<ChangeEmailDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ChangeEmailDialogComponent],
      imports: [ReactiveFormsModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: {} },
        // Nothing is typed into the form here, so the debounced duplicate-check never fires.
        { provide: UserService, useValue: { checkExistEmail: () => of(null) } },
        { provide: AlertService, useValue: {} },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ChangeEmailDialogComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('asks the manager for the saved password of the account being changed', () => {
    const el = (fixture.nativeElement as HTMLElement).querySelector(
      '#change-email-current-password'
    );
    if (!el) {
      throw new Error('Input #change-email-current-password not found in the rendered template');
    }

    expect(el.getAttribute('autocomplete')).toBe('current-password');
  });
});
