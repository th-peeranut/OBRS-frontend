import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { VehiclePlReportStore } from './vehicle-pl-report.store';
import {
  VehiclePlReportDto,
  VehiclePlRowDto,
  VehiclePlTotalsDto,
} from '../../../../shared/interfaces/vehicle-pl-report.interface';

const MAX_RANGE_SPAN_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * OBRS-884 — the screen for `GET /admin/reports/pl-per-vehicle` (OBRS-841). Structurally a
 * sibling of `RefundVoidReportPageComponent`: same range filter, same `contentState`
 * priority, same expand-a-row idiom, same money formatting.
 *
 * Three things here are the report's meaning rather than its decoration, and are the reason
 * this screen exists at all:
 *
 * 1. **A ฿0 always carries its reason.** `zeroRevenueReason`/`zeroExpenseReason` below turn
 *    `ranInPeriod` and `expenseEntryCount` into the sentence the owner needs; `coverage`
 *    supplies the third source of ambiguity as a row badge. If every ฿0 rendered the same,
 *    OBRS-841's whole backend half would be wasted.
 * 2. **The two vehicle-less lines are shown apart from the fleet**, each with its own
 *    explanation — `UNASSIGNED_REVENUE` is an attribution gap, `CENTRAL_EXPENSE` is a real
 *    cost category, and they are never netted against each other.
 * 3. **Nothing here adds `amount` to `vatAmount`.** VAT is a component already inside the
 *    amounts (ADR-0115 §1) — the VAT figure is shown as "of which VAT", never as an addend.
 */
@Component({
    selector: 'app-vehicle-pl-report-page',
    templateUrl: './vehicle-pl-report-page.component.html',
    styleUrl: './vehicle-pl-report-page.component.scss',
    standalone: false
})
export class VehiclePlReportPageComponent implements OnInit, OnDestroy {
  protected report: VehiclePlReportDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';
  protected rangeError = '';

  protected fromDate: Date | null = null;
  protected toDate: Date | null = null;

  protected readonly skeletonRows = Array.from({ length: 7 });

