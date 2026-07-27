import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { ManualRefundWorklistStore } from './manual-refund-worklist.store';
import { PendingRefund } from '../../../../shared/interfaces/payment.interface';
import { hasDestination, queueAgeDays, queueAgeSeverity } from './manual-refund-worklist-page.mappers';

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

  private readonly destroy$ = new Subject<void>();

  constructor(
    protected readonly store: ManualRefundWorklistStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
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

  protected queueAgeDays(row: PendingRefund): number | null {
    return queueAgeDays(row.queuedAt);
  }

  protected queueAgeSeverity(row: PendingRefund): string {
    return queueAgeSeverity(this.queueAgeDays(row));
  }

  protected formatMoney(value: number | string | undefined): string {
    const numeric = typeof value === 'string' ? parseFloat(value) : value ?? 0;
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 2,
    }).format(Number.isFinite(numeric) ? Number(numeric) : 0);
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
