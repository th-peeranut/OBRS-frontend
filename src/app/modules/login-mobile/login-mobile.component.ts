import { Component } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

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
      this.router.navigate(['/otp', 'login', formValue.phoneNo]);
    }
  }
}
