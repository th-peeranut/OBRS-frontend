import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { RefundVoidReportStore } from './refund-void-report.store';
import {
  RefundVoidDailyRowDto,
  RefundVoidReportDto,
  RefundVoidSummaryDto,
} from '../../../../shared/interfaces/refund-void-report.interface';

const MAX_RANGE_SPAN_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-refund-void-report-page',
  templateUrl: './refund-void-report-page.component.html',
  styleUrl: './refund-void-report-page.component.scss',
})
export class RefundVoidReportPageComponent implements OnInit, OnDestroy {
  protected report: RefundVoidReportDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';
  protected rangeError = '';

  protected fromDate: Date | null = null;
  protected toDate: Date | null = null;

  protected readonly skeletonRows = Array.from({ length: 7 });

  // Row-expand state is page-local UI state (not store state) — the component is
  // destroyed and recreated on every navigation (no RouteReuseStrategy), so it always
  // starts empty on entry; it's also explicitly cleared below whenever the `daily`
  // array's identity changes (a new fetch). Mirrors EodSalesReportPageComponent's
  // previousSalespersons idiom, keyed by `row.date` (dense/unique per day) instead of
  // a synthetic numeric id.
  protected readonly expandedRows = new Set<string>();
  private previousDaily: RefundVoidDailyRowDto[] | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: RefundVoidReportStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    const range = this.store.range;
    this.fromDate = this.parseDateInputValue(range.from);
    this.toDate = this.parseDateInputValue(range.to);

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      const daily = data?.daily ?? null;
      if (daily !== this.previousDaily) {
        this.expandedRows.clear();
        this.previousDaily = daily;
      }
      this.report = data;
    });

    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isRefreshing = refreshing;
    });

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.loadError = this.resolveLoadError(failed);
    });

    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  protected get summary(): RefundVoidSummaryDto | null {
    return this.report?.summary ?? null;
  }

  protected get dailyRows(): RefundVoidDailyRowDto[] {
    return this.report?.daily ?? [];
  }

  protected get currency(): string {
    return this.summary?.currency ?? 'THB';
  }

  /**
   * A 200 whose three partitions (refunded / manualRefundPending / voided) are all
   * zero-count is not an error — a friendly note, not a warning.
   */
  protected get isEmptyReport(): boolean {
    const s = this.summary;
    return (
      !!s && s.refunded.count === 0 && s.manualRefundPending.count === 0 && s.voided.count === 0
    );
  }

  /**
   * Single source of truth for what the body renders, so a state message never shows
   * ALONGSIDE a stale/zero table. Priority: invalid range (client guard), then
   * loading, then error, then empty, then data — mirrors ReportsPageComponent.
   */
  protected get contentState(): 'loading' | 'invalid' | 'error' | 'empty' | 'data' {
    if (this.rangeError) {
      return 'invalid';
    }
    if (this.isLoading) {
      return 'loading';
    }
    if (this.loadError) {
      return 'error';
    }
    if (this.isEmptyReport) {
      return 'empty';
    }
    return 'data';
  }

  protected onFromDateChange(value: Date | null): void {
    this.fromDate = value;
    this.applyRange();
  }

  protected onToDateChange(value: Date | null): void {
    this.toDate = value;
    this.applyRange();
  }

  protected isExpanded(row: RefundVoidDailyRowDto): boolean {
    return this.expandedRows.has(row.date);
  }

  protected toggleExpand(row: RefundVoidDailyRowDto): void {
    if (this.expandedRows.has(row.date)) {
      this.expandedRows.delete(row.date);
    } else {
      this.expandedRows.add(row.date);
    }
  }

  // Arrow-function class property, NOT a bare method — NgForOf's DefaultIterableDiffer
  // stores/invokes `trackBy` DETACHED from the component instance, so a bare
  // `protected trackByRow(...)` method passed as `trackBy: trackByRow` would run with
  // `this === undefined`. See eod-sales-report-page.component.ts's trackByRow (OBRS-231)
  // and this page's "(template rendering)" spec block, which exercises the real
  // template-driven trackBy invocation path.
  protected readonly trackByRow = (_index: number, row: RefundVoidDailyRowDto): string =>
    row.date;

  // Copied verbatim from ReportsPageComponent/EodSalesReportPageComponent.formatMoney —
  // same money-string -> localized-currency formatting. Never do arithmetic on the
  // decimal-string amounts, only format for display.
  protected formatMoney(value: string, currency: string): string {
    const amount = Number(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  // Client guard first (design-system §9-adjacent: never trust raw input into a
  // service call), copied verbatim from ReportsPageComponent.applyRange(). Only a
  // range that passes both checks is dispatched to the store; an invalid one shows
  // an inline warning and does NOT dispatch.
  private applyRange(): void {
    this.rangeError = '';

    if (!this.fromDate || !this.toDate) {
      return;
    }

    const from = this.toDateInputValue(this.fromDate);
    const to = this.toDateInputValue(this.toDate);

    if (from > to) {
      this.rangeError = this.translate.instant('ADMIN.REFUND_VOID_REPORT.ERROR.RANGE_INVALID');
      return;
    }

    const spanDays = Math.round((this.toDate.getTime() - this.fromDate.getTime()) / MS_PER_DAY);
    if (spanDays > MAX_RANGE_SPAN_DAYS) {
      this.rangeError = this.translate.instant(
        'ADMIN.REFUND_VOID_REPORT.ERROR.RANGE_TOO_LARGE'
      );
      return;
    }

    this.store.setRange(from, to);
  }

  // Server failure backstop. No range-specific error codes are documented for this
  // endpoint — only meaningful when there's no cached value to fall back on; a
  // background revalidate failure keeps showing cached data.
  private resolveLoadError(failed: boolean): string {
    if (!failed || this.store.hasValue) {
      return '';
    }
    return this.translate.instant('ADMIN.REFUND_VOID_REPORT.LOAD_FAILED');
  }

  private toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDateInputValue(value: string): Date | null {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) {
      return null;
    }
    return new Date(year, month - 1, day);
  }
}
