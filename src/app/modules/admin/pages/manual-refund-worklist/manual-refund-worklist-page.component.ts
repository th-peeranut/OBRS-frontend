import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { ManualRefundWorklistStore } from './manual-refund-worklist.store';
import { PendingRefund } from '../../../../shared/interfaces/payment.interface';
import { hasDestination, queueAgeDays, queueAgeSeverity } from './manual-refund-worklist-page.mappers';
import { BankService } from '../../../../services/bank/bank.service';
import { BankDto, bankNameFor } from '../../../../shared/interfaces/bank.interface';
import { formatMoney } from '../../../../shared/lib/money-display';

type WorklistContentState = 'loading' | 'error' | 'empty' | 'data';

/**
 * OBRS-286 AC-2/AC-3 — the owner-facing queue of payments awaiting a manual
 * refund transfer (`GET /private/payments/refunds/pending`). One smart
 * component + reused shared admin-table/paginator/refresh-hint chrome, same
 * shape as `ConfigChangeHistoryPageComponent` (the genuine paged-store
 * precedent — see `ManualRefundWorklistStore`'s own doc comment for why
 * `RefundVoidReportStore` is NOT the one to copy).
 */
@Component({
    selector: 'app-manual-refund-worklist-page',
    templateUrl: './manual-refund-worklist-page.component.html',
    styleUrl: './manual-refund-worklist-page.component.scss',
    standalone: false
})
export class ManualRefundWorklistPageComponent implements OnInit, OnDestroy {
  protected rows: PendingRefund[] = [];
  protected totalElements = 0;
  protected currentPage = 1;
  protected totalPages = 1;
  protected readonly pageSize = 20;
  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 5 });

  /** Row whose mark-refunded modal is open, or null when closed. Snapshotted
   * at open (paymentId + amountOwed + row-in-hand) — the modal itself never
   * re-reads the live store mid-edit. */
  protected markRefundedRow: PendingRefund | null = null;

  /** OBRS-1463 — code-to-name for the destination column; see `bankLabel()`. */
  private banks: BankDto[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    protected readonly store: ManualRefundWorklistStore,
    private readonly translate: TranslateService,
    private readonly bankService: BankService
  ) {}

  ngOnInit(): void {
    // A failure here costs the codes their names and nothing else — `bankLabel`
    // falls back to the raw value, which is what the rows written before
    // OBRS-1463 render anyway.
    this.bankService
      .getBanks()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (banks) => (this.banks = banks), error: () => (this.banks = []) });

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.rows = data?.content ?? [];
      this.totalElements = data?.totalElements ?? 0;
      this.currentPage = (data?.number ?? 0) + 1;
      this.totalPages = data?.totalPages ?? 0;
    });

    this.store.refreshing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((refreshing) => (this.isRefreshing = refreshing));

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.refreshFailed = failed && this.store.hasValue;
      this.errorMessage =
        failed && !this.store.hasValue
          ? this.translate.instant('ADMIN.MANUAL_REFUNDS.LOAD_FAILED')
          : '';
    });

    // Renders optimistically from cache if present (UX Flow B step 1), then
    // revalidates in the background.
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  protected get contentState(): WorklistContentState {
    if (this.isLoading) {
      return 'loading';
    }
    if (this.errorMessage) {
      return 'error';
    }
    if (this.totalElements === 0) {
      return 'empty';
    }
    return 'data';
  }

  protected onPageChange(page: number): void {
    void this.store.goToPage(page - 1);
  }

  protected hasDestination(row: PendingRefund): boolean {
    return hasDestination(row);
  }

  /**
   * OBRS-1463 (AC-4): `destination.bank` holds an `EThaiBank` code on every row
   * written since that card, and hand-typed free text (`"กสิกร"`, `"KBANK"`) on
   * every row written before it. Unknown values are shown VERBATIM — the owner
   * still has to transfer that money, and blanking the field or printing a
   * placeholder would take away the only clue those older rows carry.
   */
  protected bankLabel(bank: string | undefined): string {
    if (!bank) {
      return '';
    }
    const known = this.banks.find((candidate) => candidate.code === bank);
    return known ? bankNameFor(known, this.translate.currentLang) : bank;
  }

  protected queueAgeDays(row: PendingRefund): number | null {
    return queueAgeDays(row.queuedAt);
  }

  protected queueAgeSeverity(row: PendingRefund): string {
    return queueAgeSeverity(this.queueAgeDays(row), row.overdue);
  }

  /** OBRS-1136 AC-4: the server's verdict, read as given — see `PendingRefund`'s
   * own comment for why the browser must not decide this for itself. */
  protected isOverdue(row: PendingRefund): boolean {
    return row.overdue === true;
  }

  protected formatMoney(value: number | string | undefined): string {
    const numeric = typeof value === 'string' ? parseFloat(value) : value ?? 0;
    return formatMoney(Number.isFinite(numeric) ? Number(numeric) : 0, this.translate.currentLang);
  }

  protected openMarkRefunded(row: PendingRefund): void {
    this.markRefundedRow = row;
  }

  protected closeMarkRefunded(): void {
    this.markRefundedRow = null;
  }

  /** UX Flow C step 3: an optimistic drop of the row, then a background
   * `refresh()` reconciles against the server. */
  protected onMarkRefundedCompleted(): void {
    const paymentId = this.markRefundedRow?.paymentId;
    if (paymentId !== undefined) {
      this.store.mutate((current) => ({
        ...current,
        content: current.content.filter((row) => row.paymentId !== paymentId),
        totalElements: Math.max(0, current.totalElements - 1),
        numberOfElements: Math.max(0, current.numberOfElements - 1),
      }));
    }
    this.markRefundedRow = null;
    void this.store.refresh();
  }

  // Arrow-function field: *ngFor invokes trackBy as a free function, so a
  // regular method loses `this` (DEV-GOTCHAS).
  protected trackByPaymentId = (_index: number, row: PendingRefund): number => row.paymentId;
}
