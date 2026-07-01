import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';

export function trimmedRequiredValidator(
  control: AbstractControl
): ValidationErrors | null {
  return control.value?.trim() ? null : { required: true };
}

@Component({
  selector: 'app-verify-email',
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.scss',
})
export class VerifyEmailComponent implements OnInit, OnDestroy {
  verifyState: 'verifying' | 'success' | 'failed' = 'verifying';
  errorMessageKey: string = '';
  resendForm: FormGroup;
  isResendLoading: boolean = false;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private authService: AuthService,
    private alertService: AlertService,
    private translate: TranslateService,
  ) {
    this.resendForm = this.fb.group({
      email: ['', [trimmedRequiredValidator, Validators.email]],
    });
  }

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token || !token.trim()) {
      this.verifyState = 'failed';
      this.errorMessageKey = 'VERIFY_EMAIL.ERROR.TOKEN_MISSING';
      return;
    }

    try {
      const res = await this.authService.verifyEmail({ token });
      if (res?.code === 200) {
        this.verifyState = 'success';
      }
    } catch (err: unknown) {
      const errorCode = (err as { error?: { errorCode?: string } })?.error
        ?.errorCode;
      if (errorCode === 'VERIFICATION_TOKEN_ALREADY_USED') {
        this.verifyState = 'success';
      } else if (errorCode === 'VERIFICATION_TOKEN_EXPIRED') {
        this.verifyState = 'failed';
        this.errorMessageKey = 'VERIFY_EMAIL.ERROR.VERIFICATION_TOKEN_EXPIRED';
      } else if (errorCode === 'VERIFICATION_TOKEN_INVALID') {
        this.verifyState = 'failed';
        this.errorMessageKey = 'VERIFY_EMAIL.ERROR.VERIFICATION_TOKEN_INVALID';
      } else {
        this.verifyState = 'failed';
        this.errorMessageKey = 'VERIFY_EMAIL.ERROR.GENERIC';
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getResendControl(name: string) {
    return this.resendForm.get(name);
  }

  async resend(): Promise<void> {
    this.resendForm.markAllAsTouched();

    if (this.resendForm.invalid) {
      return;
    }

    this.isResendLoading = true;
    const email = (this.resendForm.value.email as string).trim();

    try {
      const res = await this.authService.resendVerification({ email });
      this.isResendLoading = false;
      if (res?.code === 200) {
        this.alertService.success(
          this.translate.instant('VERIFY_EMAIL.RESEND_SUCCESS')
        );
      }
    } catch (err: unknown) {
      this.isResendLoading = false;
      const errorCode = (err as { error?: { errorCode?: string } })?.error
        ?.errorCode;
      if (errorCode === 'USER_NOT_FOUND') {
        this.alertService.error(
          this.translate.instant('VERIFY_EMAIL.ERROR.USER_NOT_FOUND')
        );
      } else if (errorCode === 'VERIFICATION_ALREADY_VERIFIED') {
        this.alertService.error(
          this.translate.instant('VERIFY_EMAIL.ERROR.VERIFICATION_ALREADY_VERIFIED')
        );
      } else if (errorCode === 'RESEND_RATE_LIMITED') {
        this.alertService.error(
          this.translate.instant('VERIFY_EMAIL.ERROR.RESEND_RATE_LIMITED')
        );
      } else {
        this.alertService.error(
          this.translate.instant('VERIFY_EMAIL.ERROR.GENERIC')
        );
      }
    }
  }

  navigateToLogin(): void {
    void this.router.navigateByUrl('/login');
  }
}
