import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements AfterViewInit, OnDestroy {
  isShowPassword: boolean = false;
  isGoogleLoading: boolean = false;

  loginForm: FormGroup;
  pdpaGoogleConsent = new FormControl(false);

  private gisReadyInterval: ReturnType<typeof setInterval> | null = null;
  private readonly GIS_POLL_MAX_TRIES = 100; // ~10 s at 100 ms intervals
  private langChangeSubscription?: Subscription;

  constructor(
    private translate: TranslateService,
    private fb: FormBuilder,
    private service: AuthService,
    private alertService: AlertService,
  ) {
    this.createForm();
  }

  ngAfterViewInit(): void {
    let tries = 0;
    this.gisReadyInterval = setInterval(() => {
      tries++;
      const isLoaded = !!(
        (window as unknown as Record<string, unknown>)['google'] as
          | { accounts?: { id?: unknown } }
          | undefined
      )?.accounts?.id;

      if (isLoaded) {
        this.clearGisReadyInterval();
        this.initGis();
      } else if (tries >= this.GIS_POLL_MAX_TRIES) {
        this.clearGisReadyInterval();
      }
    }, 100);
  }

  ngOnDestroy(): void {
    this.clearGisReadyInterval();
    this.langChangeSubscription?.unsubscribe();
  }

  private clearGisReadyInterval(): void {
    if (this.gisReadyInterval !== null) {
      clearInterval(this.gisReadyInterval);
      this.gisReadyInterval = null;
    }
  }

  private initGis(): void {
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

    // GIS bakes its rendered button's language into the gsi/client script it already
    // loaded (see index.html) - there's no supported way to re-localize an already-
    // rendered button in place, so a live language switch needs a full reload to pick
    // up the new `hl` on the next script load.
    this.langChangeSubscription = this.translate.onLangChange.subscribe(() => {
      window.location.reload();
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
