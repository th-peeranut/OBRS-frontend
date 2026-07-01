import { AfterViewInit, Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements AfterViewInit {
  isShowPassword: boolean = false;
  isGoogleLoading: boolean = false;

  loginForm: FormGroup;
  pdpaGoogleConsent = new FormControl(false);

  constructor(
    private translate: TranslateService,
    private fb: FormBuilder,
    private service: AuthService,
    private alertService: AlertService,
  ) {
    this.createForm();
  }

  ngAfterViewInit(): void {
    const container = document.getElementById('google-signin-btn-container');
    if (!container) return;

    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: this.handleGoogleCredential.bind(this),
    });

    google.accounts.id.renderButton(container, {
      type: 'standard',
      shape: 'pill',
      theme: 'outline',
      size: 'large',
      width: '100%',
    });
  }

  handleGoogleCredential(response: { credential: string }): void {
    if (!this.pdpaGoogleConsent.value) {
      this.pdpaGoogleConsent.markAsTouched();
      return;
    }

    this.isGoogleLoading = true;
    this.service
      .loginWithGoogle({
        idToken: response.credential,
        pdpaConsent: !!this.pdpaGoogleConsent.value,
      })
      .then((res) => {
        this.isGoogleLoading = false;
        if (res?.code === 200) {
          this.alertService.success(
            this.translate.instant('LOGIN.LOGIN_SUCCESS')
          );
          void this.service.navigateAfterLogin('/home');
        }
      })
      .catch((err: unknown) => {
        this.isGoogleLoading = false;
        const errorCode = (err as { error?: { errorCode?: string } })?.error
          ?.errorCode;
        if (errorCode === 'GOOGLE_TOKEN_INVALID') {
          this.alertService.error(
            this.translate.instant('LOGIN.ERROR.GOOGLE_TOKEN_INVALID')
          );
        } else if (errorCode === 'ACCOUNT_DISABLED') {
          this.alertService.error(
            this.translate.instant('LOGIN.ERROR.ACCOUNT_DISABLED')
          );
        } else {
          this.alertService.error(
            this.translate.instant('LOGIN.ERROR.GENERIC')
          );
        }
      });
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
