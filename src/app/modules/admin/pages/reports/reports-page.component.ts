import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { ReportsStore } from './reports.store';
import {
  ReportsDailyRowDto,
  ReportsSummaryDto,
  ReportsTilesDto,
} from '../../../../shared/interfaces/reports-summary.interface';

const MAX_RANGE_SPAN_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-reports-page',
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss',
})
export class ReportsPageComponent implements OnInit, OnDestroy {
  protected summary: ReportsSummaryDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';
  protected rangeError = '';

  protected fromDate: Date | null = null;
  protected toDate: Date | null = null;

  protected readonly skeletonRows = Array.from({ length: 7 });

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: ReportsStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    const range = this.store.range;
    this.fromDate = this.parseDateInputValue(range.from);
    this.toDate = this.parseDateInputValue(range.to);

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.summary = data;
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

  protected get tiles(): ReportsTilesDto | null {
    return this.summary?.tiles ?? null;
  }

  protected get dailyRows(): ReportsDailyRowDto[] {
    return this.summary?.daily ?? [];
  }

  /**
   * Off the PRESENCE of `tiles.revenue`, not a client-side role check —
   * forward-compatible with OBRS-129 (the field is simply omitted by the
   * server for a viewer without revenue visibility).
   */
  protected get showRevenue(): boolean {
    return !!this.tiles?.revenue;
  }

  /**
   * A 200 with a genuinely empty range is not an error — a friendly note, not a
   * warning. "Empty" means NO activity of any kind: no bookings created and no
   * seats sold on any departure in range. Occupancy keys on departure-date, so a
   * range can have real occupancy while bookingCount/ticketsSold (booking-date
   * basis) are 0 — that is NOT empty, and must not show the "no activity" note.
   */
  protected get isEmptyRange(): boolean {
    const t = this.tiles;
    return !!t && t.bookingCount === 0 && t.ticketsSold === 0 && t.occupancyRatePct === 0;
  }

  protected onFromDateChange(value: Date | null): void {
    this.fromDate = value;
    this.applyRange();
  }

  protected onToDateChange(value: Date | null): void {
    this.toDate = value;
    this.applyRange();
  }

  protected occupancyDisplay(pct: number): string {
    return `${pct.toFixed(1)}%`;
  }

  protected get revenueTileDisplay(): string {
    const revenue = this.tiles?.revenue;
    return revenue ? this.formatMoney(revenue.net, revenue.currency) : '';
  }

  protected formatMoney(value: string, currency: string): string {
    const amount = Number(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  protected trackByDate(_index: number, row: ReportsDailyRowDto): string {
    return row.date;
  }

  // Client guard first (design-system §9-adjacent: never trust raw input into
  // a service call). Only a range that passes both checks is dispatched to
  // the store; an invalid one shows an inline warning and does NOT dispatch.
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

  // Server 400 backstop — branches on the stable errorCode, never the
  // localized message (design-system §9). Only meaningful when there is no
  // cached value to fall back on; a background revalidate failure keeps
  // showing the cached data (usability-reports precedent).
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
    return this.translate.instant('ADMIN.REPORTS.LOAD_FAILED');
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
