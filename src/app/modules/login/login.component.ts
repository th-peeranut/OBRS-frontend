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
    this.renderGoogleButton();

    // SPIKE (OBRS-90): GIS bakes button locale from the gsi/client script's `hl`
    // at load time. Instead of a full page reload on language change, re-inject
    // the gsi/client script with the new `hl` and re-render the button in place.
    this.langChangeSubscription = this.translate.onLangChange.subscribe((e) => {
      this.reloadGisForLanguage(e.lang);
    });
  }

  private renderGoogleButton(): void {
    const container = document.getElementById('google-signin-btn-container');
    if (!container) return;
    container.innerHTML = '';

    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: this.handleGoogleCredential.bind(this),
    });

    // GIS expects a pixel width (max 400), not a percentage — passing '100%'
    // logs "Provided button width is invalid" and is ignored. Measure the
    // container and clamp to GIS's 400px max so the button spans the card.
    const containerWidth = Math.round(container.getBoundingClientRect().width);
    const buttonWidth = Math.min(containerWidth || 400, 400);
    google.accounts.id.renderButton(container, {
      type: 'standard',
      shape: 'pill',
      theme: 'outline',
      size: 'large',
      width: String(buttonWidth),
    });
  }

  private reloadGisForLanguage(lang: string): void {
    // Drop the current gsi/client script + global so a fresh `hl` load
    // re-localizes the button, then re-render once it's ready. GIS logs a
    // benign "initialize() is called multiple times" notice on the re-render
    // (it keeps the last instance, which is what we want) — an acceptable
    // trade for not doing a jarring full-page reload that drops form state.
    document
      .querySelectorAll('script[src*="gsi/client"]')
      .forEach((s) => s.remove());
    (window as unknown as Record<string, unknown>)['google'] = undefined;

    const s = document.createElement('script');
    s.src =
      'https://accounts.google.com/gsi/client?hl=' + encodeURIComponent(lang);
    s.async = true;
    s.defer = true;
    s.onload = () => this.renderGoogleButton();
    document.head.appendChild(s);
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
          void this.service.navigateAfterLogin();
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
        await this.service.navigateAfterLogin();
      } else if (typeof res?.code === 'number') {
        this.alertService.error(this.translate.instant('LOGIN.LOGIN_FAIL'));
      }
    }
  }
}
