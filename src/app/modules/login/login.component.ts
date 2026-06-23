import {
  Component,
  ElementRef,
  OnDestroy,
  Renderer2,
  ViewChild,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';
import { LanguageService } from '../../shared/services/language.service';
import { AlertService } from '../../shared/services/alert.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnDestroy {
  isDropdownOpen: boolean = false;
  isShowPassword: boolean = false;

  currentLanguage: string = 'th';

  loginForm: FormGroup;

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

  private unlistenDropdown?: () => void;

  constructor(
    private translate: TranslateService,
    private languageService: LanguageService,
    private renderer: Renderer2,
    private elementRef: ElementRef,
    private fb: FormBuilder,
    private service: AuthService,
    private alertService: AlertService,
  ) {
    const currentLanguage = this.translate.currentLang;
    this.switchLanguage(currentLanguage ? currentLanguage : 'th');

    this.createForm();
  }

  ngOnDestroy(): void {
    this.unlistenDropdown?.();
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
    this.isDropdownOpen = false;
    this.currentLanguage = lang;
    void this.languageService.switch(lang);
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;

    if (this.isDropdownOpen) {
      this.unlistenDropdown?.();
      this.unlistenDropdown = this.renderer.listen('document', 'click', (event: Event) =>
        this.handleOutsideClick(event)
      );
    } else {
      this.unlistenDropdown?.();
      this.unlistenDropdown = undefined;
    }
  }

  handleOutsideClick(event: Event) {
    const targetElement = event.target as HTMLElement;
    const clickedInsideDropdown =
      this.elementRef.nativeElement.contains(targetElement);
    const clickedDropdownButton =
      this.dropdownButton.nativeElement.contains(targetElement);

    if (clickedInsideDropdown && clickedDropdownButton) {
      this.isDropdownOpen = true;
    } else {
      this.isDropdownOpen = false;
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
