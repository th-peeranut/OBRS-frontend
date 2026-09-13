import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { combineLatest, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../services/alert.service';

/**
 * OBRS-643 AC-2 — the persistent nag while a signed-in customer's email is
 * unverified.
 *
 * Mounted directly in home.component.html and my-bookings.component.html —
 * NOT in app.component.html like the PDPA consent bar / booking-closed
 * notice — because AC-2 names exactly those two pages, not every customer
 * route, and there is no route-scope predicate to reuse that already draws
 * that boundary.
 *
 * Renders nothing for a signed-out visitor, a verified account, OR an
 * ABSENT flag. "Absent" is a deliberate read, not a bug: see
 * `AuthService.isEmailVerified()` for why the backend deploy that adds the
 * flag being behind the frontend one must not accuse every signed-in
 * customer of an unverified email. A Google account always carries
 * `isEmailVerify: true` from signup (`SocialAuthService`), so AC-8 falls out
 * of the flag alone — this component deliberately holds no auth-provider
 * check of its own; a second copy of that decision is how the two could end
 * up disagreeing.
 */
@Component({
  selector: 'app-email-verification-banner',
  templateUrl: './email-verification-banner.component.html',
  styleUrl: './email-verification-banner.component.scss',
  standalone: false,
})
export class EmailVerificationBannerComponent {
  protected readonly isVisible$: Observable<boolean>;
  protected isResendLoading = false;

  constructor(
    private readonly authService: AuthService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.isVisible$ = combineLatest([
      this.authService.authStatus$,
      this.authService.emailVerified$,
    ]).pipe(map(([authed, verified]) => authed && !verified));
  }

  protected async resend(): Promise<void> {
    const email = this.authService.getUsername();
    if (!email || this.isResendLoading) {
      return;
    }

    this.isResendLoading = true;
    try {
      const res = await this.authService.resendVerification({ email });
      if (res?.code === 200) {
        this.alertService.success(
          this.translate.instant('EMAIL_VERIFY_BANNER.RESEND_SUCCESS')
        );
      }
    } catch (err: unknown) {
      const errorCode = (err as { error?: { errorCode?: string } })?.error
        ?.errorCode;
      if (errorCode === 'VERIFICATION_ALREADY_VERIFIED') {
        // The stored flag is stale — this session already complied (e.g. in
        // another tab). markEmailVerified() flips emailVerified$, so this
        // banner removes itself as soon as this resolves.
        this.authService.markEmailVerified();
        this.alertService.success(
          this.translate.instant('EMAIL_VERIFY_BANNER.ALREADY_VERIFIED')
        );
      } else if (errorCode === 'RESEND_RATE_LIMITED') {
        this.alertService.error(
          this.translate.instant('EMAIL_VERIFY_BANNER.ERROR.RATE_LIMITED')
        );
      } else {
        this.alertService.error(
          this.translate.instant('EMAIL_VERIFY_BANNER.ERROR.GENERIC')
        );
      }
    } finally {
      this.isResendLoading = false;
    }
  }
}
