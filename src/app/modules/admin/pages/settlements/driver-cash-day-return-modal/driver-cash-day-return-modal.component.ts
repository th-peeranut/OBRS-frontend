import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  DriverCashDayRespDto,
  DriverCashDayStatus,
  DriverCashDaySummaryRespDto,
  DriverCashEntryRespDto,
} from '../../../../../shared/interfaces/driver-cash.interface';
import { formatDisplayDate, formatDisplayDateTime } from '../../../../../shared/lib/display-date-time';
import { centsToDecimalString, toSignedCents } from '../../../../../shared/lib/money-cents';
import { formatMoney } from '../../../../../shared/lib/money-display';

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
 * OBRS-1144 — the sign-off form no longer starts empty and no longer refuses
 * a minus sign. It parses with `toSignedCents`, NOT the shared `toCents` that
 * `SettlementDetailModalComponent` uses: that one guards a physical cash
 * count and must keep rejecting negatives. The two forms stopped being the
 * same form the moment OBRS-1073 made this one a two-sided balance.
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
  /** OBRS-1579 — the re-open POST is in flight. */
  @Input() isReopening = false;

  @Output() closed = new EventEmitter<void>();
  @Output() confirmRequested = new EventEmitter<DriverCashDayReturnPayload>();
  @Output() retryFetch = new EventEmitter<void>();
  /** OBRS-1579 — emits the mandatory reason. */
  @Output() reopenRequested = new EventEmitter<string>();

  protected readonly skeletonRows = Array.from({ length: 3 });

  // ── sign-off form (local, reset per day) ──────────────────────────────
  protected returnedAmountInput = '';
  protected discrepancyReasonInput = '';

  // ── OBRS-1579 re-open form (collapsed until the owner asks for it) ─────
  protected isReopenFormOpen = false;
  protected reopenReasonInput = '';

  private formDayId: number | null = null;
  private prefilledDayId: number | null = null;
  private lastDetailStatus: DriverCashDayStatus | null = null;

  constructor(private readonly translate: TranslateService) {}

  ngOnChanges(_changes: SimpleChanges): void {
    const dayId = this.summary?.dayId ?? this.detail?.dayId ?? null;
    if (dayId !== this.formDayId) {
      this.formDayId = dayId;
      this.resetForm();
    }
    this.applyReopenTransition();
    this.prefillFromExpectedOnce(dayId);
  }

  /**
   * OBRS-1579 — a re-open puts the SAME `dayId` back to `OPEN`, and
   * `prefillFromExpectedOnce` is keyed on `dayId`, so an owner who returned a
   * box and then re-opened it in the same modal would have kept the amount they
   * signed a moment ago (e.g. `-120.00`) sitting in a box whose expectation is
   * now `-1320.00`.
   *
   * ⛔ That is not a cosmetic staleness. `returnedAmount` is the CUMULATIVE
   * total for the whole business date, not the increment the late bill added
   * (`DriverCashService#reopenDay`'s contract). Confirming the stale figure
   * would raise a discrepancy that does not exist, and the form then DEMANDS a
   * reason for it - forcing an invented sentence into the very audit trail this
   * card exists to make honest.
   */
  private applyReopenTransition(): void {
    const status = this.detail?.status ?? null;
    if (this.lastDetailStatus === 'RETURNED' && status === 'OPEN') {
      this.prefilledDayId = null;
      this.returnedAmountInput = '';
      this.discrepancyReasonInput = '';
      this.isReopenFormOpen = false;
      this.reopenReasonInput = '';
    }
    this.lastDetailStatus = status;
  }

  /**
   * OBRS-1144 — the owner's own words: *"แค่ส่งเรื่องต่อให้ owner กดรับก็น่าจะโอเค"*.
   * The field stays (it is the only thing that can ever say the cash did NOT
   * add up — see `driver_cash_days.discrepancy`), but the ordinary day, where
   * the cash matches, is now one click: the expectation is already in the box
   * and `canConfirm` is true on arrival.
   *
   * Fires ONCE per day, and only after `[detail]` resolves — the modal opens
   * optimistically on `[summary]` alone (design-system.md §6), which carries
   * no expectation to seed with. `prefilledDayId` is what makes it once: the
   * smart page re-emits `[detail]` on every store tick, and refilling on each
   * one would silently undo an owner mid-correction. Never touches a day that
   * is already `RETURNED` — that form is not rendered at all.
   */
  private prefillFromExpectedOnce(dayId: number | null): void {
    if (dayId === null || this.prefilledDayId === dayId) {
      return;
    }
    if (!this.detail || this.detail.status !== 'OPEN') {
      return;
    }
    const expected = toSignedCents(this.detail.expectedReturnAmount);
    if (expected === null) {
      return; // unparseable wire value — leave the box empty rather than lie
    }
    this.prefilledDayId = dayId;
    this.returnedAmountInput = centsToDecimalString(expected);
  }

  private resetForm(): void {
    this.returnedAmountInput = '';
    this.discrepancyReasonInput = '';
    this.prefilledDayId = null;
    this.lastDetailStatus = null;
    this.isReopenFormOpen = false;
    this.reopenReasonInput = '';
  }

  // ── OBRS-1579: re-open ─────────────────────────────────────────────────

  /** ⛔ True stays true after the box is signed off AGAIN — a re-opened box
   * must never read as an ordinary one. */
  protected get hasReopens(): boolean {
    return (this.detail?.reopenCount ?? 0) > 0;
  }

  protected get canReopen(): boolean {
    return (
      !this.isReopening &&
      !!this.detail &&
      this.detail.status === 'RETURNED' &&
      this.reopenReasonInput.trim().length > 0
    );
  }

  protected toggleReopenForm(): void {
    this.isReopenFormOpen = !this.isReopenFormOpen;
    if (!this.isReopenFormOpen) {
      this.reopenReasonInput = '';
    }
  }

  protected onReopenClick(): void {
    if (!this.canReopen) {
      return;
    }
    this.reopenRequested.emit(this.reopenReasonInput.trim());
  }

  protected displayDateTime(value: string | null | undefined): string {
    return formatDisplayDateTime(value, this.translate.currentLang);
  }

  protected get returnedCents(): number | null {
    return toSignedCents(this.returnedAmountInput);
  }

  /**
   * OBRS-1053 — same rule as the staff summary pill: a `0.00` breakdown line
   * explains nothing, and every day on prod is `0.00` today (both parcel-share
   * percentages are still at their `0` default, so OBRS-992 never writes a
   * clawback row). Shown only when there is something to explain.
   */
  /**
   * OBRS-1145 — the per-head fee is the holder's EARNINGS for the day and is
   * NOT a term of the expected amount: it was already netted out of the cash
   * they handed the round. Rendered without a sign, under a label that says
   * "already netted at the round", so it can be read as neither an addend nor
   * a deduction of this figure.
   */
  protected get hasPerHead(): boolean {
    return this.isNonZero(this.detail?.perHeadTotal);
  }

  private isNonZero(value: string | null | undefined): boolean {
    return value !== null && value !== undefined && Number(value) !== 0;
  }

  protected get hasParcelClawback(): boolean {
    return Number(this.detail?.parcelClawbackTotal ?? 0) > 0;
  }

  protected get discrepancyCents(): number | null {
    const returned = this.returnedCents;
    if (returned === null || !this.detail) {
      return null;
    }
    // OBRS-1144 — this used to be `toCents(...) ?? 0`, which returned null on
    // a NEGATIVE expectation and then silently compared against zero: a day
    // expecting -20.00 reported a 20.00 discrepancy whatever was entered.
    const expected = toSignedCents(this.detail.expectedReturnAmount) ?? 0;
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
  /** OBRS-1592: driver-cash printed these decimal strings raw — no unit, no
   * thousand separator, `.00` on every whole amount. Staff money is money. */
  protected formatMoney(value: number | string | null | undefined): string {
    return formatMoney(value, this.translate.currentLang);
  }

}
