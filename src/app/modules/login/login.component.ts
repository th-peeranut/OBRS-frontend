import {
  Component,
  OnDestroy,
  Renderer2,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';
import { LanguageService } from '../../shared/services/language.service';
import { AlertService } from '../../shared/services/alert.service';

interface LanguageOption {
  code: string;
  endonym: string;
  /** i18n key for the item's aria-label, e.g. HOME.NAVBAR.LANGUAGE_EN */
  ariaKey: string;
}

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnDestroy {
  isLangDropdownOpen: boolean = false;
  isShowPassword: boolean = false;

  currentLanguage: string = 'th';

  /** Static language list — endonyms are intentionally locale-invariant. */
  readonly languages: LanguageOption[] = [
    { code: 'en', endonym: 'English', ariaKey: 'HOME.NAVBAR.LANGUAGE_EN' },
    { code: 'th', endonym: 'ไทย', ariaKey: 'HOME.NAVBAR.LANGUAGE_TH' },
    { code: 'zh', endonym: '中文', ariaKey: 'HOME.NAVBAR.LANGUAGE_ZH' },
  ];

  loginForm: FormGroup;

  private unlistenLangDropdown?: () => void;

  constructor(
    private translate: TranslateService,
    private languageService: LanguageService,
    private renderer: Renderer2,
    private fb: FormBuilder,
    private service: AuthService,
    private alertService: AlertService,
  ) {
    const currentLanguage = this.translate.currentLang;
    this.switchLanguage(currentLanguage ? currentLanguage : 'th');

    this.createForm();
  }

  ngOnDestroy(): void {
    this.unlistenLangDropdown?.();
  }

  get currentEndonym(): string {
    return (
      this.languages.find((l) => l.code === this.currentLanguage)?.endonym ??
      this.currentLanguage
    );
  }

  createForm() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
  }

  getForm(controlName: string) {
    return this.loginForm.get(controlName);
  }

  getFormValue(controlName: string) {
    return this.loginForm.getRawValue()[controlName];
  }

  getFormErrors(controlName: string, errorName: string): boolean {
    const errors = this.loginForm.get(controlName)?.errors;

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

  async login() {
    this.loginForm.markAllAsTouched();

    if (this.loginForm.valid) {
      const payload = this.loginForm.value;
      const res = await this.service.login(payload);

      if (res?.code === 200) {
        this.alertService.success(
          this.translate.instant('LOGIN.LOGIN_SUCCESS')
        );
        await this.service.navigateAfterLogin('/home');
      } else if (typeof res?.code === 'number') {
        this.alertService.error(this.translate.instant('LOGIN.LOGIN_FAIL'));
      }
    }
  }
}
