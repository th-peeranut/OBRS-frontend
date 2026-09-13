import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../services/alert.service';

/**
 * OBRS-643 AC-3 — stands in for the `เลือก` / `ยืนยันข้อมูล` navigation when
 * the signed-in customer's email is unverified, stating the reason AND the
 * remedy instead of a dead button or a silent refusal 19 fields later.
 *
 * Used identically from two hosts —
 * `schedule-booking-list.component.ts` (`เลือก`) and
 * `review-schedule-booking-total.component.ts` (`ยืนยันข้อมูล`) — so it is a
 * shared component rather than two copies of the same modal: same title,
 * body and two remedies (resend / go verify) regardless of which button
 * triggered it.
 *
 * Self-contained ("smart") rather than presentational — the resend action
 * needs no data from either host, so there is nothing to pass in beyond
 * `isOpen`. Same modal chrome as `schedule-booking-list.component.scss`'s
 * `.nrc-*` no-return-confirm dialog / `cancel-booking-modal`'s `.crdm-*`
 * (design-system §6) rather than a fourth pattern; copied here as `.evb-*`
 * because this component is its own encapsulated style scope.
 */
@Component({
  selector: 'app-email-verify-block-modal',
  templateUrl: './email-verify-block-modal.component.html',
  styleUrl: './email-verify-block-modal.component.scss',
  standalone: false,
})
export class EmailVerifyBlockModalComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();

  protected isResendLoading = false;

  constructor(
    private readonly authService: AuthService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  protected dismiss(): void {
    this.closed.emit();
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
          this.translate.instant('EMAIL_VERIFY_BLOCK.RESEND_SUCCESS')
        );
      }
    } catch (err: unknown) {
      const errorCode = (err as { error?: { errorCode?: string } })?.error
        ?.errorCode;
      if (errorCode === 'VERIFICATION_ALREADY_VERIFIED') {
        // The stored flag is stale (e.g. verified in another tab) — the
        // customer is in fact clear to proceed, so let them, rather than
        // leaving them stuck behind a modal that is already wrong.
        this.authService.markEmailVerified();
        this.alertService.success(
          this.translate.instant('EMAIL_VERIFY_BLOCK.ALREADY_VERIFIED')
        );
        this.closed.emit();
        return;
      }
      if (errorCode === 'RESEND_RATE_LIMITED') {
        this.alertService.error(
          this.translate.instant('EMAIL_VERIFY_BLOCK.ERROR.RATE_LIMITED')
        );
      } else {
        this.alertService.error(
          this.translate.instant('EMAIL_VERIFY_BLOCK.ERROR.GENERIC')
        );
      }
    } finally {
      this.isResendLoading = false;
    }
  }
}
