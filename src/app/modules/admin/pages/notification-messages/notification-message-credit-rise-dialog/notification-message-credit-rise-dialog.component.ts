import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * OBRS-1550 — the owner must acknowledge a credit RISE before it is submitted.
 * `.admin-modal-backdrop` inline dialog, reusing the sibling
 * `NotificationMessageRejectDialogComponent` shell verbatim.
 *
 * <p>Opened only from the edit page, never from the credit panel: the panel is
 * also reused by the admin review-detail page, which must keep reading as a
 * display-only surface.
 *
 * <p>The figures are the ones the backend already returned — this dialog does
 * no arithmetic beyond the before/after pair (AC-2). It deliberately says
 * nothing about a monthly total: no endpoint reports send volume per message
 * key, and AC-2 forbids guessing one.
 */
@Component({
    selector: 'app-notification-message-credit-rise-dialog',
    templateUrl: './notification-message-credit-rise-dialog.component.html',
    styleUrl: './notification-message-credit-rise-dialog.component.scss',
    standalone: false
})
export class NotificationMessageCreditRiseDialogComponent {
  @Input() visible = false;
  @Input() submitting = false;
  @Input() credits: number | null = null;
  @Input() baselineCredits: number | null = null;

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  protected onConfirm(): void {
    if (this.submitting) {
      return;
    }
    this.confirm.emit();
  }

  protected onCancel(): void {
    this.cancel.emit();
  }
}
