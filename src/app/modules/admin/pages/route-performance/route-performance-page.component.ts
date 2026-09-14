import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { RoutePerformanceStore } from './route-performance.store';
import {
  RoutePerformanceDto,
  RoutePerformanceRowDto,
  RoutePerformanceTotalsDto,
} from '../../../../shared/interfaces/route-performance.interface';
import { formatMoney } from '../../../../shared/lib/money-display';
import { DateRange } from '../../../../shared/components/date-range-picker/date-range-picker.component';
import { dateRangeErrorKey } from '../../../../shared/lib/date-range-guard';
import { toDateControlValue, toDateInputValue } from '../../../../shared/lib/date-input-value';

/**
 * OBRS-153 — route performance page. Same `[from, to]` range filter + SWR store as the other
 * report pages. Per-route table (departures / tickets sold / net revenue / revenue share) ordered
 * by net revenue, plus totals tiles. Bars use the server `revenueSharePct`; money is display-only.
 */
@Component({
    selector: 'app-route-performance-page',
    templateUrl: './route-performance-page.component.html',
    styleUrl: './route-performance-page.component.scss',
    standalone: false
})
export class RoutePerformancePageComponent implements OnInit, OnDestroy {
  protected data: RoutePerformanceDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';
  protected rangeError = '';
  protected fromDate: Date | null = null;
  protected toDate: Date | null = null;
  protected readonly skeletonRows = Array.from({ length: 5 });

  private readonly destroy$ = new Subject<void>();

  constructor(
    protected readonly store: RoutePerformanceStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    const range = this.store.range;
    this.fromDate = toDateControlValue(range.from);
    this.toDate = toDateControlValue(range.to);
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((d) => (this.data = d));
    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((r) => (this.isRefreshing = r));
    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((f) => (this.loadError = this.resolveLoadError(f)));
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  protected get routes(): RoutePerformanceRowDto[] {
    return this.data?.routes ?? [];
  }

  protected get totals(): RoutePerformanceTotalsDto | null {
    return this.data?.totals ?? null;
  }

  protected get contentState(): 'loading' | 'invalid' | 'error' | 'data' {
    if (this.rangeError) {
      return 'invalid';
    }
    if (this.isLoading) {
      return 'loading';
    }
    if (this.loadError) {
      return 'error';
    }
    return 'data';
  }

  protected shareBarPct(row: RoutePerformanceRowDto): number {
    return Math.max(0, Math.min(100, row.revenueSharePct));
  }

  protected sharePctDisplay(pct: number): string {
    return `${pct.toFixed(1)}%`;
  }

  protected formatMoney(value: string): string {
    const amount = Number(value);
    return formatMoney(Number.isFinite(amount) ? amount : 0, this.translate.currentLang);
  }

  protected formatCount(value: number): string {
    return new Intl.NumberFormat(this.translate.currentLang || 'en').format(value);
  }

  protected trackByRouteId(_index: number, row: RoutePerformanceRowDto): number {
    return row.routeId;
  }

  protected onRangeChange(range: DateRange): void {
    this.fromDate = range.from;
    this.toDate = range.to;
    this.applyRange();
  }

  private applyRange(): void {
    this.rangeError = '';
    if (!this.fromDate || !this.toDate) {
      return;
    }
    const from = toDateInputValue(this.fromDate);
    const to = toDateInputValue(this.toDate);
    const errorKey = dateRangeErrorKey(
      this.fromDate,
      this.toDate,
      from,
      to,
      'ADMIN.REPORTS.ERROR'
    );
    if (errorKey) {
      this.rangeError = this.translate.instant(errorKey);
      return;
    }
    this.store.setRange(from, to);
  }

  private resolveLoadError(failed: boolean): string {
    if (!failed || this.store.hasValue) {
      return '';
    }
    const code = this.store.lastErrorCode;
    if (code === 'REPORT_RANGE_INVALID') {
      return this.translate.instant('ADMIN.REPORTS.ERROR.RANGE_INVALID');
    }
    if (code === 'REPORT_RANGE_TOO_LARGE') {
      return this.translate.instant('ADMIN.REPORTS.ERROR.RANGE_TOO_LARGE');
    }
    return this.translate.instant('ADMIN.ROUTE_PERFORMANCE.LOAD_FAILED');
  }
}
