import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  DriverCashDayRespDto,
  DriverCashDaySummaryRespDto,
  DriverCashEntryRespDto,
} from '../../../../../shared/interfaces/driver-cash.interface';
import { formatDisplayDate } from '../../../../../shared/lib/display-date-time';
import { toCents } from '../../../../../shared/lib/money-cents';

/** `confirmRequested` payload — `POST /api/private/driver-cash/days/{dayId}/return`. */
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
 *
 * ⚠️ CORRECTED (2026-08-02, backend reconciliation) — `[detail]` is now the
 * SAME flat `DriverCashDayRespDto` the staff panel reads (`GET
 * /api/private/driver-cash/days/{dayId}` returns it, confirmed against the
 * backend), not the invented `DriverCashDayDetailDto` with an `expectedAmount`
 * field and a `PENDING`/`RETURNED` status — the real field is
 * `expectedReturnAmount` and the real open status is `OPEN`. There is no
 * `currency` field on the real DTO (driver-cash is THB-only in practice, and
 * the backend's DTOs carry no currency code anywhere in this feature), so
 * money renders as the raw decimal string, not through `Intl.NumberFormat`.
 *
 * ⚠️ CORRECTED AGAIN (same day, second reconciliation pass) — each entry has
 * no `label` field on the wire at all (the first correction pass still
 * guessed one). The display label is derived HERE, from `entry.type` (+
 * `expenseCategory` for `EXPENSE_PAID`, reusing the existing
 * `ADMIN.EXPENSES.CATEGORIES.*` keys rather than minting new ones) — see
 * `entryTypeLabel()`. `trackByEntry` now keys on `entry.id`, not the array
 * index.
 */
@Component({
    selector: 'app-driver-cash-day-return-modal',
    templateUrl: './driver-cash-day-return-modal.component.html',
    styleUrl: './driver-cash-day-return-modal.component.scss',
    standalone: false
})
export class DriverCashDayReturnModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() summary: DriverCashDaySummaryRespDto | null = null;
  @Input() detail: DriverCashDayRespDto | null = null;
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

  /**
   * OBRS-1053 — same rule as the staff summary pill: a `0.00` breakdown line
   * explains nothing, and every day on prod is `0.00` today (both parcel-share
   * percentages are still at their `0` default, so OBRS-992 never writes a
   * clawback row). Shown only when there is something to explain.
   */
  protected get hasParcelClawback(): boolean {
    return Number(this.detail?.parcelClawbackTotal ?? 0) > 0;
  }

  protected get discrepancyCents(): number | null {
    const returned = this.returnedCents;
    if (returned === null || !this.detail) {
      return null;
    }
    const expected = toCents(this.detail.expectedReturnAmount) ?? 0;
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
      this.detail.status === 'OPEN' &&
      this.returnedCents !== null &&
      (!this.hasDiscrepancy() || this.discrepancyReasonInput.trim().length > 0)
    );
  }

  protected displayDate(value: string | null | undefined): string {
    return formatDisplayDate(value, this.translate.currentLang);
  }

  protected trackByEntry(_index: number, entry: DriverCashEntryRespDto): number {
    return entry.id;
  }

  /**
   * There is no display label on the wire — derived from `entry.type` via
   * i18n. `EXPENSE_PAID` composes with `expenseCategory`, reusing the
   * EXISTING `ADMIN.EXPENSES.CATEGORIES.*` keys (the same ones the admin
   * expenses table already uses — `PERMIT_FEE` must read identically in
   * both places) rather than minting a second copy. `PARCEL_SHARE` is not
   * branched on: the backend's `ck_driver_cash_entries_type` CHECK
   * constraint deliberately removed it and it will never appear.
   */
  protected entryTypeLabel(entry: DriverCashEntryRespDto): string {
    if (entry.type === 'EXPENSE_PAID') {
      const categoryLabel = entry.expenseCategory
        ? this.translate.instant(`ADMIN.EXPENSES.CATEGORIES.${entry.expenseCategory}`)
        : this.translate.instant('ADMIN.EXPENSES.CATEGORIES.OTHER');
      return this.translate.instant('ADMIN.SETTLEMENTS.DRIVER_CASH.ENTRY_TYPE.EXPENSE_PAID', {
        category: categoryLabel,
      });
    }
    return this.translate.instant(`ADMIN.SETTLEMENTS.DRIVER_CASH.ENTRY_TYPE.${entry.type}`);
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
