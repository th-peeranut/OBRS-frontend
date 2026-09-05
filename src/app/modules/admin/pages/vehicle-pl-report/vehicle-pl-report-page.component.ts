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
import { formatMoney } from '../../../../shared/lib/money-display';
import { centsToDecimalString, toSignedCents } from '../../../../shared/lib/money-cents';
import { DateRange } from '../../../../shared/components/date-range-picker/date-range-picker.component';

const MAX_RANGE_SPAN_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * OBRS-1725 - how many cost categories get a slice of the donut and a column of the
 * table to themselves before the rest are folded into one line. Four is the layout the
 * owner approved, and it is also about as many fills as a donut this size keeps apart;
 * sixteen categories exist, so folding is the normal case rather than the edge one.
 */
const NAMED_COST_CATEGORIES = 4;

/** How many vehicles the margin ranking shows. */
const TOP_MARGIN_ROWS = 5;

/** Donut geometry, shared with the template so the dash maths and the drawn circle
 * cannot drift apart. */
const DONUT_RADIUS = 60;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

/** One slice of the company-wide cost mix. `categoryKey` is null on the folded slice. */
interface CostMixSlice {
  categoryKey: string | null;
  foldedCount: number;
  amount: string;
  percent: number;
  seriesIndex: number;
  dash: number;
  offset: number;
}

