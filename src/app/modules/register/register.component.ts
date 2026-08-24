import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';
import {
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
  Subscription,
  switchMap,
} from 'rxjs';
import { UserService } from '../../services/user/user.service';
import { REGISTER_OPTION } from '../../shared/enum/register-option.enum';
import { AlertService } from '../../shared/services/alert.service';
import { Dropdown } from '../../shared/interfaces/dropdown.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { TITLE_OPTIONS } from '../../shared/constants/title-options';
import {
  formatThaiMobile,
  separatorTolerantPattern,
  stripPhoneSeparators,
  THAI_MOBILE_PATTERN,
} from '../../shared/constants/thai-msisdn';

@Component({
    selector: 'app-register',
    templateUrl: './register.component.html',
    styleUrl: './register.component.scss',
    standalone: false
})
export class RegisterComponent implements OnDestroy {
  isShowPassword: boolean = false;
  isShowConfirmPassword: boolean = false;

  // Swaps the form out for the "we emailed you a verification link" panel.
  registrationEmailSent: boolean = false;

  registerForm: FormGroup;

  emailSubscription$?: Subscription;
  phoneNumberSubscription$?: Subscription;

  emailIsExist: boolean = false;
  phoneNumberIsExist: boolean = false;

  titleOptions: Dropdown[] = [...TITLE_OPTIONS];

  constructor(
    private translate: TranslateService,
    private fb: FormBuilder,
    private service: AuthService,
    private alertService: AlertService,
    private usersService: UserService
  ) {
    this.createForm();
  }

  ngOnDestroy(): void {
    if (this.emailSubscription$) this.emailSubscription$.unsubscribe();
    if (this.phoneNumberSubscription$)
      this.phoneNumberSubscription$.unsubscribe();
  }

  createForm() {
    this.registerForm = this.fb.group({
      title: [null],
      firstName: ['', Validators.required],
      middleName: [''],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      // OBRS-409: this field had no pattern at all, while the backend only stores a Thai mobile
      // (OBRS-136/ADR-0079). Submitting produced a 400 — a dead end with no account created and
      // nothing explaining why. Rejecting it here, next to the field, is the difference between a
      // validation message and a trap. (OBRS-605 removed the /otp/register hop that used to be
      // where the 400 surfaced; the column it feeds is unchanged.)
      phoneNumber: ['', [Validators.required, separatorTolerantPattern(THAI_MOBILE_PATTERN)]],
      // OBRS-713: no `username` control. The field was `Validators.required` here while
      // `users` has no such column and `SignUpReqDto` has no such field, so every value
      // typed was discarded on deserialize — and its duplicate-check was a hard-coded
      // `of({ data: false })`, i.e. "always available". Three dead layers, one required box.
      password: ['', Validators.required],
      confirmPassword: ['', Validators.required],
      isPhoneNumberVerify: false,
      preferredLocale: [''],
      pdpaConsent: [false, Validators.requiredTrue],
    });

    this.emailSubscription$ = this.registerForm.get('email')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(value => this.checkDuplicateData(value, REGISTER_OPTION.EMAIL))
      )
      .subscribe();

