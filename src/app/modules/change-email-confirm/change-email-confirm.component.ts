import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

export type ChangeEmailConfirmState = 'confirming' | 'success' | 'invalid' | 'targetTaken';

const AUTO_REDIRECT_DELAY_MS = 3000;

/**
 * Public confirmation landing page for the change-email verification link
 * (OBRS-84). Mirrors `VerifyEmailComponent`'s spinner + state-machine shape
 * (read `?token=` from the route, `ProgressSpinnerModule` while confirming).
 * No guard — opened logged-out or with a stale token straight from the
 * emailed link. See docs/adr/0014-account-identity-settings-page.md.
 */
@Component({
    selector: 'app-change-email-confirm',
    templateUrl: './change-email-confirm.component.html',
    styleUrl: './change-email-confirm.component.scss',
    standalone: false
})
export class ChangeEmailConfirmComponent implements OnInit, OnDestroy {
  confirmState: ChangeEmailConfirmState = 'confirming';
  newEmail: string | null = null;

  private redirectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly authService: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token || !token.trim()) {
      // No token at all — same neutral fallback as an invalid/expired one
      // (a public link the user may have mangled or arrived at directly).
      this.confirmState = 'invalid';
      return;
    }

    try {
      const res = await this.authService.confirmEmailChange({ token });

      if (res?.code === 200) {
        this.newEmail = res?.data?.newEmail ?? null;
        this.confirmState = 'success';
        // The old JWT stops authenticating once the backend confirms the
        // change — clear it now so a stale token doesn't 401 with a
        // confusing toast on whatever the user does next.
        this.authService.clearAuthData();
        this.redirectTimer = setTimeout(() => this.navigateToLogin(), AUTO_REDIRECT_DELAY_MS);
      } else {
        this.confirmState = 'invalid';
      }
    } catch (err: unknown) {
      const errorCode = (err as { error?: { errorCode?: string } })?.error?.errorCode;

      if (errorCode === 'AUTH_ERROR_EMAIL_CHANGE_TARGET_TAKEN') {
        this.confirmState = 'targetTaken';
      } else {
        // AUTH_ERROR_EMAIL_CHANGE_TOKEN_INVALID (and any other/unknown
        // error) fall back to the same NEUTRAL "already used or expired"
        // state — this link may legitimately be clicked twice, so it must
        // never read as a scary red error by default.
        this.confirmState = 'invalid';
      }
    }
  }

  ngOnDestroy(): void {
    if (this.redirectTimer !== null) {
      clearTimeout(this.redirectTimer);
    }
  }

  navigateToLogin(): void {
    const queryParams: Record<string, string> = { reason: 'email-changed' };
    if (this.newEmail) {
      queryParams['email'] = this.newEmail;
    }
    void this.router.navigate(['/login'], { queryParams });
  }
}
