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

const MAX_RANGE_SPAN_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * OBRS-153 — route performance page. Same `[from, to]` range filter + SWR store as the other
 * report pages. Per-route table (departures / tickets sold / net revenue / revenue share) ordered
 * by net revenue, plus totals tiles. Bars use the server `revenueSharePct`; money is display-only.
 */
@Component({
  selector: 'app-route-performance-page',
  templateUrl: './route-performance-page.component.html',
  styleUrl: './route-performance-page.component.scss',
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
    this.fromDate = this.parseDateInputValue(range.from);
    this.toDate = this.parseDateInputValue(range.to);
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

  protected formatMoney(value: string, currency: string): string {
    const amount = Number(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'THB',
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  protected formatCount(value: number): string {
    return new Intl.NumberFormat(this.translate.currentLang || 'en').format(value);
  }

  protected trackByRouteId(_index: number, row: RoutePerformanceRowDto): number {
    return row.routeId;
  }

  protected onFromDateChange(value: Date | null): void {
    this.fromDate = value;
    this.applyRange();
  }

  protected onToDateChange(value: Date | null): void {
    this.toDate = value;
    this.applyRange();
  }

  private applyRange(): void {
    this.rangeError = '';
    if (!this.fromDate || !this.toDate) {
      return;
    }
    const from = this.toDateInputValue(this.fromDate);
    const to = this.toDateInputValue(this.toDate);
    if (from > to) {
      this.rangeError = this.translate.instant('ADMIN.REPORTS.ERROR.RANGE_INVALID');
      return;
    }
    const spanDays = Math.round((this.toDate.getTime() - this.fromDate.getTime()) / MS_PER_DAY);
    if (spanDays > MAX_RANGE_SPAN_DAYS) {
      this.rangeError = this.translate.instant('ADMIN.REPORTS.ERROR.RANGE_TOO_LARGE');
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

  private toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDateInputValue(value: string): Date | null {
    const parts = value.split('-');
    if (parts.length !== 3) {
      return null;
    }
    const [year, month, day] = parts.map(Number);
    return new Date(year, month - 1, day);
  }
}
