import { FormBuilder } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { CloseAccountDialogComponent } from './close-account-dialog.component';

describe('CloseAccountDialogComponent (OBRS-632, PDPA ม.33)', () => {
  const PHRASE = 'ปิดบัญชี';

  function create(overrides: Record<string, unknown> = {}) {
    const myAccountServiceStub = {
      closeAccount: jasmine
        .createSpy('closeAccount')
        .and.returnValue(of({ code: 200, message: 'OK' })),
      ...overrides,
    };
    const authServiceStub = { logout: jasmine.createSpy('logout') };
    const alertServiceStub = {
      success: jasmine.createSpy('success'),
      error: jasmine.createSpy('error'),
    };
    const translateStub = {
      instant: (key: string) => (key === 'ACCOUNT.CLOSE_CONFIRM_PHRASE' ? PHRASE : key),
    };

    const component = new CloseAccountDialogComponent(
      new FormBuilder(),
      myAccountServiceStub as never,
      authServiceStub as never,
      alertServiceStub as never,
      translateStub as never
    );

    return { component, myAccountServiceStub, authServiceStub, alertServiceStub };
  }

  it('should create', () => {
    const { component } = create();
    expect(component).toBeTruthy();
  });

  it('uses the TRANSLATED confirmation phrase, so a Thai reader is not asked to type English', () => {
    const { component } = create();
    expect(component.confirmPhrase).toBe(PHRASE);
  });

  it('refuses to submit until the confirmation phrase matches exactly', () => {
    const { component, myAccountServiceStub } = create();

    component.confirmForm.patchValue({ confirmation: 'ปิด' });
    component.submit();

    expect(component.isPhraseCorrect).toBe(false);
    expect(myAccountServiceStub.closeAccount).not.toHaveBeenCalled();
  });

  it('accepts the phrase with surrounding whitespace', () => {
    const { component } = create();

    component.confirmForm.patchValue({ confirmation: `  ${PHRASE} ` });

    expect(component.isPhraseCorrect).toBe(true);
  });

  it('calls DELETE /users/me and then clears the session', () => {
    const { component, myAccountServiceStub, authServiceStub, alertServiceStub } = create();
    component.confirmForm.patchValue({ confirmation: PHRASE });

    component.submit();

    expect(myAccountServiceStub.closeAccount).toHaveBeenCalled();
    expect(alertServiceStub.success).toHaveBeenCalledWith('ACCOUNT.CLOSE_SUCCESS');
    // Not cosmetic: the JWT subject stops resolving the moment the account is anonymised, so a
    // retained token leaves a logged-in-looking shell whose every request 401s.
    expect(authServiceStub.logout).toHaveBeenCalled();
  });

  it('keeps the session when the close fails', () => {
    const { component, authServiceStub, alertServiceStub } = create({
      closeAccount: jasmine
        .createSpy('closeAccount')
        .and.returnValue(throwError(() => ({ status: 500, error: {} }))),
    });
    component.confirmForm.patchValue({ confirmation: PHRASE });

    component.submit();

    expect(alertServiceStub.error).toHaveBeenCalledWith('ACCOUNT.CLOSE_ERROR_GENERIC');
    expect(authServiceStub.logout).not.toHaveBeenCalled();
    expect(component.isSubmitting).toBe(false);
  });

  it('names the already-closed conflict rather than reporting a generic failure', () => {
    const { component, alertServiceStub } = create({
      closeAccount: jasmine.createSpy('closeAccount').and.returnValue(
        throwError(() => ({ error: { errorCode: 'USER_CLOSE_ERROR_ALREADY_CLOSED' } }))
      ),
    });
    component.confirmForm.patchValue({ confirmation: PHRASE });

    component.submit();

    expect(alertServiceStub.error).toHaveBeenCalledWith('ACCOUNT.CLOSE_ERROR_ALREADY_CLOSED');
  });

  it('does not fire a second request while one is in flight', () => {
    const { component, myAccountServiceStub } = create();
    component.confirmForm.patchValue({ confirmation: PHRASE });
    component.isSubmitting = true;

    component.submit();

    expect(myAccountServiceStub.closeAccount).not.toHaveBeenCalled();
  });
});
