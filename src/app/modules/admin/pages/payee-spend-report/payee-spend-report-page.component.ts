import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { PayeeSpendReportStore } from './payee-spend-report.store';
import {
  PayeeSpendReportDto,
  PayeeSpendRowDto,
} from '../../../../shared/interfaces/payee-spend-report.interface';
import { EXPENSE_CATEGORY_CODES } from '../expenses/expenses-page.mappers';
import { formatMoney } from '../../../../shared/lib/money-display';

/** The `<select>` value that means "no filter" — an empty option value, not a magic number. */
const NO_FILTER = '';

/**
 * OBRS-1578 — the screen for `GET /admin/reports/expense-by-payee`. Structurally a sibling of
 * `VehiclePlReportPageComponent`: same store idiom, same `contentState` priority, same money
 * formatting.
 *
 * Three things here are the report's meaning rather than its decoration:
 *
 * 1. **The year filter opens on "ทุกปี" and every option carries its own total.** The owner ruled
 *    this on 2026-08-25 after seeing the draft: his second-largest payee is a lone 2025 bill, so a
 *    current-year default would hide it on first paint. Printing "2026 · 5 บิล · ฿16,559" inside the
 *    option makes the cost of narrowing visible BEFORE it is chosen rather than after.
 * 2. **The month control is inert while "ทุกปี" is selected.** "มกราคมของทุกปี" reads two ways and
 *    they are different reports, so the screen refuses to express it (and the endpoint refuses to
 *    answer it). Leaving a year clears the month rather than parking a stale one behind a disabled
 *    control.
 * 3. **The coverage line is not a footnote.** `expenses.payee_id` has been nullable and unbackfilled
 *    since V121, so bills entered before it exists have no payee — they get their own row and their
 *    share of the spend is stated out loud. A total that quietly showed only the recorded part would
 *    be the most convincing wrong number on the screen (AC2).
 */
@Component({
  selector: 'app-payee-spend-report-page',
  templateUrl: './payee-spend-report-page.component.html',
  styleUrl: './payee-spend-report-page.component.scss',
  standalone: false,
})
export class PayeeSpendReportPageComponent implements OnInit, OnDestroy {
  protected report: PayeeSpendReportDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';

  protected readonly skeletonRows = Array.from({ length: 5 });
  protected readonly categoryCodes = EXPENSE_CATEGORY_CODES;
  protected readonly monthNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  protected readonly noFilter = NO_FILTER;

  private readonly destroy$ = new Subject<void>();

  constructor(
    protected readonly store: PayeeSpendReportStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.report = data;
    });
    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isRefreshing = refreshing;
    });
    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.loadError = failed
        ? this.translate.instant('ADMIN.PAYEE_SPEND_REPORT.LOAD_FAILED')
        : '';
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

  protected get selectedYear(): string {
    const year = this.store.filter.year;
    return year === null ? NO_FILTER : String(year);
  }

  protected get selectedMonth(): string {
    const month = this.store.filter.month;
    return month === null ? NO_FILTER : String(month);
  }

  protected get selectedCategory(): string {
    return this.store.filter.category ?? NO_FILTER;
  }

  /** Inert, not hidden: the control stays visible so it is clear what selecting a year unlocks. */
  protected get isMonthDisabled(): boolean {
    return this.store.filter.year === null;
  }

  protected onYearChange(value: string): void {
    this.store.setYear(value === NO_FILTER ? null : Number(value));
  }

  protected onMonthChange(value: string): void {
    this.store.setMonth(value === NO_FILTER ? null : Number(value));
  }

  protected onCategoryChange(value: string): void {
    this.store.setCategory(value === NO_FILTER ? null : value);
  }

  protected get rows(): PayeeSpendRowDto[] {
    return this.report?.rows ?? [];
  }

  protected get unassignedRow(): PayeeSpendRowDto | null {
    return this.report?.unassigned ?? null;
  }

  /**
   * A 200 with no payee rows AND no unrecorded bills is a period with nothing in it. A period with
   * only unrecorded bills is NOT empty — it is the case the coverage line exists to describe, so it
   * must render rather than fall through to the empty state.
   */
  protected get isEmptyReport(): boolean {
    return this.rows.length === 0 && this.unassignedRow === null;
  }

  /** How much of the period's spend these rows actually account for, 0–100, floored. */
  protected get coveragePercent(): number {
    const total = Number(this.report?.totalAmount ?? '0');
    const assigned = Number(this.report?.assignedTotalAmount ?? '0');
    if (!Number.isFinite(total) || total <= 0) {
      return 0;
    }
    return Math.floor((assigned / total) * 100);
  }

  /** True while some of the period's spend has no payee on record — the AC2 banner's trigger. */
  protected get hasCoverageGap(): boolean {
    return this.unassignedRow !== null;
  }

  protected money(value: string | null | undefined): string {
    return formatMoney(value, this.translate.currentLang);
  }

  /** The bill's own words, joined — never re-interpreted into parts (that is OBRS-1613). */
  protected workText(row: PayeeSpendRowDto): string {
    return row.workDone.join(' · ');
  }

  protected yearOptionLabel(year: number, billCount: number, totalAmount: string): string {
    return this.translate.instant('ADMIN.PAYEE_SPEND_REPORT.YEAR_OPTION', {
      year,
      count: billCount,
      amount: this.money(totalAmount),
    });
  }
}
