import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';

import { RegisterComponent } from './register.component';
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { UserService } from '../../services/user/user.service';
import { createTranslateStub } from '../../testing/test-stubs';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let authStub: { register: jasmine.Spy };
  let alertStub: { error: jasmine.Spy };

  const fillValidForm = () => {
    component.createForm();
    component.registerForm.patchValue({
      title: 'นาย',
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      email: 'somchai@example.com',
      phoneNumber: '0812345678',
      password: 'Passw0rd!23',
      confirmPassword: 'Passw0rd!23',
      pdpaConsent: true,
    });
  };

  beforeEach(() => {
    authStub = {
      register: jasmine
        .createSpy('register')
        .and.returnValue(Promise.resolve({ code: 201 })),
    };
    alertStub = { error: jasmine.createSpy('error') };

    component = new RegisterComponent(
      createTranslateStub(),
      new FormBuilder(),
      authStub as never,
      alertStub as never,
      {} as never
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /**
   * OBRS-605. Submitting used to stash the whole form (plaintext password included) in
   * sessionStorage and route to /otp/register/<phone>; signup was posted only after the OTP
   * screen said 200. That gate proved nothing - the signup body carries no OTP token and
   * neither route is guarded - so it stopped only the users who followed the UI while
   * billing an SMS per attempt. ADR-0008 requires email verification only.
   *
   * These fail if the OTP detour is ever reintroduced: the component no longer holds a
   * Router at all, so a navigate() call would not compile, and register() must be posted
   * from here.
   */
  describe('signup posts directly, with no phone-OTP detour (OBRS-605)', () => {
    it('calls the signup API itself when the form is valid', async () => {
      fillValidForm();

      await component.register();

      expect(authStub.register).toHaveBeenCalledTimes(1);
      const sent = authStub.register.calls.mostRecent().args[0];
      expect(sent.email).toBe('somchai@example.com');
      expect(sent.phoneNumber).toBe('0812345678');
      // Nothing OTP-shaped is sent, because the backend has no field for it.
      expect(sent.token).toBeUndefined();
      expect(sent.pin).toBeUndefined();
    });

    it('shows the email-verification panel on 201', async () => {
      fillValidForm();

      await component.register();

      expect(component.registrationEmailSent).toBeTrue();
    });

    it('leaves nothing in sessionStorage - the form never crosses a page boundary', async () => {
      sessionStorage.clear();
      fillValidForm();

      await component.register();

      // 'register_value' held the plaintext password for as long as the OTP screen was up.
      expect(sessionStorage.getItem('register_value')).toBeNull();
      expect(sessionStorage.length).toBe(0);
    });

    it('alerts instead of claiming success when the backend rejects the signup', async () => {
      authStub.register.and.returnValue(Promise.resolve({ code: 400 }));
      fillValidForm();

      await component.register();

      expect(component.registrationEmailSent).toBeFalse();
      expect(alertStub.error).toHaveBeenCalledWith('REGISTER.REGISTER_FAIL');
    });

    it('does not post at all when the form is invalid', async () => {
      component.createForm();

      await component.register();

      expect(authStub.register).not.toHaveBeenCalled();
    });
  });

  /**
   * OBRS-713. `username` was a required control on this form while the `users` table has no
   * such column and `SignUpReqDto` no such field — so the value was discarded on deserialize
   * — and its duplicate-check was `of({ data: false })`, i.e. hard-coded "available".
   *
   * These fail before the removal: `fillValidForm()` above no longer supplies a username, so
   * with the required control still in place the form is invalid and register() posts nothing.
   * They also guard the removal's real hazard — `!this.usernameIsExist` was one of the four
   * conditions gating register(), so deleting the field carelessly breaks signup silently.
   */
  describe('no username field (OBRS-713)', () => {
    it('has no username control on the register form', () => {
      component.createForm();

      expect(component.registerForm.contains('username')).toBeFalse();
    });

    it('is valid, and posts, with every remaining field filled and no username', async () => {
      fillValidForm();

      expect(component.registerForm.valid).toBeTrue();

      await component.register();

      expect(authStub.register).toHaveBeenCalledTimes(1);
    });

    it('sends no username in the signup payload', async () => {
      fillValidForm();

      await component.register();

      expect(authStub.register.calls.mostRecent().args[0].username).toBeUndefined();
    });
  });

  /**
   * OBRS-409. The field had `Validators.required` only, while the backend stores a Thai mobile
   * only (OBRS-136/ADR-0079) - so a non-mobile number passed the form and died at the signup
   * call with a 400 and no account created. Each case below fails without the pattern this card
   * added. (The 400 used to come from /otp/register/<phone>; OBRS-605 removed that hop, but the
   * field still feeds a Thai-mobile-only column.)
   */
  describe('phoneNumber Thai-mobile pattern (OBRS-409)', () => {
    const phone = () => {
      component.createForm();
      return component.registerForm.get('phoneNumber')!;
    };

    it('accepts the three real Thai mobile prefixes', () => {
      const control = phone();
      for (const valid of ['0612345678', '0812345678', '0912345678']) {
        control.setValue(valid);
        expect(control.valid).withContext(valid).toBeTrue();
      }
    });

    it('rejects a landline, a wrong length, and the 66 wire spelling', () => {
      const control = phone();
      // 02 is a Bangkok landline: 10 digits, starts with 0, and cannot receive an OTP. It is
      // exactly what the looser /^0\d{9}$/ used by the booking forms lets through.
      for (const invalid of ['0212345678', '1234567890', '081234567', '08123456789']) {
        control.setValue(invalid);
        expect(control.hasError('pattern')).withContext(invalid).toBeTrue();
      }
      // The backend accepts 66... on the wire but stores the local form; this field deliberately
      // only offers the spelling a Thai user actually types.
      control.setValue('66812345678');
      expect(control.hasError('pattern')).toBeTrue();
    });

    it('reports an empty field as required, NOT as a bad pattern', () => {
      // The template keys its two messages off these specific errors. Before OBRS-409 a single
      // block rendered PHONE_NO_REQUIRED for any error at all, so adding a pattern without
      // splitting them would have told someone who typed 0212345678 to "enter a phone number".
      const control = phone();
      control.setValue('');
      expect(control.hasError('required')).toBeTrue();
      expect(control.hasError('pattern')).toBeFalse();
    });

    it('reports a filled-but-invalid field as a bad pattern, NOT as required', () => {
      const control = phone();
      control.setValue('0212345678');
      expect(control.hasError('pattern')).toBeTrue();
      expect(control.hasError('required')).toBeFalse();
    });
  });
});

/**
 * OBRS-628 AC-1. Signup is where PDPA consent is actually collected, and the box
 * offered no way to read what was being consented to: grepping the whole app for
 * `privacy-policy` found exactly one hit, the home-page footer, which /register
 * does not render. PDPA ม.19 wants the purpose stated plainly and reachable at
 * the moment consent is given.
 *
 * Rendered rather than asserted on the class, because the defect lives entirely
 * in the template — the component would look identical either way.
 */
describe('RegisterComponent — PDPA consent links to the notice (OBRS-628)', () => {
  let fixture: ComponentFixture<RegisterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RegisterComponent],
      imports: [
        ReactiveFormsModule,
        RouterTestingModule,
        TranslateModule.forRoot(),
        // Real, not stubbed: it is the ControlValueAccessor behind
        // formControlName="title", so CUSTOM_ELEMENTS_SCHEMA alone gets NG01203.
        DropdownObrsComponent,
      ],
      providers: [
        // Nothing is typed into the form here, so the debounced duplicate-check
        // streams never reach these.
        { provide: AuthService, useValue: {} },
        { provide: AlertService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
      // app-theme-toggle / app-lang-switcher / app-dropdown-obrs have their own specs.
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  function link(): HTMLAnchorElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(
      'a[data-testid="pdpa-privacy-policy-link"]'
    );
  }

  it('renders a link to /privacy-policy beside the consent checkbox', () => {
    const anchor = link();
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('href')).toBe('/privacy-policy');
  });

  it('sits inside the same block as the consent checkbox, not adrift on the page', () => {
    const block = link()?.closest('.form-check');
    expect(block?.querySelector('#pdpaConsent')).toBeTruthy();
  });

  it('opens in a new tab so the half-filled signup form is not destroyed', () => {
    // The whole point of the new tab: an in-tab routerLink would tear down a form
    // the user may have spent a minute on. rel is asserted with it because
    // target="_blank" alone hands the opened page a handle back into this one.
    expect(link()?.getAttribute('target')).toBe('_blank');
    expect(link()?.getAttribute('rel')).toContain('noopener');
  });
});
