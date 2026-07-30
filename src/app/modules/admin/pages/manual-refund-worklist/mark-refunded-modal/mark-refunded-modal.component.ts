import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService } from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorCode } from '../../../../../shared/lib/api-error-code';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { trimmedRequiredValidator } from '../../../../../shared/validators/trimmed-required.validator';
import { PendingRefund } from '../../../../../shared/interfaces/payment.interface';

/**
 * OBRS-286 Flow C — "Mark Refunded" per-row action on the manual-refund
 * worklist. Hits the NEW `POST /private/payments/{id}/manual-refund`
 * (`AdminApiService.markPaymentManuallyRefunded`) — never the old
 * `refundPayment()` (that one 400s for exactly these payment methods).
 *
 * Idempotency (K7): a 200, whether a first-time success or a replay of an
 * already-completed call, renders through the SAME success branch below —
 * there is deliberately no client-side heuristic that treats a 200
 * differently based on prior state, so a double-click/retry can never look
 * like an error.
 */
@Component({
    selector: 'app-mark-refunded-modal',
    templateUrl: './mark-refunded-modal.component.html',
    styleUrl: './mark-refunded-modal.component.scss',
    standalone: false
})
export class MarkRefundedModalComponent implements OnChanges {
  @Input({ required: true }) row!: PendingRefund;
  /** Emitted after a successful (or already-completed-elsewhere) mark-refunded. */
  @Output() readonly completed = new EventEmitter<void>();
  @Output() readonly closed = new EventEmitter<void>();

  protected readonly form: FormGroup;
  protected isSubmitting = false;
  /** Inline banner under the form (design-system §6: not a floating
   * AlertService.error() — what was typed must survive on screen). */
  protected errorMessage = '';
  /** Inline error specifically under the amount field (400 amount errors). */
  protected amountErrorMessage = '';

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.form = this.formBuilder.group({
      transferReference: ['', [trimmedRequiredValidator, Validators.maxLength(100)]],
      amountTransferred: [null as number | null],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['row']) {
      return;
    }
    this.errorMessage = '';
    this.amountErrorMessage = '';
    this.isSubmitting = false;
    const amountOwed = this.row?.amountOwed ?? this.row?.amount;
    const numeric = typeof amountOwed === 'string' ? parseFloat(amountOwed) : amountOwed;
    this.form.reset({
      transferReference: '',
      amountTransferred: Number.isFinite(numeric as number) ? numeric : null,
    });
  }

  protected requestClose(): void {
    if (this.isSubmitting) {
      return;
    }
    this.closed.emit();
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSubmitting = true;
    this.errorMessage = '';
    this.amountErrorMessage = '';
    try {
      const transferReference = String(this.form.get('transferReference')?.value ?? '').trim();
      const amountTransferred = this.form.get('amountTransferred')?.value;
      await firstValueFrom(
        this.adminApiService.markPaymentManuallyRefunded(this.row.paymentId, {
          transferReference,
          amountTransferred: amountTransferred === null || amountTransferred === '' ? undefined : Number(amountTransferred),
        })
      );
      await this.alertService.success(this.translate.instant('ADMIN.MANUAL_REFUNDS.MODAL.SUCCESS'));
      this.completed.emit();
    } catch (error) {
      const code = extractApiErrorCode(error, null);
      if (code === 'PAYMENT_MANUAL_REFUND_INVALID_STATUS') {
        // Someone else already handled this row elsewhere — the row itself
        // is now stale, so close and let the parent's refresh() confirm it's
        // gone, same end-state as a genuine success.
        await this.alertService.error(
          this.translate.instant('ADMIN.MANUAL_REFUNDS.MODAL.ERROR.INVALID_STATUS')
        );
        this.completed.emit();
        return;
      }
      if (code === 'PAYMENT_MANUAL_REFUND_AMOUNT_MISMATCH') {
        this.amountErrorMessage = this.translate.instant(
          'ADMIN.MANUAL_REFUNDS.MODAL.ERROR.AMOUNT_MISMATCH'
        );
        return;
      }
      if (code === 'PAYMENT_MANUAL_REFUND_AMOUNT_REQUIRED') {
        this.amountErrorMessage = this.translate.instant(
          'ADMIN.MANUAL_REFUNDS.MODAL.ERROR.AMOUNT_REQUIRED'
        );
        return;
      }
      this.errorMessage =
        extractApiErrorMessage(error) || this.translate.instant('COMMON.ERROR.REQUEST_FAILED');
    } finally {
      this.isSubmitting = false;
    }
  }
}
