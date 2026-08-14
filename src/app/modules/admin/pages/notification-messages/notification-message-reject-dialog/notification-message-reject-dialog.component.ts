import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

/**
 * OBRS-1308 — admin reject-reason dialog. `.admin-modal-backdrop` inline
 * dialog, reusing the OBRS-272 `BoardingListComponent` delay-ETA precedent
 * verbatim, including `AdminModalBackdropDirective` from `SharedModule`.
 *
 * Confirm is disabled until the reason is non-blank; the backend's own
 * blank-reason 400 (a same-instant race) is handled by the page via
 * `AlertService.error()` branched on `errorCode` — this dialog only owns the
 * client-side "you haven't typed anything yet" signal.
 */
@Component({
    selector: 'app-notification-message-reject-dialog',
    templateUrl: './notification-message-reject-dialog.component.html',
    styleUrl: './notification-message-reject-dialog.component.scss',
    standalone: false
})
export class NotificationMessageRejectDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() submitting = false;

  @Output() confirm = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  protected reason = '';
  protected touched = false;

  ngOnChanges(changes: SimpleChanges): void {
    // Reset every time the dialog re-opens, so a previous attempt's text
    // doesn't leak into the next.
    if (changes['visible'] && this.visible) {
      this.reason = '';
      this.touched = false;
    }
  }

  protected get isBlank(): boolean {
    return this.reason.trim().length === 0;
  }

  protected onConfirm(): void {
    this.touched = true;
    if (this.isBlank || this.submitting) {
      return;
    }
    this.confirm.emit(this.reason.trim());
  }

  protected onCancel(): void {
    this.cancel.emit();
  }
}
