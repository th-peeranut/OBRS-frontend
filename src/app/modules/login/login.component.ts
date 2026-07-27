import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { ThemeMode, ThemeService } from '../../shared/services/theme.service';
import { environment } from '../../../environments/environment';

/**
 * The two GIS button themes this page uses. `outline` is white with a grey
 * border — right on the light card, a block of pure white on the dark one
 * (measured at 1.37:1 by the OBRS-584 contrast gate, which then skipped it as
 * "third-party": right about the markup, wrong about the ownership, since WE
 * pass this option). `filled_black` is Google's own dark-surface variant.
 *
 * Measured, because the obvious story is wrong: GIS draws the button as REAL
 * DOM in our own document (`div[role="button"].nsm7Bb-…`, computed background
 * `rgb(32,33,36)` in this theme) — the iframe it also injects is a 0×0 bridge,
 * not the button. So our CSS could technically reach it. The reason not to is
 * that every class on it is a Google BUILD HASH, so a stylesheet targeting it
 * silently stops applying on their next release and nothing goes red. Passing
 * `theme` is the supported lever and the only one that cannot rot.
 */
type GisButtonTheme = 'outline' | 'filled_black';

function themeFor(mode: ThemeMode): GisButtonTheme {
  return mode === 'dark' ? 'filled_black' : 'outline';
}

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit, AfterViewInit, OnDestroy {
  isShowPassword: boolean = false;
  isGoogleLoading: boolean = false;

  loginForm: FormGroup;
  pdpaGoogleConsent = new FormControl(false);

  // OBRS-84: shown when landing here right after a confirmed email change
  // (`?reason=email-changed`, optionally `&email=` to prefill the field).
  showEmailChangedBanner = false;

  private gisReadyInterval: ReturnType<typeof setInterval> | null = null;
  private readonly GIS_POLL_MAX_TRIES = 100; // ~10 s at 100 ms intervals
  private langChangeSubscription?: Subscription;
  private themeChangeSubscription?: Subscription;

  /** Theme the NEXT render will use; kept in sync with `ThemeService.mode$`. */
  private gisTheme: GisButtonTheme = 'outline';
  /** Theme the button on screen was actually drawn with — null until drawn. */
  private renderedGisTheme: GisButtonTheme | null = null;

  constructor(
    private translate: TranslateService,
    private fb: FormBuilder,
    private service: AuthService,
    private alertService: AlertService,
    private route: ActivatedRoute,
    private themeService: ThemeService,
  ) {
    this.createForm();
  }

  ngOnInit(): void {
    const reason = this.route.snapshot.queryParamMap.get('reason');
    const email = this.route.snapshot.queryParamMap.get('email');

    if (reason === 'email-changed') {
      this.showEmailChangedBanner = true;

      if (email) {
        this.loginForm.get('email')?.setValue(email);
      }
    }
  }

  ngAfterViewInit(): void {
    let tries = 0;
    this.gisReadyInterval = setInterval(() => {
      tries++;

      if (this.isGisLoaded()) {
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
    this.themeChangeSubscription?.unsubscribe();
  }

  private clearGisReadyInterval(): void {
    if (this.gisReadyInterval !== null) {
      clearInterval(this.gisReadyInterval);
      this.gisReadyInterval = null;
    }
  }

  private initGis(): void {
    // OBRS-778: subscribe BEFORE the first render. `mode$` is a BehaviorSubject
    // stream, so this fires synchronously with the current mode and `gisTheme`
    // is correct by the time renderGoogleButton() reads it — no first-paint
    // flash of the wrong button, and no wasted re-render either (the guard
    // below sees renderedGisTheme === null and skips).
    this.themeChangeSubscription = this.themeService.mode$.subscribe((mode) => {
      this.gisTheme = themeFor(mode);
      // `theme` is read once, at renderButton() time — it is NOT reactive. A
      // theme toggle while sitting on /login therefore has to redraw the
      // button, or the dark page keeps the white light-mode one.
      if (
        this.renderedGisTheme !== null &&
        this.renderedGisTheme !== this.gisTheme
      ) {
        this.renderGoogleButton();
      }
    });

    this.renderGoogleButton();

    // SPIKE (OBRS-90): GIS bakes button locale from the gsi/client script's `hl`
    // at load time. Instead of a full page reload on language change, re-inject
    // the gsi/client script with the new `hl` and re-render the button in place.
    this.langChangeSubscription = this.translate.onLangChange.subscribe((e) => {
      this.reloadGisForLanguage(e.lang);
    });
  }

  private isGisLoaded(): boolean {
    return !!(
      (window as unknown as Record<string, unknown>)['google'] as
        | { accounts?: { id?: unknown } }
        | undefined
    )?.accounts?.id;
  }

  private renderGoogleButton(): void {
    // GIS is not always there when a redraw is asked for. reloadGisForLanguage()
    // deliberately drops the script and the global, and a theme toggle landing
    // inside that window would otherwise throw on `google.accounts`. Bailing is
    // safe: `renderedGisTheme` stays untouched, and the script's onload renders
    // with whatever theme is current by then.
    if (!this.isGisLoaded()) return;

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
      theme: this.gisTheme,
      size: 'large',
      width: String(buttonWidth),
    });
    // Recorded AFTER the call, so a throw leaves it at the last theme actually
    // on screen rather than claiming one that was never drawn. Also makes the
    // language re-render (OBRS-90) inherit the current theme for free.
    this.renderedGisTheme = this.gisTheme;
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