/** One bar of the per-vehicle margin ranking. */
interface MarginBar {
  label: string;
  margin: string;
  widthPercent: number;
  negative: boolean;
}

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

  // OBRS-1725: the two pictures and the table's data-driven cost columns. Derived from
  // the rows the server already sent - see `recomputeDerived`.
  protected costMix: CostMixSlice[] = [];
  protected marginBars: MarginBar[] = [];
  protected costColumns: string[] = [];
  protected foldedColumnCount = 0;

  protected readonly donutRadius = DONUT_RADIUS;
  protected readonly donutCircumference = DONUT_CIRCUMFERENCE;

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
      this.recomputeDerived(data);
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

  protected onRangeChange(range: DateRange): void {
    this.fromDate = range.from;
    this.toDate = range.to;
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

  /** A slice's label: the category's own name, or "N more categories" for the folded one. */
  protected sliceLabel(slice: CostMixSlice): string {
    return slice.categoryKey
      ? this.categoryLabel(slice.categoryKey)
      : this.translate.instant('ADMIN.VEHICLE_PL_REPORT.COST_MIX.FOLDED', {
          count: slice.foldedCount,
        });
  }

  /**
   * What this vehicle spent in this category, or `null` when the server sent no line for
   * it. The table must not render those the same: a `0.00` line means somebody entered a
   * zero, no line at all means nobody entered anything - the same distinction
   * `zeroExpenseReasonKey` already makes for the row's total.
   */
  protected categoryAmount(row: VehiclePlRowDto, category: string): string | null {
    return row.expensesByCategory.find((line) => line.category === category)?.amount ?? null;
  }

  /** The same cell for the folded column: this row's lines outside `costColumns`. */
  protected foldedAmount(row: VehiclePlRowDto): string | null {
    const folded = row.expensesByCategory.filter(
      (line) => !this.costColumns.includes(line.category)
    );
    if (folded.length === 0) {
      return null;
    }
    return centsToDecimalString(folded.reduce((sum, line) => sum + this.cents(line.amount), 0));
  }

  /** The skeleton and detail rows span the whole table, and its width is now data-driven. */
  protected get columnCount(): number {
    return 5 + this.costColumns.length + (this.foldedColumnCount > 0 ? 1 : 0);
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
  protected formatMoney(value: string): string {
    const amount = Number(value);
    return formatMoney(Number.isFinite(amount) ? amount : 0, this.translate.currentLang);
  }

  private isZero(value: string): boolean {
    return Number(value) === 0;
  }

  /**
   * OBRS-1725. Both pictures are DERIVED from the rows already on screen - no second
   * request, and no money figure the response does not already carry. Recomputed once per
   * emission rather than in a getter, because each pass walks every row's category list
   * and a getter would re-walk it on every change-detection cycle.
   *
   * The arithmetic is integer CENTS through `money-cents.ts` (OBRS-960), which is the
   * thing the interface's "never do arithmetic on the amounts" is protecting against:
   * adding the decimal strings as floats is how `0.1 + 0.2 !== 0.3` gets into a report.
   * Summing them exactly invents nothing either - `totals.expenses` IS the sum of every
   * row's `expensesByCategory[].amount` on the server side (`ReportService.rollUpExpenses`
   * builds the lines and the total from the same projections), so the donut divides up
   * exactly the number the card above it prints.
   */
  private recomputeDerived(data: VehiclePlReportDto | null): void {
    const rows = data?.rows ?? [];
    this.costMix = this.buildCostMix(rows);

    // Only the fleet's own categories get a column - this table has no central-expense
    // row to put one on.
    const perVehicle = this.rankCategories(rows.filter((row) => row.kind === 'VEHICLE'));
    this.costColumns = perVehicle.slice(0, NAMED_COST_CATEGORIES).map(([category]) => category);
    this.foldedColumnCount = Math.max(perVehicle.length - NAMED_COST_CATEGORIES, 0);

    this.marginBars = this.buildMarginBars(rows);
  }

  /**
   * The categories present in these rows, biggest first. A category with no money in it
   * is dropped rather than ranked: the server sends no line at all for a category with no
   * entries, so a zero here would be one somebody explicitly entered - not a slice of
   * anything. A negative total is dropped for the reason a donut cannot draw one;
   * expenses are stored non-negative, so that is a guard and not a case.
   */
  private rankCategories(rows: VehiclePlRowDto[]): Array<[string, number]> {
    const byCategory = new Map<string, number>();
    for (const row of rows) {
      for (const line of row.expensesByCategory) {
        byCategory.set(
          line.category,
          (byCategory.get(line.category) ?? 0) + this.cents(line.amount)
        );
      }
    }
    return [...byCategory.entries()].filter(([, cents]) => cents > 0).sort((a, b) => b[1] - a[1]);
  }

  /**
   * Every row's costs, the central ones included: the mix answers "where did the company's
   * money go", and a central cost is money that went somewhere. They are still never
   * averaged onto a bus - that is the table below, which excludes them.
   */
  private buildCostMix(rows: VehiclePlRowDto[]): CostMixSlice[] {
    const ranked = this.rankCategories(rows);
    if (ranked.length === 0) {
      return [];
    }

    const named = ranked.slice(0, NAMED_COST_CATEGORIES);
    const folded = ranked.slice(NAMED_COST_CATEGORIES);
    const parts: Array<{ categoryKey: string | null; foldedCount: number; cents: number }> =
      named.map(([category, cents]) => ({ categoryKey: category, foldedCount: 0, cents }));
    if (folded.length > 0) {
      parts.push({
        categoryKey: null,
        foldedCount: folded.length,
        cents: folded.reduce((sum, [, cents]) => sum + cents, 0),
      });
    }

    const totalCents = parts.reduce((sum, part) => sum + part.cents, 0);
    const percents = this.roundedPercents(
      parts.map((part) => part.cents),
      totalCents
    );
    let offset = 0;
    return parts.map((part, index) => {
      const share = part.cents / totalCents;
      const dash = share * DONUT_CIRCUMFERENCE;
      const slice: CostMixSlice = {
        categoryKey: part.categoryKey,
        foldedCount: part.foldedCount,
        amount: centsToDecimalString(part.cents),
        // The arc is drawn from `share`, never from this rounded percent, so the picture
        // cannot disagree with the number printed beside it.
        percent: percents[index],
        seriesIndex: index + 1,
        dash,
        offset,
      };
      offset += dash;
      return slice;
    });
  }

  /**
   * Percentages that add up to exactly 100.0. Rounding each share on its own is the
   * obvious way and it is the wrong way here: the first capture of this screen printed
   * `50.2 + 19.3 + 14.2 + 8.0 + 8.4 = 100.1`, which on a report whose whole job is
   * arithmetic reads as an arithmetic mistake. Largest remainder gives the leftover
   * tenths to the slices that lost the most in rounding, so no figure moves by more
   * than 0.1 and the column still sums to the whole.
   */
  private roundedPercents(cents: number[], totalCents: number): number[] {
    const exact = cents.map((value) => (value * 1000) / totalCents);
    const tenths = exact.map((value) => Math.floor(value));
    let left = 1000 - tenths.reduce((sum, value) => sum + value, 0);
    const byRemainder = exact
      .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
      .sort((a, b) => b.remainder - a.remainder);
    for (const entry of byRemainder) {
      if (left <= 0) {
        break;
      }
      tenths[entry.index] += 1;
      left -= 1;
    }
    return tenths.map((value) => value / 10);
  }

  /**
   * The exclusion here is structural, not cosmetic: `UNASSIGNED_REVENUE` is money whose
   * bus is unknown and `CENTRAL_EXPENSE` is a cost with no bus at all, so neither is a
   * vehicle that can be ranked against one. Bar length is |margin| against the largest
   * |margin| among the five, which keeps a fleet that is losing money readable - the sign
   * is carried by the colour and by the amount beside the bar, never by its length.
   */
  private buildMarginBars(rows: VehiclePlRowDto[]): MarginBar[] {
    const ranked = rows
      .filter((row) => row.kind === 'VEHICLE')
      .map((row) => ({ row, cents: this.cents(row.margin) }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, TOP_MARGIN_ROWS);

    const widest = Math.max(...ranked.map((entry) => Math.abs(entry.cents)), 1);
    return ranked.map((entry) => ({
      label: this.rowLabel(entry.row),
      margin: entry.row.margin,
      widthPercent: Math.round((Math.abs(entry.cents) / widest) * 100),
      negative: entry.cents < 0,
    }));
  }

  /** Money string -> integer cents; `0` for anything unparsable (see `recomputeDerived`). */
  private cents(value: string): number {
    return toSignedCents(value) ?? 0;
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
