import { Component } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../auth/auth.service';

/**
 * OBRS-613. This page used to collect a PHONE number and route to
 * /otp/forget-password/<phone>, where verifying the PIN ran an empty block - so the only
 * "forgot password" link in the product sent a real SMS and then did nothing at all.
 *
 * The backend has only ever offered an EMAIL token flow (OBRS-9:
 * POST /api/auth/password-reset/request -> emailed link -> /password-reset/confirm), so
 * this form now collects an email and calls it.
 */
@Component({
  selector: 'app-forget-password',
  templateUrl: './forget-password.component.html',
  styleUrl: './forget-password.component.scss',
})
export class ForgetPasswordComponent {
  loginForm: FormGroup;

  submitting: boolean = false;
  linkSent: boolean = false;

  constructor(private fb: FormBuilder, private service: AuthService) {
    this.createForm();
  }

  createForm() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
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

  async requestResetLink() {
    this.loginForm.markAllAsTouched();

    if (!this.loginForm.valid || this.submitting) {
      return;
    }

    this.submitting = true;

    try {
      await this.service.forgetPassword({ email: this.getFormValue('email') });
    } catch {
      // Error alert is handled by the global interceptor.
    } finally {
      this.submitting = false;
    }

    // Shown unconditionally, and deliberately. PasswordResetService returns the same
    // message whether or not the address belongs to an account, so that this endpoint
    // cannot be used to test which emails are registered. Branching on the response here
    // would rebuild that oracle in the UI, which is where it would actually be usable.
    this.linkSent = true;
  }
}
