import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { RevenueAnalyticsStore } from './revenue-analytics.store';
import {
  RevenueAnalyticsDto,
  RevenuePreviousPeriodDto,
  RevenueTrendPointDto,
} from '../../../../shared/interfaces/revenue-analytics.interface';
import { ReportsMoneyDto } from '../../../../shared/interfaces/reports-summary.interface';

const MAX_RANGE_SPAN_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * OBRS-151 — deep revenue analytics page. A sibling of ReportsPageComponent (OBRS-40): same
 * `[from, to]` range filter, SWR store, and money-formatting, but a revenue-only view — totals
 * KPIs, a period-over-period delta, and a daily net-revenue trend chart. Every percentage
 * (`netBarPct`, `netChangePct`) is server-computed, so this component does NO arithmetic on the
 * decimal-string money — it only formats for display and sizes bars from the server's bar %.
 */
@Component({
    selector: 'app-revenue-analytics-page',
    templateUrl: './revenue-analytics-page.component.html',
    styleUrl: './revenue-analytics-page.component.scss',
    standalone: false
})
export class RevenueAnalyticsPageComponent implements OnInit, OnDestroy {
  protected analytics: RevenueAnalyticsDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';
  protected rangeError = '';

  protected fromDate: Date | null = null;
  protected toDate: Date | null = null;

  protected readonly skeletonTiles = Array.from({ length: 3 });

  private readonly destroy$ = new Subject<void>();

  constructor(
    protected readonly store: RevenueAnalyticsStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    const range = this.store.range;
    this.fromDate = this.parseDateInputValue(range.from);
    this.toDate = this.parseDateInputValue(range.to);

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.analytics = data;
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

  protected get totals(): ReportsMoneyDto | null {
    return this.analytics?.totals ?? null;
  }

  protected get previousPeriod(): RevenuePreviousPeriodDto | null {
    return this.analytics?.previousPeriod ?? null;
  }

  protected get trend(): RevenueTrendPointDto[] {
    return this.analytics?.dailyTrend ?? [];
  }

  /** Single source of truth for the body — a state message never shows alongside stale tiles. */
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

  // ── Period-over-period (all values server-computed; no client math on money) ──
  protected get changePct(): number | null {
    return this.previousPeriod?.netChangePct ?? null;
  }

  protected get changeDirection(): 'up' | 'down' | 'flat' {
    const pct = this.changePct;
    if (pct === null || pct === 0) {
      return 'flat';
    }
    return pct > 0 ? 'up' : 'down';
  }

  protected changePctDisplay(pct: number): string {
    return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
  }

  // ── Trend chart geometry — bar height straight from the server's netBarPct ──
  protected barHeightPct(point: RevenueTrendPointDto): number {
    return Math.max(0, Math.min(100, point.netBarPct));
  }

  protected shortDate(iso: string): string {
    const parts = iso.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
  }

  protected trackByDate(_index: number, point: RevenueTrendPointDto): string {
    return point.date;
  }

  protected formatMoney(value: string, currency: string): string {
    const amount = Number(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'THB',
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  protected onFromDateChange(value: Date | null): void {
    this.fromDate = value;
    this.applyRange();
  }

  protected onToDateChange(value: Date | null): void {
    this.toDate = value;
    this.applyRange();
  }

  // Client guard first — never dispatch an invalid range to the store (mirrors ReportsPageComponent).
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

  // Server 400 backstop — branch on the stable errorCode (reuses the /summary range codes).
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
    return this.translate.instant('ADMIN.REVENUE_ANALYTICS.LOAD_FAILED');
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
