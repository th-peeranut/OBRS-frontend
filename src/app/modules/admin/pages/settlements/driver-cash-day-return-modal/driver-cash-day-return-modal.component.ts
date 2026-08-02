import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  DriverCashDayDetailDto,
  DriverCashDayListItemDto,
} from '../../../../../shared/interfaces/driver-cash.interface';
import { formatDisplayDateTime } from '../../../../../shared/lib/display-date-time';
import { toCents } from '../../../../../shared/lib/money-cents';

/** `confirmRequested` payload — `POST .../driver-cash/days/{dayId}/return`. */
export interface DriverCashDayReturnPayload {
  returnedAmount: string;
  discrepancyReason?: string;
}

/**
 * OBRS-960 — dumb (presentational). Owns no server state / no API calls,
 * same split as `SettlementDetailModalComponent`: the smart page
 * (`SettlementsPageComponent`) owns the detail cache, the fetch, and the
 * confirm orchestration (`AlertService.confirm()` + POST + error-code
 * branching). This modal COPIES `SettlementDetailModalComponent`'s OBRS-671
 * sign-off form verbatim in shape and classes (`../cash-signoff-form.scss`
 * partial) — counted→**returned** amount, cents parsing, conditional
 * discrepancy reason — with the new field names (`returnedAmount`, not
 * `countedCashAmount`).
 *
 * Opens optimistically: `[summary]` is seeded from the row already in hand
 * before the detail GET resolves (design-system.md §6) — never gated on
 * `[detail]`.
 */
@Component({
    selector: 'app-driver-cash-day-return-modal',
    templateUrl: './driver-cash-day-return-modal.component.html',
    styleUrl: './driver-cash-day-return-modal.component.scss',
    standalone: false
})
export class DriverCashDayReturnModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() summary: DriverCashDayListItemDto | null = null;
  @Input() detail: DriverCashDayDetailDto | null = null;
  @Input() isFetching = false;
  @Input() isConfirming = false;
  @Input() fetchError = '';

  @Output() closed = new EventEmitter<void>();
  @Output() confirmRequested = new EventEmitter<DriverCashDayReturnPayload>();
  @Output() retryFetch = new EventEmitter<void>();

  protected readonly skeletonRows = Array.from({ length: 3 });

  // ── sign-off form (local, reset per day) ──────────────────────────────
  protected returnedAmountInput = '';
  protected discrepancyReasonInput = '';

  private formDayId: number | null = null;

  constructor(private readonly translate: TranslateService) {}

  ngOnChanges(_changes: SimpleChanges): void {
    const dayId = this.summary?.dayId ?? this.detail?.dayId ?? null;
    if (dayId !== this.formDayId) {
      this.formDayId = dayId;
      this.resetForm();
    }
  }

  private resetForm(): void {
    this.returnedAmountInput = '';
    this.discrepancyReasonInput = '';
  }

  protected get returnedCents(): number | null {
    return toCents(this.returnedAmountInput);
  }

  protected get discrepancyCents(): number | null {
    const returned = this.returnedCents;
    if (returned === null || !this.detail) {
      return null;
    }
    const expected = toCents(this.detail.expectedAmount) ?? 0;
    return returned - expected;
  }

  /** Mirrors the backend's presumed `returned.compareTo(expected) != 0` rule
   * (same shape as `SettlementDetailModalComponent.hasDiscrepancy()`) — a
   * reason is mandatory exactly when this is true, and blocks confirm until
   * one is entered (card's central test assertion). */
  protected hasDiscrepancy(): boolean {
    return this.discrepancyCents !== null && this.discrepancyCents !== 0;
  }

  protected discrepancyAmount(): string {
    const cents = this.discrepancyCents;
    return cents === null ? '' : (cents / 100).toFixed(2);
  }

  protected isNegativeMoney(value: string): boolean {
    return Number(value) < 0;
  }

  protected get canConfirm(): boolean {
    return (
      !this.isConfirming &&
      !!this.detail &&
      this.detail.status === 'PENDING' &&
      this.returnedCents !== null &&
      (!this.hasDiscrepancy() || this.discrepancyReasonInput.trim().length > 0)
    );
  }

  protected displayDateTime(value: string | null | undefined): string {
    return formatDisplayDateTime(value, this.translate.currentLang);
  }

  protected formatMoney(value: string, currency: string): string {
    const amount = Number(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  protected trackByEntry(index: number): number {
    return index;
  }

  protected onBackdropDismiss(): void {
    this.closed.emit();
  }

  protected onConfirmClick(): void {
    if (!this.canConfirm) {
      return;
    }
    const returned = this.returnedCents;
    if (returned === null) {
      return;
    }
    const reason = this.discrepancyReasonInput.trim();
    this.confirmRequested.emit({
      returnedAmount: (returned / 100).toFixed(2),
      discrepancyReason: this.hasDiscrepancy() ? reason : undefined,
    });
  }
}
