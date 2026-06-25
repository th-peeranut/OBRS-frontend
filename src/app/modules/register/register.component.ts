import {
  Component,
  OnDestroy,
  Renderer2,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';
import { Router } from '@angular/router';
import { LanguageService } from '../../shared/services/language.service';
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

interface LanguageOption {
  code: string;
  endonym: string;
  /** i18n key for the item's aria-label, e.g. HOME.NAVBAR.LANGUAGE_EN */
  ariaKey: string;
}

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements OnDestroy {
  isLangDropdownOpen: boolean = false;
  isShowPassword: boolean = false;
  isShowConfirmPassword: boolean = false;

  currentLanguage: string = 'th';

  /** Static language list — endonyms are intentionally locale-invariant. */
  readonly languages: LanguageOption[] = [
    { code: 'en', endonym: 'English', ariaKey: 'HOME.NAVBAR.LANGUAGE_EN' },
    { code: 'th', endonym: 'ไทย', ariaKey: 'HOME.NAVBAR.LANGUAGE_TH' },
    { code: 'zh', endonym: '中文', ariaKey: 'HOME.NAVBAR.LANGUAGE_ZH' },
  ];

  registerForm: FormGroup;

  private unlistenLangDropdown?: () => void;

  usernameSubscription$?: Subscription;
  emailSubscription$?: Subscription;
  phoneNumberSubscription$?: Subscription;

  usernameIsExist: boolean = false;
  emailIsExist: boolean = false;
  phoneNumberIsExist: boolean = false;

  titleOptions: Dropdown[] = [
    {
      id: 1,
      nameThai: 'นาย',
      nameEnglish: 'Mr.',
      isDefault: true,
    },
    {
      id: 2,
      nameThai: 'นางสาว',
      nameEnglish: 'Miss',
    },
    {
      id: 3,
      nameThai: 'นาง',
      nameEnglish: 'Mrs.',
    },
    {
      id: 4,
      nameThai: 'เด็กชาย',
      nameEnglish: 'Master',
    },
    {
      id: 5,
      nameThai: 'เด็กหญิง',
      nameEnglish: 'Miss (Child)',
    },
    {
      id: 6,
      nameThai: 'ดร.',
      nameEnglish: 'Dr.',
    },
    {
      id: 7,
      nameThai: 'ศ.',
      nameEnglish: 'Professor',
    },
    {
      id: 8,
      nameThai: 'รศ.',
      nameEnglish: 'Associate Professor',
    },
    {
      id: 9,
      nameThai: 'ผศ.',
      nameEnglish: 'Assistant Professor',
    },
  ];

  constructor(
    private translate: TranslateService,
    private languageService: LanguageService,
    private renderer: Renderer2,
    private fb: FormBuilder,
    private service: AuthService,
    private alertService: AlertService,
    private usersService: UserService,
    private router: Router
  ) {
    const currentLanguage = this.translate.currentLang;
    this.switchLanguage(currentLanguage ? currentLanguage : 'th');

    this.createForm();
  }

  ngOnDestroy(): void {
    this.unlistenLangDropdown?.();

    if (this.usernameSubscription$) this.usernameSubscription$.unsubscribe();
    if (this.emailSubscription$) this.emailSubscription$.unsubscribe();
    if (this.phoneNumberSubscription$)
      this.phoneNumberSubscription$.unsubscribe();
  }

  get currentEndonym(): string {
    return (
      this.languages.find((l) => l.code === this.currentLanguage)?.endonym ??
      this.currentLanguage
    );
  }

  createForm() {
    this.registerForm = this.fb.group({
      title: [null, Validators.required],
      firstName: ['', Validators.required],
      middleName: [''],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', [Validators.required]],
      username: ['', Validators.required],
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
        switchMap(value => this.checkDuplicateData(value, REGISTER_OPTION.PHONENUMBER))
      )
      .subscribe();

    this.usernameSubscription$ = this.registerForm.get('username')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(value => this.checkDuplicateData(value, REGISTER_OPTION.USERNAME))
      )
      .subscribe();
  }

  getForm(controlName: string) {
    return this.registerForm.get(controlName);
  }

  getFormValue(controlName: string) {
    return this.registerForm.getRawValue()[controlName];
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

  switchLanguage(lang: string) {
    this.currentLanguage = lang;
    void this.languageService.switch(lang);
  }

  selectLanguage(lang: string) {
    this.switchLanguage(lang);
    this.closeLangDropdown();
  }

  toggleLangDropdown() {
    this.isLangDropdownOpen = !this.isLangDropdownOpen;

    if (this.isLangDropdownOpen) {
      this.unlistenLangDropdown?.();
      this.unlistenLangDropdown = this.renderer.listen('document', 'click', (event: Event) =>
        this.handleLangDropdownOutsideClick(event)
      );
    } else {
      this.closeLangDropdown();
    }
  }

  closeLangDropdown() {
    this.isLangDropdownOpen = false;
    this.unlistenLangDropdown?.();
    this.unlistenLangDropdown = undefined;
  }

  handleLangDropdownOutsideClick(event: Event) {
    const targetElement = event.target as HTMLElement;
    // Match by class (mirrors the navbar switcher) so a click anywhere on the
    // trigger counts as inside; anything else closes the menu.
    const clickedTriggerButton = !!targetElement.closest('.navbar-lang-dropdown');

    if (clickedTriggerButton) {
      this.isLangDropdownOpen = true;
    } else {
      this.closeLangDropdown();
    }
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
      this.alertService.error('พบข้อผิดพลาด กรุณากรอกรหัสผ่านให้เหมือนกัน');
    }

    if (
      this.registerForm.valid &&
      this.checkSamePassword() &&
      !this.usernameIsExist &&
      !this.emailIsExist &&
      !this.phoneNumberIsExist
    ) {
      const formValue = this.registerForm.getRawValue();
      const titleName = this.resolveTitleName(formValue.title);

      const registerPayload = {
        ...formValue,
        title: titleName,
        preferredLocale: this.translate.currentLang || this.currentLanguage,
      };

      this.service.setRegisterValue(registerPayload);

      this.router.navigate(['/otp', 'register', registerPayload.phoneNumber]);
    }
  }

  private resolveTitleName(title: unknown): string | null {
    if (typeof title === 'string') {
      const normalized = title.trim();
      return normalized.length > 0 ? normalized : null;
    }

    if (typeof title === 'object' && title !== null) {
      const option = title as Dropdown;
      const englishName = option.nameEnglish?.trim();
      const thaiName = option.nameThai?.trim();
      return englishName || thaiName || null;
    }

    const titleId = Number(title);
    if (!Number.isFinite(titleId)) {
      return null;
    }

    const option = this.titleOptions.find((item) => item.id === titleId);
    if (!option) {
      return null;
    }

    const englishName = option.nameEnglish?.trim();
    const thaiName = option.nameThai?.trim();
    return englishName || thaiName || null;
  }

  async checkDuplicateData(value: string, option: number) {
    if (!value) return;

    let res: ResponseAPI<boolean> | null = null;

    try {
      if (option === REGISTER_OPTION.USERNAME) {
        res = await firstValueFrom(this.usersService.checkExistUsername(value));
      } else if (option === REGISTER_OPTION.EMAIL) {
        res = await firstValueFrom(this.usersService.checkExistEmail(value));
      } else if (option === REGISTER_OPTION.PHONENUMBER) {
        res = await firstValueFrom(this.usersService.checkExistPhoneNumber(value));
      }
    } catch {
      return;
    }

    if (res?.code === 200) {
      if (option === REGISTER_OPTION.USERNAME) {
        this.usernameIsExist = res.data ?? false;
      } else if (option === REGISTER_OPTION.EMAIL) {
        this.emailIsExist = res.data ?? false;
      } else if (option === REGISTER_OPTION.PHONENUMBER) {
        this.phoneNumberIsExist = res.data ?? false;
      }
    }
  }
}
