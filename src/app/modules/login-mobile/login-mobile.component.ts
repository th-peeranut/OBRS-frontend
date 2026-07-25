import { Component } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { formatThaiMobile, stripPhoneSeparators } from '../../shared/constants/thai-msisdn';

@Component({
  selector: 'app-login-mobile',
  templateUrl: './login-mobile.component.html',
  styleUrl: './login-mobile.component.scss',
})
export class LoginMobileComponent {
  isShowPassword: boolean = false;

  loginForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private router: Router
  ) {
    this.createForm();
  }

  createForm() {
    this.loginForm = this.fb.group({
      phoneNo: ['', Validators.required],
    });
  }

  getForm(controlName: string) {
    return this.loginForm.get(controlName);
  }

  getFormValue(controlName: string) {
    return this.loginForm.getRawValue()[controlName];
  }

  // OBRS-691: display-only grouping — no pattern validator here (LOCKED
  // decision: this field only carries Validators.required), so focus/blur
  // just peel/regroup dashes; goToOTP() below strips before navigating.
  onPhoneFocus(): void {
    const control = this.loginForm.get('phoneNo');
    control?.setValue(stripPhoneSeparators(control.value));
  }

  onPhoneBlur(): void {
    const control = this.loginForm.get('phoneNo');
    control?.setValue(formatThaiMobile(control.value));
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

  async goToOTP() {
    this.loginForm.markAllAsTouched();

    if (this.loginForm.valid) {
      const formValue = this.loginForm.value;
      // OBRS-691: the control may carry display dashes (regrouped on blur) —
      // the OTP/login flow downstream needs the bare digits.
      this.router.navigate(['/otp', 'login', stripPhoneSeparators(formValue.phoneNo)]);
    }
  }
}
