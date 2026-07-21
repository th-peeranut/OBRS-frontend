import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

export type ResetPasswordState = 'form' | 'success' | 'noToken';

// Mirrors PasswordResetEmailConfirmReqDto: 8-128 chars with at least one lower, one
// upper and one digit. Duplicated here on purpose - the server still enforces it, this
// only spares the user a round trip - so if the two ever drift the server wins and the
// user sees its message rather than a silently weaker rule being accepted.
export const RESET_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

/**
 * OBRS-613. The backend has emailed a link to `${app.frontend-url}/reset-password?token=`
 * since OBRS-9, and this route did not exist - the link fell through to the `**`
 * wildcard and redirected to the home page. Nothing in the product could complete a
 * password reset.
 *
 * Shape follows ChangeEmailConfirmComponent: public route, token read from `?token=`,
 * a small state machine, no guard (the link is opened logged out).
 */
@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  state: ResetPasswordState = 'form';

  resetForm: FormGroup;

  submitting: boolean = false;
  isShowPassword: boolean = false;
  isShowConfirmPassword: boolean = false;

  /** Set when the backend rejects the token or the password; an i18n key, never a literal. */
  errorKey: string | null = null;

  private token: string | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly service: AuthService
  ) {
    this.createForm();
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');

    if (!this.token || !this.token.trim()) {
      this.state = 'noToken';
    }
  }

  createForm() {
    this.resetForm = this.fb.group({
      newPassword: [
        '',
        [Validators.required, Validators.pattern(RESET_PASSWORD_PATTERN)],
      ],
      confirmPassword: ['', Validators.required],
    });
  }

  getForm(controlName: string) {
    return this.resetForm.get(controlName);
  }

  getFormErrors(controlName: string, errorName: string): boolean {
    return !!this.resetForm.get(controlName)?.errors?.[errorName];
  }

  passwordsMatch(): boolean {
    const { newPassword, confirmPassword } = this.resetForm.getRawValue();
    return !!newPassword && newPassword === confirmPassword;
  }

  toggleShowPassword() {
    this.isShowPassword = !this.isShowPassword;
  }

  toggleShowConfirmPassword() {
    this.isShowConfirmPassword = !this.isShowConfirmPassword;
  }

  async submit() {
    this.resetForm.markAllAsTouched();
    this.errorKey = null;

    // The token check belongs here, not only in the template. The template hides the form
    // in the 'noToken' state, but that is a rendering decision - guarding on it would mean
    // the only thing stopping a POST with an empty token is an *ngIf.
    if (
      !this.token ||
      !this.resetForm.valid ||
      !this.passwordsMatch() ||
      this.submitting
    ) {
      return;
    }

    this.submitting = true;

    try {
      const res = await this.service.confirmPasswordReset({
        token: this.token,
        newPassword: this.resetForm.getRawValue().newPassword,
      });

      if (res?.code === 200) {
        this.state = 'success';
      } else {
        this.errorKey = 'RESET_PASSWORD.ERROR.GENERIC';
      }
    } catch {
      // A reset link is single-use and expires, so "invalid or already used" is the
      // ordinary case here rather than an exceptional one, and gets a plain message
      // with a way forward instead of the global interceptor's red toast.
      this.errorKey = 'RESET_PASSWORD.ERROR.TOKEN_INVALID';
    } finally {
      this.submitting = false;
    }
  }

  navigateToLogin(): void {
    void this.router.navigate(['/login']);
  }
}
