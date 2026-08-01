import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { of, Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, takeUntil, tap } from 'rxjs/operators';
import { AuthService } from '../../../../auth/auth.service';
import { UserService } from '../../../../services/user/user.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';
import { trimmedRequiredValidator } from '../../../../shared/validators/trimmed-required.validator';

type ChangeEmailDialogState = 'form' | 'sent';

/**
 * Hand-rolled dialog chrome copied from `ChangeStopDialogComponent`
 * (backdrop, `role="dialog" aria-modal="true"`, top-right ×,
 * `@HostListener('document:keydown.escape')`) per ADR-0010, opened
 * optimistically by the parent (`*ngIf` flips synchronously — no gated
 * fetch). See docs/adr/0014-account-identity-settings-page.md.
 */
@Component({
    selector: 'app-change-email-dialog',
    templateUrl: './change-email-dialog.component.html',
    styleUrl: './change-email-dialog.component.scss',
    standalone: false
})
export class ChangeEmailDialogComponent implements OnInit, OnDestroy {
  @Output() readonly closed = new EventEmitter<void>();
  @ViewChild('currentPasswordInput') currentPasswordInput?: ElementRef<HTMLInputElement>;

  dialogState: ChangeEmailDialogState = 'form';
  changeEmailForm: FormGroup;
  isShowPassword = false;
  isSubmitting = false;
  isResendLoading = false;
  sentToEmail = '';
  /** Live duplicate hint from the debounced check — distinct from the
   * submit-time USER_EMAIL_CHANGE_ERROR_EMAIL_CONFLICT (`emailErrorKey`),
   * which the backend is still the authority on. */
  newEmailExists = false;

  /** Inline field errors from the last submit attempt. Cleared as soon as
   * the relevant control's value changes (design-system: don't leave a stale
   * server error attached to an edited field). */
  passwordErrorKey: string | null = null;
  emailErrorKey: string | null = null;

  private readonly destroy$ = new Subject<void>();
  private triggerElement: HTMLElement | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.changeEmailForm = this.fb.group({
      currentPassword: ['', [trimmedRequiredValidator]],
      newEmail: ['', [Validators.required, Validators.email]],
    });
  }

  ngOnInit(): void {
    // Return focus here on close (a11y: dialog must not strand focus).
    this.triggerElement = document.activeElement as HTMLElement | null;

    this.changeEmailForm
      .get('currentPassword')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.passwordErrorKey = null;
      });

    this.changeEmailForm
      .get('newEmail')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.emailErrorKey = null;
      });

    // Reuses register.component.ts's debounce → distinctUntilChanged →
    // switchMap(userService.checkExistEmail) duplicate-hint pipeline.
    this.changeEmailForm
      .get('newEmail')
      ?.valueChanges.pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap((value: string) => this.checkNewEmailExists(value)),
        takeUntil(this.destroy$)
      )
      .subscribe();

    // Focus the current-password field on open (a11y).
    setTimeout(() => this.currentPasswordInput?.nativeElement.focus());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.triggerElement?.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }

  toggleShowPassword(): void {
    this.isShowPassword = !this.isShowPassword;
  }

  getForm(controlName: string) {
    return this.changeEmailForm.get(controlName);
  }

  async submit(): Promise<void> {
    this.changeEmailForm.markAllAsTouched();

    if (this.changeEmailForm.invalid || this.newEmailExists || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.passwordErrorKey = null;
    this.emailErrorKey = null;

    const currentPassword = (this.changeEmailForm.value.currentPassword as string).trim();
    const newEmail = (this.changeEmailForm.value.newEmail as string).trim();

    try {
      const res = await this.authService.requestEmailChange({ currentPassword, newEmail });
      this.isSubmitting = false;

      if (res?.code === 200) {
        this.sentToEmail = newEmail;
        this.dialogState = 'sent';
      }
    } catch (err: unknown) {
      this.isSubmitting = false;
      const errorCode = (err as { error?: { errorCode?: string } })?.error?.errorCode;

      if (errorCode === 'AUTH_ERROR_INVALID_CREDENTIALS') {
        this.passwordErrorKey = 'EMAIL_CHANGE.ERROR.INVALID_PASSWORD';
      } else if (errorCode === 'USER_EMAIL_CHANGE_ERROR_EMAIL_CONFLICT') {
        this.emailErrorKey = 'EMAIL_CHANGE.ERROR.EMAIL_CONFLICT';
      } else if (errorCode === 'USER_EMAIL_CHANGE_ERROR_SAME_EMAIL') {
        this.emailErrorKey = 'EMAIL_CHANGE.ERROR.SAME_EMAIL';
      } else {
        this.alertService.error(this.translate.instant('EMAIL_CHANGE.ERROR.GENERIC'));
      }
    }
  }

  async resend(): Promise<void> {
    if (this.isResendLoading) {
      return;
    }

    this.isResendLoading = true;

    try {
      const res = await this.authService.resendEmailChangeVerification();
      this.isResendLoading = false;

      if (res?.code === 200) {
        this.alertService.success(this.translate.instant('EMAIL_CHANGE.RESEND_SUCCESS'));
      }
    } catch (err: unknown) {
      this.isResendLoading = false;
      const errorCode = (err as { error?: { errorCode?: string } })?.error?.errorCode;

      if (errorCode === 'AUTH_ERROR_RATE_LIMIT_EXCEEDED') {
        this.alertService.error(this.translate.instant('EMAIL_CHANGE.ERROR.RATE_LIMIT'));
      } else {
        this.alertService.error(this.translate.instant('EMAIL_CHANGE.ERROR.GENERIC'));
      }
    }
  }

  private checkNewEmailExists(value: string) {
    const trimmed = (value ?? '').trim();

    if (!trimmed) {
      this.newEmailExists = false;
      return of(null);
    }

    return this.userService.checkExistEmail(trimmed).pipe(
      catchError(() => of(null as ResponseAPI<boolean> | null)),
      tap((res) => {
        this.newEmailExists = res?.code === 200 ? res.data ?? false : false;
      })
    );
  }
}