  // Page-local UI state, not store state — the component is recreated on every navigation
  // (no RouteReuseStrategy) and is cleared whenever a new fetch replaces the rows array.
  // Keyed by number plate, which is unique per row and stable across a refresh.
  protected readonly expandedRows = new Set<string>();
  private previousRows: VehiclePlRowDto[] | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    protected readonly store: VehiclePlReportStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    const range = this.store.range;
    this.fromDate = this.parseDateInputValue(range.from);
    this.toDate = this.parseDateInputValue(range.to);

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      const rows = data?.rows ?? null;
      if (rows !== this.previousRows) {
        this.expandedRows.clear();
        this.previousRows = rows;
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

  protected get totals(): VehiclePlTotalsDto | null {
    return this.report?.totals ?? null;
  }

  protected get currency(): string {
    return this.totals?.currency ?? 'THB';
  }

  /** The fleet lines only — the two vehicle-less kinds are rendered separately below. */
  protected get vehicleRows(): VehiclePlRowDto[] {
    return (this.report?.rows ?? []).filter((row) => row.kind === 'VEHICLE');
  }

  protected get unassignedRevenueRow(): VehiclePlRowDto | null {
    return (this.report?.rows ?? []).find((row) => row.kind === 'UNASSIGNED_REVENUE') ?? null;
  }

  protected get centralExpenseRow(): VehiclePlRowDto | null {
    return (this.report?.rows ?? []).find((row) => row.kind === 'CENTRAL_EXPENSE') ?? null;
  }

  /**
   * A 200 with no rows at all is not an error — a fleet with nothing recorded in the period.
   * Note this is NOT "all the numbers are zero": a fleet of quiet buses is real data and
   * must still render, because each of those zeros carries a different reason.
   */
  protected get isEmptyReport(): boolean {
    return !!this.report && this.report.rows.length === 0;
  }

  /** Same priority order as `RefundVoidReportPageComponent`: a state message never shows
   * alongside a stale or zero table. */
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

  protected rowKey(row: VehiclePlRowDto): string {
    return row.numberPlate ?? row.kind;
  }

  protected isExpanded(row: VehiclePlRowDto): boolean {
    return this.expandedRows.has(this.rowKey(row));
  }

  protected toggleExpand(row: VehiclePlRowDto): void {
    const key = this.rowKey(row);
    if (this.expandedRows.has(key)) {
      this.expandedRows.delete(key);
    } else {
      this.expandedRows.add(key);
    }
  }

  /** The label for a vehicle line: the server's `header` when it has one, else the plate. */
  protected rowLabel(row: VehiclePlRowDto): string {
    return row.header || row.numberPlate || '';
  }

  /**
   * The coverage badge, or `null` when the service window is known and overlaps the period
   * (in which case a ฿0 is a real zero and needs no caveat).
   */
  protected coverageWarningKey(row: VehiclePlRowDto): string | null {
    if (row.coverage === 'SERVICE_WINDOW_UNKNOWN') {
      return 'ADMIN.VEHICLE_PL_REPORT.COVERAGE.SERVICE_WINDOW_UNKNOWN';
    }
    if (row.coverage === 'OUTSIDE_SERVICE_WINDOW') {
      return 'ADMIN.VEHICLE_PL_REPORT.COVERAGE.OUTSIDE_SERVICE_WINDOW';
    }
    return null;
  }

  /**
   * "This bus ran and sold nothing" vs. "OBRS has no round on record for it" — the same ฿0
   * on screen, two different things for the owner to do about it. `null` when the revenue is
   * not zero and there is nothing to explain.
   *
   * OBRS-1526: the false branch says what OBRS KNOWS, never what the bus did. `ranInPeriod`
   * is computed from the revenue matrix, so it is false for every period before go-live by
   * construction — there are no bookings and no schedules back there. Wording it as "did not
   * run" made this screen assert, of years the owner's books show the fleet working, that it
   * never moved.
   */
  protected zeroRevenueReasonKey(row: VehiclePlRowDto): string | null {
    if (!this.isZero(row.revenue)) {
      return null;
    }
    return row.ranInPeriod
      ? 'ADMIN.VEHICLE_PL_REPORT.ZERO.RAN_NO_REVENUE'
      : 'ADMIN.VEHICLE_PL_REPORT.ZERO.DID_NOT_RUN';
  }

  /** The cost-side twin: entered as zero, or never entered at all. */
  protected zeroExpenseReasonKey(row: VehiclePlRowDto): string | null {
    if (!this.isZero(row.expenseTotal)) {
      return null;
    }
    return row.expenseEntryCount > 0
      ? 'ADMIN.VEHICLE_PL_REPORT.ZERO.ENTERED_AS_ZERO'
      : 'ADMIN.VEHICLE_PL_REPORT.ZERO.NO_ENTRIES';
  }

  /** Imported pre-go-live money is a COMPONENT of `revenue` (OBRS-1508) — shown as "of
   * which", so it is never read as something to add on top. */
  protected hasHistoricalRevenue(row: VehiclePlRowDto): boolean {
    return !this.isZero(row.historicalRevenue);
  }

  protected categoryLabel(category: string): string {
    return this.translate.instant(`ADMIN.EXPENSES.CATEGORIES.${category}`);
  }

  protected isNegative(value: string): boolean {
    return Number(value) < 0;
  }

  // Arrow-function class property, NOT a bare method — NgForOf's DefaultIterableDiffer
  // invokes `trackBy` DETACHED from the component instance (see the sibling report pages).
  protected readonly trackByRow = (_index: number, row: VehiclePlRowDto): string =>
    this.rowKey(row);

  // Copied verbatim from the sibling report pages' formatMoney — same money-string ->
  // localized-currency formatting. Never do arithmetic on the decimal-string amounts.
  protected formatMoney(value: string, currency: string): string {
    const amount = Number(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  private isZero(value: string): boolean {
    return Number(value) === 0;
  }

  // Client guard first, copied verbatim from `RefundVoidReportPageComponent.applyRange()`.
  private applyRange(): void {
    this.rangeError = '';

    if (!this.fromDate || !this.toDate) {
      return;
    }

    const from = this.toDateInputValue(this.fromDate);
    const to = this.toDateInputValue(this.toDate);

    if (from > to) {
      this.rangeError = this.translate.instant('ADMIN.VEHICLE_PL_REPORT.ERROR.RANGE_INVALID');
      return;
    }

    const spanDays = Math.round((this.toDate.getTime() - this.fromDate.getTime()) / MS_PER_DAY);
    if (spanDays > MAX_RANGE_SPAN_DAYS) {
      this.rangeError = this.translate.instant('ADMIN.VEHICLE_PL_REPORT.ERROR.RANGE_TOO_LARGE');
      return;
    }

    this.store.setRange(from, to);
  }

  private resolveLoadError(failed: boolean): string {
    if (!failed || this.store.hasValue) {
      return '';
    }
    return this.translate.instant('ADMIN.VEHICLE_PL_REPORT.LOAD_FAILED');
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
