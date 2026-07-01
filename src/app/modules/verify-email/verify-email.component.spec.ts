import { FormBuilder } from '@angular/forms';
import { VerifyEmailComponent } from './verify-email.component';
import { createTranslateStub, createRouterStub } from '../../testing/test-stubs';

describe('VerifyEmailComponent', () => {
  let component: VerifyEmailComponent;

  const routeStub = {
    snapshot: {
      queryParamMap: {
        get: (_key: string) => null,
      },
    },
  };

  const authServiceStub = {
    verifyEmail: () => Promise.resolve({ code: 200, message: 'ok' }),
    resendVerification: () => Promise.resolve({ code: 200, message: 'ok' }),
  };

  const alertServiceStub = {
    success: () => void 0,
    error: () => void 0,
  };

  beforeEach(() => {
    component = new VerifyEmailComponent(
      routeStub as never,
      createRouterStub(),
      new FormBuilder(),
      authServiceStub as never,
      alertServiceStub as never,
      createTranslateStub(),
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set verifyState to failed when token is missing', async () => {
    await component.ngOnInit();
    expect(component.verifyState).toBe('failed');
    expect(component.errorMessageKey).toBe('VERIFY_EMAIL.ERROR.TOKEN_MISSING');
  });

  it('should not call resend API when form is invalid', async () => {
    spyOn(authServiceStub, 'resendVerification').and.callThrough();
    await component.resend();
    expect(authServiceStub.resendVerification).not.toHaveBeenCalled();
  });
});
