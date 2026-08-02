import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { BookingTrendStore } from './booking-trend.store';
import {
  BookingTrendDayOfWeekDto,
  BookingTrendDto,
  BookingTrendPeakDto,
  BookingTrendPointDto,
  BookingTrendPreviousPeriodDto,
} from '../../../../shared/interfaces/booking-trend.interface';

const MAX_RANGE_SPAN_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * OBRS-152 — booking trend analysis page. A sibling of ReportsPage/RevenueAnalyticsPage: same
 * `[from, to]` range filter + SWR store. Booking counts are plain integers (no money-string rule),
 * and every derived metric (moving average, bar %, day-of-week share, change %) is server-computed.
 */
@Component({
    selector: 'app-booking-trend-page',
    templateUrl: './booking-trend-page.component.html',
    styleUrl: './booking-trend-page.component.scss',
    standalone: false
})
export class BookingTrendPageComponent implements OnInit, OnDestroy {
  protected trend: BookingTrendDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';
  protected rangeError = '';

  protected fromDate: Date | null = null;
  protected toDate: Date | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    protected readonly store: BookingTrendStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    const range = this.store.range;
    this.fromDate = this.parseDateInputValue(range.from);
    this.toDate = this.parseDateInputValue(range.to);

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => (this.trend = data));
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

  protected get series(): BookingTrendPointDto[] {
    return this.trend?.series ?? [];
  }

  protected get byDayOfWeek(): BookingTrendDayOfWeekDto[] {
    return this.trend?.byDayOfWeek ?? [];
  }

  protected get previousPeriod(): BookingTrendPreviousPeriodDto | null {
    return this.trend?.previousPeriod ?? null;
  }

  protected get peak(): BookingTrendPeakDto | null {
    return this.trend?.peak ?? null;
  }

  /** Range total — a sum of integer booking counts (allowed; the decimal-string rule is money-only). */
  protected get totalBookings(): number {
    return this.series.reduce((sum, point) => sum + point.bookingCount, 0);
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

  // ── Period-over-period ──
  protected get changePct(): number | null {
    return this.previousPeriod?.changePct ?? null;
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

  // ── Charts — daily bars from the server barPct; day-of-week bars normalised to the busiest weekday ──
  protected barHeightPct(point: BookingTrendPointDto): number {
    return Math.max(0, Math.min(100, point.barPct));
  }

  private get maxDowShare(): number {
    return this.byDayOfWeek.reduce((max, d) => Math.max(max, d.sharePct), 0);
  }

  protected dowBarHeightPct(dow: BookingTrendDayOfWeekDto): number {
    const max = this.maxDowShare;
    return max > 0 ? Math.max(0, Math.min(100, (dow.sharePct / max) * 100)) : 0;
  }

  protected dowLabel(dow: number): string {
    // 2024-01-01 was a Monday (ISO dow 1); map dow → that weekday, formatted in the UI language.
    const monday = new Date(2024, 0, 1);
    const day = new Date(monday);
    day.setDate(monday.getDate() + (dow - 1));
    return new Intl.DateTimeFormat(this.translate.currentLang || 'en', { weekday: 'short' }).format(day);
  }

  protected shortDate(iso: string): string {
    const parts = iso.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
  }

  protected formatCount(value: number): string {
    return new Intl.NumberFormat(this.translate.currentLang || 'en').format(value);
  }

  protected trackByDate(_index: number, point: BookingTrendPointDto): string {
    return point.date;
  }

  protected trackByDow(_index: number, dow: BookingTrendDayOfWeekDto): number {
    return dow.dow;
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
    return this.translate.instant('ADMIN.BOOKING_TREND.LOAD_FAILED');
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
