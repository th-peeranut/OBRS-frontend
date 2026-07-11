import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { EodSalesReportStore } from './eod-sales-report.store';
import {
  EodMethodBreakdownDto,
  EodSalespersonRowDto,
  EodSalesReportDto,
  EodSalespersonTotalDto,
} from '../../../../shared/interfaces/eod-sales-report.interface';

// Sort/display order for the expandable per-row `byMethod` breakdown. Slugs not on this list
// (a payment method the backend ships before this list catches up) sort after every known
// method, in their original `byMethod` map order (Array#sort is stable).
const KNOWN_METHOD_ORDER = [
  'cash',
  'card',
  'qr_promptpay',
  'bank_transfer',
  'truemoney',
  'shopeepay',
  'rabbit_linepay',
  'other',
];

// Synthetic expand-state key for the single "Unassigned" row (`salespersonId: null`) — never
// sent anywhere, only used to track expand/collapse in the page-local Set.
const UNASSIGNED_EXPAND_KEY = -1;

interface EodMethodEntry extends EodMethodBreakdownDto {
  slug: string;
}

@Component({
  selector: 'app-eod-sales-report-page',
  templateUrl: './eod-sales-report-page.component.html',
  styleUrl: './eod-sales-report-page.component.scss',
})
export class EodSalesReportPageComponent implements OnInit, OnDestroy {
  protected report: EodSalesReportDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';
  protected selectedDate: Date | null = null;

  protected readonly skeletonRows = Array.from({ length: 5 });

  // Row-expand state is page-local UI state (not store state) — the component is destroyed
  // and recreated on every navigation (no RouteReuseStrategy), so it always starts empty on
  // entry; it's also explicitly cleared below whenever the `salespersons` array's identity
  // changes (a new fetch), so stale expand state never survives a date change.
  protected readonly expandedRows = new Set<number>();
  private previousSalespersons: EodSalespersonRowDto[] | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: EodSalesReportStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.selectedDate = this.parseDateInputValue(this.store.date);

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      const salespersons = data?.salespersons ?? null;
      if (salespersons !== this.previousSalespersons) {
        this.expandedRows.clear();
        this.previousSalespersons = salespersons;
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

  protected get rows(): EodSalespersonRowDto[] {
    return this.report?.salespersons ?? [];
  }

  protected get grandTotal(): EodSalespersonTotalDto | null {
    return this.report?.grandTotal ?? null;
  }

  /**
   * A 200 with `salespersons: []` (a day with no staff-sold activity) is not an error — a
   * friendly note, not a warning.
   */
  protected get isEmptyReport(): boolean {
    return !!this.report && this.report.salespersons.length === 0;
  }

  /**
   * Single source of truth for what the body renders, so a state message never shows
   * ALONGSIDE a stale/zero table. Priority: loading, then error, then empty, then data.
   */
  protected get contentState(): 'loading' | 'error' | 'empty' | 'data' {
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

  protected onDateChange(value: Date | null): void {
    this.selectedDate = value;
    if (!value) {
      return;
    }
    this.store.setDate(this.toDateInputValue(value));
  }

  private expandKey(row: EodSalespersonRowDto): number {
    return row.salespersonId ?? UNASSIGNED_EXPAND_KEY;
  }

  protected isExpanded(row: EodSalespersonRowDto): boolean {
    return this.expandedRows.has(this.expandKey(row));
  }

  protected toggleExpand(row: EodSalespersonRowDto): void {
    const key = this.expandKey(row);
    if (this.expandedRows.has(key)) {
      this.expandedRows.delete(key);
    } else {
      this.expandedRows.add(key);
    }
  }

  /**
   * `byMethod` entries sorted per `KNOWN_METHOD_ORDER`. Does not mutate the `@Input`-adjacent
   * source object — `Object.entries` + `.map` always returns a fresh array.
   */
  protected methodEntries(byMethod: Record<string, EodMethodBreakdownDto>): EodMethodEntry[] {
    return Object.entries(byMethod)
      .map(([slug, breakdown]) => ({ slug, ...breakdown }))
      .sort((a, b) => this.methodSortIndex(a.slug) - this.methodSortIndex(b.slug));
  }

  // Dynamic-key i18n idiom (usability-reports' categoryLabel/statusLabel), extended with an
  // instant-echo missing-key guard: ngx-translate's `instant()` echoes the key itself when no
  // translation exists, so a payment method the backend ships before i18n catches up falls
  // back to its raw slug instead of rendering the dotted key string.
  protected methodLabel(slug: string): string {
    const key = `ADMIN.EOD_REPORT.METHOD.${slug.toUpperCase()}`;
    const translated = this.translate.instant(key);
    return translated === key ? slug : translated;
  }

  // Arrow-function class properties, NOT ordinary methods: NgForOf's DefaultIterableDiffer
  // stores/invokes a `trackBy` function DETACHED from the component instance, so a bare
  // `protected trackByRow(...)` method passed as `trackBy: trackByRow` runs with `this ===
  // undefined` and throws the moment it touches `this.expandKey(...)` — which silently aborts
  // that *ngFor's diff mid-render (table paints zero rows, looks "empty" not "errored"). An
  // arrow function captures `this` lexically at construction, so it stays bound regardless of
  // how the template/directive invokes it. See eod-sales-report-page.component.spec.ts's
  // "(template rendering)" block, which reproduces this by actually rendering the template
  // (unlike the rest of this file's specs, which call methods directly and never exercised the
  // detached-callback path) — confirmed to fail against the bare-method version, pass here.
  protected readonly trackByRow = (_index: number, row: EodSalespersonRowDto): number =>
    this.expandKey(row);

  protected readonly trackByMethod = (_index: number, entry: EodMethodEntry): string =>
    entry.slug;

  // Copied verbatim from ReportsPageComponent.formatMoney (OBRS-40) — same money-string ->
  // localized-currency formatting, deliberately not shared as a util because ReportsPage's
  // copy is likewise inlined per-page rather than extracted.
  protected formatMoney(value: string, currency: string): string {
    const amount = Number(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  private methodSortIndex(slug: string): number {
    const index = KNOWN_METHOD_ORDER.indexOf(slug);
    return index === -1 ? KNOWN_METHOD_ORDER.length : index;
  }

  // Server 400/failure backstop. No range-specific error codes are documented for this
  // endpoint (unlike /summary's REPORT_RANGE_* codes) — only meaningful when there's no
  // cached value to fall back on; a background revalidate failure keeps showing cached data.
  private resolveLoadError(failed: boolean): string {
    if (!failed || this.store.hasValue) {
      return '';
    }
    return this.translate.instant('ADMIN.EOD_REPORT.LOAD_FAILED');
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