    this.phoneNumberSubscription$ = this.registerForm.get('phoneNumber')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        // OBRS-691: the control can carry display dashes (regrouped on blur) —
        // the dup-check must see the same bare digits the backend stores.
        switchMap(value => this.checkDuplicateData(stripPhoneSeparators(value), REGISTER_OPTION.PHONENUMBER))
      )
      .subscribe();
  }

  getForm(controlName: string) {
    return this.registerForm.get(controlName);
  }

  getFormValue(controlName: string) {
    return this.registerForm.getRawValue()[controlName];
  }

  // OBRS-691: same focus/blur regrouping idiom as account-page.component.ts's
  // onPhoneFocus/onPhoneBlur — peel dashes off for typing, regroup on blur.
  // The validator and register() below always read the stripped digits.
  onPhoneFocus(): void {
    const control = this.registerForm.get('phoneNumber');
    control?.setValue(stripPhoneSeparators(control.value));
  }

  onPhoneBlur(): void {
    const control = this.registerForm.get('phoneNumber');
    control?.setValue(formatThaiMobile(control.value));
  }

  getFormErrors(controlName: string, errorName: string): boolean {
    const errors = this.registerForm.get(controlName)?.errors;

    if (!errors) {
      return false;
    }

    if (errorName === 'maxLength' && errors['maxlength']) {
      const maxLength = errors['maxlength'].requiredLength;
      const actualLength = errors['maxlength'].actualLength;
      return actualLength > maxLength;
    }

    return !!errors[errorName];
  }

  toggleShowPassword() {
    this.isShowPassword = !this.isShowPassword;
  }

  toggleShowConfirmPassword() {
    this.isShowConfirmPassword = !this.isShowConfirmPassword;
  }

  checkSamePassword() {
    const formValue = this.registerForm.getRawValue();
    const password = formValue.password;
    const confirmPassword = formValue.confirmPassword;

    return password && confirmPassword && password === confirmPassword;
  }

  async register() {
    this.registerForm.markAllAsTouched();

    if (!this.checkSamePassword()) {
      this.alertService.error(
        this.translate.instant('REGISTER.SAME_PASSWORD_VALIDATE')
      );
    }

    if (
      this.registerForm.valid &&
      this.checkSamePassword() &&
      !this.emailIsExist &&
      !this.phoneNumberIsExist
    ) {
      const formValue = this.registerForm.getRawValue();
      const titleCode = this.resolveTitleCode(formValue.title);

      const registerPayload = {
        ...formValue,
        title: titleCode,
        // OBRS-691: the control may carry display dashes (regrouped on blur) —
        // the backend stores/validates bare digits only.
        phoneNumber: stripPhoneSeparators(formValue.phoneNumber),
        preferredLocale: this.translate.currentLang || 'th',
      };

      // OBRS-605: signup posts straight from here. The phone-OTP screen that used to sit
      // between this form and /api/auth/signup proved nothing - the signup body carries no
      // OTP token, and neither /register nor /api/auth/signup is guarded - so it stopped
      // only the users who followed the UI, while billing an SMS for every attempt.
      // ADR-0008 already decided signup requires email verification only.
      try {
        const res = await this.service.register(registerPayload);

        if (res?.code === 201) {
          this.registrationEmailSent = true;
        } else if (typeof res?.code === 'number') {
          this.alertService.error(
            this.translate.instant('REGISTER.REGISTER_FAIL')
          );
        }
      } catch {
        // Error alert is handled by the global interceptor.
      }
    }
  }

  // OBRS-1232: was `englishName || thaiName`, i.e. English won every time and the English label
  // is what got persisted - the whole defect. Now it resolves the option's stable CODE, whichever
  // shape the dropdown handed over (it emits the option object; a reloaded form holds the id).
  private resolveTitleCode(title: unknown): string | null {
    if (typeof title === 'string') {
      const normalized = title.trim();
      return normalized.length > 0 ? normalized : null;
    }

    if (typeof title === 'object' && title !== null) {
      return (title as Dropdown).code?.trim() || null;
    }

    const titleId = Number(title);
    if (!Number.isFinite(titleId)) {
      return null;
    }

    return this.titleOptions.find((item) => item.id === titleId)?.code?.trim() || null;
  }

  async checkDuplicateData(value: string, option: number) {
    if (!value) return;

    let res: ResponseAPI<boolean> | null = null;

    try {
      if (option === REGISTER_OPTION.EMAIL) {
        res = await firstValueFrom(this.usersService.checkExistEmail(value));
      } else if (option === REGISTER_OPTION.PHONENUMBER) {
        res = await firstValueFrom(this.usersService.checkExistPhoneNumber(value));
      }
    } catch {
      return;
    }

    if (res?.code === 200) {
      if (option === REGISTER_OPTION.EMAIL) {
        this.emailIsExist = res.data ?? false;
      } else if (option === REGISTER_OPTION.PHONENUMBER) {
        this.phoneNumberIsExist = res.data ?? false;
      }
    }
  }
}
