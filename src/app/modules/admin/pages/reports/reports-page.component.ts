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
import { ParcelShareMonthlyStore } from './parcel-share-monthly.store';
import { ParcelShareMonthlyRowDto } from '../../../../services/admin/admin-api.service';
import { PerHeadEarningsStore } from './per-head-earnings.store';
import {
  PerHeadEarningHolderDto,
  PerHeadEarningsGranularity,
  PerHeadEarningsRespDto,
} from '../../../../shared/interfaces/driver-cash.interface';
import { formatMoney } from '../../../../shared/lib/money-display';

const MAX_RANGE_SPAN_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Component({
    selector: 'app-reports-page',
    templateUrl: './reports-page.component.html',
    styleUrl: './reports-page.component.scss',
    standalone: false
})
export class ReportsPageComponent implements OnInit, OnDestroy {
  protected summary: ReportsSummaryDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';
  protected rangeError = '';

  protected fromDate: Date | null = null;
  protected toDate: Date | null = null;

  protected readonly skeletonRows = Array.from({ length: 7 });

  // ── OBRS-960: parcel-share monthly totals (own section, below the daily table) ──
  protected parcelShareMonthlyRows: ParcelShareMonthlyRowDto[] = [];
  protected isParcelShareMonthlyLoading = false;
  protected selectedYear: number;
  protected selectedMonth: number;
  protected readonly yearOptions: { value: string; label: string }[];
  protected readonly monthOptions: { value: string; label: string }[] = Array.from(
    { length: 12 },
    (_, i) => ({ value: String(i + 1), label: String(i + 1) })
  );

  // ── OBRS-1147: per-head EARNINGS by person (own section) ──────────────────
  // ⛔ This is staff PAY, not the owner's revenue. The EOD-by-salesperson report
  // on this same page is the owner's takings attributed to whoever sold them —
  // the two travel in opposite directions and must never be reconciled.
  protected perHeadEarnings: PerHeadEarningsRespDto | null = null;
  protected isPerHeadEarningsLoading = false;
  protected perHeadGranularity: PerHeadEarningsGranularity = 'MONTH';
  protected readonly perHeadGranularityOptions: { value: string; label: string }[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    protected readonly store: ReportsStore,
    private readonly parcelShareMonthlyStore: ParcelShareMonthlyStore,
    private readonly perHeadEarningsStore: PerHeadEarningsStore,
    private readonly translate: TranslateService
  ) {
    const period = this.parcelShareMonthlyStore.period;
    this.selectedYear = period.year;
    this.selectedMonth = period.month;
    this.yearOptions = Array.from({ length: 5 }, (_, i) => {
      const year = period.year - 2 + i;
      return { value: String(year), label: String(year) };
    });
    this.perHeadGranularityOptions = (['DAY', 'MONTH', 'YEAR'] as const).map((value) => ({
      value,
      label: this.translate.instant(`ADMIN.REPORTS.PER_HEAD_EARNINGS.GRANULARITY.${value}`),
    }));
  }

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

    this.parcelShareMonthlyStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.parcelShareMonthlyRows = data ?? [];
    });
    this.parcelShareMonthlyStore.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isParcelShareMonthlyLoading = refreshing;
    });
    void this.parcelShareMonthlyStore.refresh();

    this.perHeadEarningsStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.perHeadEarnings = data;
    });
    this.perHeadEarningsStore.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isPerHeadEarningsLoading = refreshing;
    });
    // Driven by the page's own from/to pickers rather than a third set of date
    // fields — the owner asked "who earned what over THIS period", and two
    // ranges on one page is two answers to that question.
    this.applyPerHeadRange();
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

  /**
   * Single source of truth for what the body renders, so a state message never
   * shows ALONGSIDE a stale/zero table (which reads as "there is data"). Priority:
   * an invalid range (client guard) or a fetch error replaces the tiles+table
   * entirely with the message; an empty (but valid) range keeps the zero tiles as
   * a summary but replaces the daily table with the "no activity" note.
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
    if (this.isEmptyRange) {
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

  protected occupancyDisplay(pct: number): string {
    return `${pct.toFixed(1)}%`;
  }

  protected get revenueTileDisplay(): string {
    const revenue = this.tiles?.revenue;
    return revenue ? this.formatMoney(revenue.net) : '';
  }

  protected formatMoney(value: string): string {
    const amount = Number(value);
    return formatMoney(Number.isFinite(amount) ? amount : 0, this.translate.currentLang);
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
    this.applyPerHeadRange();
  }

  // ── OBRS-1147: per-head earnings by person ───────────────────────────────

  // OBRS-1631: same placeholder row, and here the `as` cast is what hides the empty string from
  // the compiler — `'' as PerHeadEarningsGranularity` reaches setQuery as a blank granularity.
  protected onPerHeadGranularityChange(value: string): void {
    const granularity = String(value ?? '').trim();
    if (!granularity) {
      return;
    }
    this.perHeadGranularity = granularity as PerHeadEarningsGranularity;
    this.applyPerHeadRange();
  }

  protected get perHeadHolders(): PerHeadEarningHolderDto[] {
    return this.perHeadEarnings?.holders ?? [];
  }

  protected trackByHolder(_index: number, row: PerHeadEarningHolderDto): string {
    // The role is part of the key for the same reason it is part of the
    // backend's grouping: one person can appear twice, once per role.
    return `${row.holderId}|${row.holderRole}`;
  }

  protected holderDisplayName(row: PerHeadEarningHolderDto): string {
    return row.holderName ?? `#${row.holderId}`;
  }

  private applyPerHeadRange(): void {
    if (!this.fromDate || !this.toDate) {
      return;
    }
    const from = this.toDateInputValue(this.fromDate);
    const to = this.toDateInputValue(this.toDate);
    if (from > to) {
      return;
    }
    this.perHeadEarningsStore.setQuery(from, to, this.perHeadGranularity);
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

  // ── OBRS-960: parcel-share monthly totals ────────────────────────────────

  // OBRS-1631: `app-admin-dropdown` renders its own `[placeholder]` as a clickable row that emits
  // `''`, and design-system §3.1 item 2 requires that row — so the guard belongs here, not there.
  // `Number('')` is 0, not NaN, so without it a click on "ปี" asked for year 0. Same shape as the
  // guard OBRS-1626 put on /admin/expenses, deliberately, so the two screens behave identically.
  protected onYearChange(value: string): void {
    const year = String(value ?? '').trim();
    if (!year) {
      return;
    }
    this.selectedYear = Number(year);
    this.parcelShareMonthlyStore.setPeriod(this.selectedYear, this.selectedMonth);
  }

  protected onMonthChange(value: string): void {
    const month = String(value ?? '').trim();
    if (!month) {
      return;
    }
    this.selectedMonth = Number(month);
    this.parcelShareMonthlyStore.setPeriod(this.selectedYear, this.selectedMonth);
  }

  /**
   * OBRS-1009: `payeeUserId` is null on the report's "no salesperson — the driver kept it" rows,
   * and a month can carry more than one of them (one per cause). Tracking by the id alone gave
   * every such row the same key, which `@for` rejects as a duplicate — so the index is the
   * tie-breaker for exactly those rows, and real payees keep their stable id.
   */
  protected trackByPayeeId(index: number, row: ParcelShareMonthlyRowDto): number | string {
    return row.payeeUserId ?? `fallback-${index}`;
  }

  protected get selectedYearStr(): string {
    return String(this.selectedYear);
  }

  protected get selectedMonthStr(): string {
    return String(this.selectedMonth);
  }
}
