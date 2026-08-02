import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import {
  PromotionService,
  PromotionValidationResult,
} from '../../../services/promotion/promotion.service';

export interface PromoCodeAppliedEvent {
  code: string;
  discountAmount: number;
  netAmount: number;
}

// The exact 6 errorCode values the (locked) backend contract emits for a
// promo code rejection. Note the backend COLLAPSES "expired" and "not yet
// active" into a single OUT_OF_WINDOW code/message — there is no separate
// EXPIRED code. Anything else falls back to a generic apply-failed message.
const PROMO_ERROR_SUFFIXES = [
  'NOT_FOUND',
  'NOT_APPLICABLE',
  'INACTIVE',
  'OUT_OF_WINDOW',
  'BELOW_MINIMUM',
  'USAGE_LIMIT_REACHED',
] as const;

/**
 * Instant-preview promo code entry (OBRS-109 / #37): a text input + Apply
 * button that calls PromotionService.validate() and collapses to a removable
 * chip on success. Purely presentational about the code/discount/net values
 * it receives — the Subtotal/Discount/Total breakdown display is owned by
 * the consuming summary component (which already renders the surrounding
 * fare breakdown under its own REVIEW_SCHEDULE_BOOKING/PAYMENT i18n
 * namespace), not duplicated here.
 */
@Component({
    selector: 'app-promo-code-field',
    templateUrl: './promo-code-field.component.html',
    styleUrl: './promo-code-field.component.scss',
    standalone: false
})
export class PromoCodeFieldComponent implements OnDestroy {
  @Input() amount = 0;
  @Input() disabled = false;
  @Output() applied = new EventEmitter<PromoCodeAppliedEvent>();
  @Output() removed = new EventEmitter<void>();

  protected code = '';
  protected isApplying = false;
  protected errorMessage = '';
  protected appliedResult: PromoCodeAppliedEvent | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly promotionService: PromotionService,
    private readonly translate: TranslateService
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get isApplyDisabled(): boolean {
    return this.disabled || this.isApplying || this.code.trim().length === 0;
  }

  protected onInputChange(): void {
    if (this.errorMessage) {
      this.errorMessage = '';
    }
  }

  protected apply(): void {
    const trimmedCode = this.code.trim();
    if (!trimmedCode || this.isApplying) {
      return;
    }

    this.isApplying = true;
    this.errorMessage = '';

    this.promotionService
      .validate(trimmedCode, this.amount)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => this.onValidateSuccess(response.data, trimmedCode),
        error: (error: unknown) => this.onValidateError(error),
      });
  }

  protected remove(): void {
    this.appliedResult = null;
    this.code = '';
    this.errorMessage = '';
    this.removed.emit();
  }

  /**
   * Called by an ancestor when a submitted booking is rejected with a
   * PROMO_CODE_* errorCode after this field's code was already applied here
   * (a preview -> submit race, e.g. the code's usage cap filled in between).
   * Reverts to the input state with the error surfaced inline; the typed
   * code stays visible so the customer can see what failed without retyping.
   */
  applyExternalError(errorCode: string): void {
    this.appliedResult = null;
    this.errorMessage = this.mapErrorCode(errorCode);
    this.removed.emit();
  }

  private onValidateSuccess(
    data: PromotionValidationResult | null | undefined,
    fallbackCode: string
  ): void {
    this.isApplying = false;
    if (!data) {
      this.errorMessage = this.translate.instant('PROMO_CODE.APPLY_FAILED');
      return;
    }

    const result: PromoCodeAppliedEvent = {
      code: String(data.code || fallbackCode),
      discountAmount: Number(data.discountAmount) || 0,
      netAmount: Number(data.netAmount) || 0,
    };
    this.appliedResult = result;
    this.applied.emit(result);
  }

  private onValidateError(error: unknown): void {
    this.isApplying = false;
    const errorCode =
      error instanceof HttpErrorResponse ? String(error.error?.errorCode ?? '') : '';
    this.errorMessage = this.mapErrorCode(errorCode);
  }

  private mapErrorCode(errorCode: string): string {
    const normalized = (errorCode || '').trim().toUpperCase();
    const suffix = PROMO_ERROR_SUFFIXES.find((code) => normalized === `PROMO_CODE_${code}`);
    return this.translate.instant(
      suffix ? `PROMO_CODE.ERROR.${suffix}` : 'PROMO_CODE.APPLY_FAILED'
    );
  }
}
