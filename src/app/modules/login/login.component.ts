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
    standalone: false
})
export class LoginComponent implements OnInit, AfterViewInit, OnDestroy {
  isShowPassword: boolean = false;
  isGoogleLoading: boolean = false;

  loginForm: FormGroup;
  pdpaGoogleConsent = new FormControl(false);

  // OBRS-84: shown when landing here right after a confirmed email change
  // (`?reason=email-changed`, optionally `&email=` to prefill the field).
  showEmailChangedBanner = false;

  /**
   * OBRS-719: every gsi/client tag this component has put in the document. One
   * selector, used by the load, the language re-load and the teardown alike —
   * three places that must agree on what "the GIS script" means, or teardown
   * silently leaves Google's script in a document that later routes reuse.
   */
  private static readonly GIS_SCRIPT_SELECTOR = 'script[src*="gsi/client"]';

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
    // OBRS-719 (PCI DSS 6.4.3): this page fetches Google Identity itself. It used to
    // arrive from an inline <script> in index.html, which put it on EVERY route — the
    // payment page included, where every script has to be justified in writing — and
    // forced `script-src 'unsafe-inline'` into the CSP to allow the block at all.
    //
    // Nothing new had to be invented for this: reloadGisForLanguage() below has injected
    // the same script since OBRS-90, so `onload` is a proven readiness signal here. That
    // is also why the ~10 s polling loop this replaced is gone — it existed only because
    // the load was started somewhere this component could not observe.
    this.loadGisScript(this.currentLang(), () => this.initGis());
  }

  ngOnDestroy(): void {
    this.langChangeSubscription?.unsubscribe();
    this.themeChangeSubscription?.unsubscribe();

    // Leave the document as this page found it. Honest about what this does and does
    // not buy: removing the tag and the global stops any LATER route from being a page
    // that fetched Google's script, which is the claim the payment-page inventory
    // makes. It cannot unload code that has already executed — a customer who visits
    // /login and then navigates within the same SPA session still carries the GIS
    // runtime. A cold entry to /payment, which is the normal path, does not.
    this.removeGisScript();
  }

  /** The `hl` GIS is loaded with. Same value LanguageService persists, read through the
   * service that owns it rather than out of localStorage behind its back. */
  private currentLang(): string {
    return this.translate.currentLang || this.translate.getDefaultLang() || 'th';
  }

  /**
   * Drops any existing gsi/client tag and the `google` global, then injects a fresh one
   * for `lang`. Dropping first is not tidiness: GIS bakes the button's locale in at load
   * time from this URL's `hl`, so re-localizing means genuinely re-loading it.
   */
  private loadGisScript(lang: string, onReady: () => void): void {
    this.removeGisScript();

    const s = document.createElement('script');
    s.src =
      'https://accounts.google.com/gsi/client?hl=' + encodeURIComponent(lang);
    s.async = true;
    s.defer = true;
    s.onload = onReady;
    document.head.appendChild(s);
  }

  private removeGisScript(): void {
    document
      .querySelectorAll(LoginComponent.GIS_SCRIPT_SELECTOR)
      .forEach((s) => s.remove());
    (window as unknown as Record<string, unknown>)['google'] = undefined;
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
    // Re-load with the new `hl`, then re-render once it's ready. GIS logs a benign
    // "initialize() is called multiple times" notice on the re-render (it keeps the
    // last instance, which is what we want) — an acceptable trade for not doing a
    // jarring full-page reload that drops form state.
    this.loadGisScript(lang, () => this.renderGoogleButton());
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
