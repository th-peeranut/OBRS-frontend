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
import { AuthService } from '../../../../auth/auth.service';
import { MyAccountService } from '../../../../services/user/my-account.service';
import { AlertService } from '../../../../shared/services/alert.service';

/**
 * OBRS-632 — PDPA ม.33 / ม.19 วรรคห้า: the customer-facing way to close an account.
 *
 * <p>Dialog chrome copied from `ChangeEmailDialogComponent` (backdrop, `role="dialog"
 * aria-modal="true"`, top-right ×, escape handler) per ADR-0010.
 *
 * <p>Two things about the copy are deliberate and must not be "simplified" later:
 *
 * <ul>
 *   <li>It says the identifying data is removed and the travel/receipt records are <em>kept</em> for
 *       as long as accounting law requires. The backend anonymises in place; promising "everything
 *       is deleted" would be a page describing something the system does not do, which is the exact
 *       defect OBRS-627 was opened for.</li>
 *   <li>It says the action cannot be undone, and requires the confirmation phrase to be typed.
 *       There is no un-close path — the row's identity columns are overwritten, not archived.</li>
 * </ul>
 */
@Component({
  selector: 'app-close-account-dialog',
  templateUrl: './close-account-dialog.component.html',
  styleUrl: './close-account-dialog.component.scss',
})
export class CloseAccountDialogComponent implements OnInit, OnDestroy {
  @Output() readonly closed = new EventEmitter<void>();
  @ViewChild('confirmInput') confirmInput?: ElementRef<HTMLInputElement>;

  confirmForm: FormGroup;
  isSubmitting = false;

  private readonly expectedPhrase: string;
  private triggerElement: HTMLElement | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly myAccountService: MyAccountService,
    private readonly authService: AuthService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    // Translated, because a Thai-reading customer being asked to type an English word is a
    // confirmation step that tests typing skill rather than intent.
    this.expectedPhrase = this.translate.instant('ACCOUNT.CLOSE_CONFIRM_PHRASE');
    this.confirmForm = this.fb.group({
      confirmation: ['', [Validators.required]],
    });
  }

  ngOnInit(): void {
    this.triggerElement = document.activeElement as HTMLElement | null;
    setTimeout(() => this.confirmInput?.nativeElement.focus());
  }

  ngOnDestroy(): void {
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

  get confirmPhrase(): string {
    return this.expectedPhrase;
  }

  get isPhraseCorrect(): boolean {
    const typed = (this.confirmForm.value.confirmation as string) ?? '';
    return typed.trim() === this.expectedPhrase;
  }

  submit(): void {
    if (!this.isPhraseCorrect || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;

    this.myAccountService.closeAccount().subscribe({
      next: () => {
        this.isSubmitting = false;
        this.alertService.success(this.translate.instant('ACCOUNT.CLOSE_SUCCESS'));
        // The session is dead server-side the moment the account closes (the JWT subject no longer
        // resolves), so clearing locally is not cosmetic — leaving the token in place would leave
        // the app rendering a logged-in shell whose every request 401s. `logout()` clears the
        // stored token and navigates away on its own.
        this.authService.logout();
      },
      error: (err: unknown) => {
        this.isSubmitting = false;
        const errorCode = (err as { error?: { errorCode?: string } })?.error?.errorCode;
        this.alertService.error(
          this.translate.instant(
            errorCode === 'USER_CLOSE_ERROR_ALREADY_CLOSED'
              ? 'ACCOUNT.CLOSE_ERROR_ALREADY_CLOSED'
              : 'ACCOUNT.CLOSE_ERROR_GENERIC'
          )
        );
      },
    });
  }
}
