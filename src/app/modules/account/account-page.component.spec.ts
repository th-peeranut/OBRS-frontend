import { FormBuilder } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { AccountPageComponent } from './account-page.component';
import { MyAccountProfile } from '../../shared/interfaces/my-account.interface';
import { PRIVACY_POLICY_VERSION } from '../privacy-policy/privacy-policy.version';

describe('AccountPageComponent', () => {
  function profileOf(overrides: Partial<MyAccountProfile> = {}): MyAccountProfile {
    return {
      id: 1,
      title: 'นาย',
      firstName: 'สมชาย',
      middleName: null,
      lastName: 'ใจดี',
      email: 'user@example.com',
      phoneNumber: '0811111111',
      preferredLocale: 'th',
      pdpaConsentVersion: PRIVACY_POLICY_VERSION,
      ...overrides,
    };
  }

  function create(
    username: string | null,
    myAccountOverrides: Record<string, unknown> = {}
  ) {
    const authServiceStub = { getUsername: () => username };
    const myAccountServiceStub = {
      getProfile: jasmine.createSpy('getProfile').and.returnValue(
        of({ code: 200, message: 'OK', data: profileOf() })
      ),
      updateProfile: jasmine
        .createSpy('updateProfile')
        .and.returnValue(of({ code: 200, message: 'OK' })),
      acceptCurrentPrivacyPolicy: jasmine
        .createSpy('acceptCurrentPrivacyPolicy')
        .and.returnValue(of({ code: 200, message: 'OK' })),
      // The real implementation, not a stubbed boolean — the whole point of the banner is that
      // this predicate is right, so a spy returning `true` would test nothing.
      needsReConsent: (p: MyAccountProfile | null) =>
        !!p && p.pdpaConsentVersion !== PRIVACY_POLICY_VERSION,
      ...myAccountOverrides,
    };
    const alertServiceStub = {
      success: jasmine.createSpy('success'),
      error: jasmine.createSpy('error'),
    };
    const translateStub = { instant: (key: string) => key };

    const component = new AccountPageComponent(
      new FormBuilder(),
      authServiceStub as never,
      myAccountServiceStub as never,
      alertServiceStub as never,
      translateStub as never
    );

    return { component, myAccountServiceStub, alertServiceStub };
  }

  // OBRS-1232: same dropdown swap as the admin user form, same risk. This customer's row may hold
  // a value the migration could not map to a code (the field was free text for months); a select
  // with no matching option would show blank and the next Save would silently drop it.
  describe('title dropdown (OBRS-1232)', () => {
    it('offers no extra option when the stored title is one of the nine codes', () => {
      const { component } = create('user@example.com', {
        getProfile: jasmine.createSpy('getProfile').and.returnValue(
          of({ code: 200, message: 'OK', data: profileOf({ title: 'MR' }) })
        ),
      });

      component.ngOnInit();

      expect((component as any).legacyTitleValue).toBeNull();
      expect(component.profileForm.get('title')!.value).toBe('MR');
    });

    it('keeps an unmappable legacy value as its own option, so a Save cannot drop it', () => {
      const { component } = create('user@example.com', {
        getProfile: jasmine.createSpy('getProfile').and.returnValue(
          of({ code: 200, message: 'OK', data: profileOf({ title: 'คุณ' }) })
        ),
      });

      component.ngOnInit();

      expect((component as any).legacyTitleValue).toBe('คุณ');
      expect(component.profileForm.get('title')!.value).toBe('คุณ');
    });

    it('accepts a blank title - length no longer rules a control the customer cannot type into', () => {
      const { component } = create('user@example.com');
      component.ngOnInit();

      const ctrl = component.profileForm.get('title')!;
      ctrl.setValue('');
      expect(ctrl.valid).toBeTrue();
    });
  });

  it('should create', () => {
    const { component } = create('user@example.com');
    expect(component).toBeTruthy();
  });

  it('reads the current login email from AuthService on init (no new GET for the email)', () => {
    const { component } = create('user@example.com');

    component.ngOnInit();

    expect(component.currentEmail).toBe('user@example.com');
  });

  it('starts with the change-email dialog closed', () => {
    const { component } = create('user@example.com');
    expect(component.isChangeEmailDialogOpen).toBe(false);
  });

  it('opens the change-email dialog', () => {
    const { component } = create('user@example.com');

    component.openChangeEmailDialog();

    expect(component.isChangeEmailDialogOpen).toBe(true);
  });

  it('closes the change-email dialog', () => {
    const { component } = create('user@example.com');
    component.openChangeEmailDialog();

    component.closeChangeEmailDialog();

    expect(component.isChangeEmailDialogOpen).toBe(false);
  });

  // ── OBRS-632 ────────────────────────────────────────────────────────────────

  it('loads the profile on init and fills the edit form from it (PDPA ม.35-36)', () => {
    const { component, myAccountServiceStub } = create('user@example.com');

    component.ngOnInit();

    expect(myAccountServiceStub.getProfile).toHaveBeenCalled();
    expect(component.isProfileLoading).toBe(false);
    expect(component.profileForm.value.firstName).toBe('สมชาย');
    // OBRS-646: the field carries the grouped display form; the stored value is 0811111111.
    expect(component.profileForm.value.phoneNumber).toBe('081-111-1111');
  });

  it('shows a retry state rather than a blank card when the profile GET fails', () => {
    const { component } = create('user@example.com', {
      getProfile: jasmine
        .createSpy('getProfile')
        .and.returnValue(throwError(() => ({ status: 500 }))),
    });

    component.ngOnInit();

    expect(component.isProfileLoadFailed).toBe(true);
    expect(component.isProfileLoading).toBe(false);
  });

  it('sends the corrected name and phone to PUT /users/me', () => {
    const { component, myAccountServiceStub } = create('user@example.com');
    component.ngOnInit();
    component.startEditingProfile();
    component.profileForm.patchValue({ firstName: 'สมหญิง', phoneNumber: '0822222222' });

    component.saveProfile();

    expect(myAccountServiceStub.updateProfile).toHaveBeenCalledWith(
      jasmine.objectContaining({ firstName: 'สมหญิง', phoneNumber: '0822222222' })
    );
    expect(component.isProfileEditing).toBe(false);
  });

  it('sends an emptied middle name as null, not as an empty string the backend would reject', () => {
    const { component, myAccountServiceStub } = create('user@example.com', {
      getProfile: jasmine.createSpy('getProfile').and.returnValue(
        of({ code: 200, message: 'OK', data: profileOf({ middleName: 'กลาง' }) })
      ),
    });
    component.ngOnInit();
    component.startEditingProfile();
    component.profileForm.patchValue({ middleName: '' });

    component.saveProfile();

    expect(myAccountServiceStub.updateProfile).toHaveBeenCalledWith(
      jasmine.objectContaining({ middleName: null })
    );
  });

  it('does not call the API when the form is invalid', () => {
    const { component, myAccountServiceStub } = create('user@example.com');
    component.ngOnInit();
    component.startEditingProfile();
    component.profileForm.patchValue({ phoneNumber: 'not-a-number' });

    component.saveProfile();

    expect(myAccountServiceStub.updateProfile).not.toHaveBeenCalled();
  });

  it('names the phone-conflict error specifically instead of the generic one', () => {
    const { component, alertServiceStub } = create('user@example.com', {
      updateProfile: jasmine.createSpy('updateProfile').and.returnValue(
        throwError(() => ({ error: { errorCode: 'USER_UPDATE_ERROR_PHONE_CONFLICT' } }))
      ),
    });
    component.ngOnInit();
    component.startEditingProfile();

    component.saveProfile();

    expect(alertServiceStub.error).toHaveBeenCalledWith(
      'ACCOUNT.PROFILE_SAVE_ERROR_PHONE_CONFLICT'
    );
  });

  it('hides the re-consent banner when the recorded version is the one this build serves', () => {
    const { component } = create('user@example.com');

    component.ngOnInit();

    expect(component.needsReConsent).toBe(false);
  });

  it('shows the re-consent banner when the recorded version is older (PDPA ม.19)', () => {
    const { component } = create('user@example.com', {
      getProfile: jasmine.createSpy('getProfile').and.returnValue(
        of({ code: 200, message: 'OK', data: profileOf({ pdpaConsentVersion: '0.9' }) })
      ),
    });

    component.ngOnInit();

    expect(component.needsReConsent).toBe(true);
  });

  it('shows the re-consent banner for an account that consented before versioning existed', () => {
    const { component } = create('user@example.com', {
      getProfile: jasmine.createSpy('getProfile').and.returnValue(
        of({ code: 200, message: 'OK', data: profileOf({ pdpaConsentVersion: null }) })
      ),
    });

    component.ngOnInit();

    expect(component.needsReConsent).toBe(true);
  });

  it('records re-consent and re-reads the profile so the banner clears', () => {
    const { component, myAccountServiceStub } = create('user@example.com', {
      getProfile: jasmine.createSpy('getProfile').and.returnValues(
        of({ code: 200, message: 'OK', data: profileOf({ pdpaConsentVersion: '0.9' }) }),
        of({ code: 200, message: 'OK', data: profileOf() })
      ),
    });
    component.ngOnInit();
    expect(component.needsReConsent).toBe(true);

    component.acceptCurrentPolicy();

    expect(myAccountServiceStub.acceptCurrentPrivacyPolicy).toHaveBeenCalled();
    expect(component.needsReConsent).toBe(false);
  });

  it('starts with the close-account dialog closed and opens it on demand', () => {
    const { component } = create('user@example.com');

    expect(component.isCloseAccountDialogOpen).toBe(false);
    component.openCloseAccountDialog();
    expect(component.isCloseAccountDialogOpen).toBe(true);
    component.closeCloseAccountDialog();
    expect(component.isCloseAccountDialogOpen).toBe(false);
  });

  // ── OBRS-646 AC-7: phone validation must be no weaker than signup ─────────────
  // Signup accepts only a real Thai mobile (THAI_MOBILE_PATTERN = 0[689]XXXXXXXX). Before this card
  // the /account form used the backend DTO's looser `\d{10,15}`, which accepted numbers signup
  // rejects. These pin the tightened rule (must-catch) without over-rejecting a real mobile.
  describe('phone validation is no weaker than signup (AC-7)', () => {
    it('rejects a Bangkok landline that the old \\d{10,15} rule accepted', () => {
      const { component } = create('user@example.com');
      component.profileForm.get('phoneNumber')?.setValue('0212345678');
      expect(component.profileForm.get('phoneNumber')?.valid).toBe(false);
    });

    it('rejects a 15-digit international number that the old rule accepted', () => {
      const { component } = create('user@example.com');
      component.profileForm.get('phoneNumber')?.setValue('123456789012345');
      expect(component.profileForm.get('phoneNumber')?.valid).toBe(false);
    });

    it('accepts a valid Thai mobile (0[689]XXXXXXXX), same as signup', () => {
      const { component } = create('user@example.com');
      component.profileForm.get('phoneNumber')?.setValue('0812345678');
      expect(component.profileForm.get('phoneNumber')?.valid).toBe(true);
    });
  });

  // ── OBRS-646: readability dashes never weaken validation nor reach the backend ─
  describe('phone display grouping (080-000-0000)', () => {
    it('accepts the grouped form — the validator judges the digits, not the dashes', () => {
      const { component } = create('user@example.com');
      component.profileForm.get('phoneNumber')?.setValue('081-234-5678');
      expect(component.profileForm.get('phoneNumber')?.valid).toBe(true);
    });

    it('still rejects a grouped landline (stricter-than-signup would be a bug too)', () => {
      const { component } = create('user@example.com');
      component.profileForm.get('phoneNumber')?.setValue('021-234-5678');
      expect(component.profileForm.get('phoneNumber')?.valid).toBe(false);
    });

    it('strips the dashes before PUT so the backend gets canonical digits', () => {
      const { component, myAccountServiceStub } = create('user@example.com');
      component.ngOnInit();
      component.startEditingProfile();
      component.profileForm.patchValue({ phoneNumber: '089-999-9999' });

      component.saveProfile();

      expect(myAccountServiceStub.updateProfile).toHaveBeenCalledWith(
        jasmine.objectContaining({ phoneNumber: '0899999999' })
      );
    });

    it('regroups on blur and peels the dashes off on focus', () => {
      const { component } = create('user@example.com');
      const control = component.profileForm.get('phoneNumber');

      control?.setValue('0812345678');
      component.onPhoneBlur();
      expect(control?.value).toBe('081-234-5678');

      component.onPhoneFocus();
      expect(control?.value).toBe('0812345678');
    });
  });
});
