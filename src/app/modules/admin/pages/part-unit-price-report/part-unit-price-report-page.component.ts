import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { PartUnitPriceReportStore } from './part-unit-price-report.store';
import {
  PartUnitPriceLineDto,
  PartUnitPriceOptionDto,
  PartUnitPriceReportDto,
} from '../../../../shared/interfaces/part-unit-price-report.interface';
import {
  PartPriceUnitGroup,
  countBars,
  groupComparableLinesByUnit,
  hasComparableUnitGroup,
} from './part-unit-price-report.mappers';
import { maintenancePartLabel } from '../maintenance-parts/maintenance-parts.mappers';
import { Option } from '../expenses/expenses-page.mappers';
import { formatMoney } from '../../../../shared/lib/money-display';
import { formatDisplayDate } from '../../../../shared/lib/display-date-time';

/** `app-admin-dropdown` emits the empty string for its placeholder row — not a sentinel of ours. */
const NO_PART = '';

/**
 * OBRS-1613 AC3/AC4/AC5 — "อู่ขึ้นราคาหรือเปล่า", per registry entry.
 *
 * Structurally a sibling of `PayeeSpendReportPageComponent`: same store idiom, same error /
 * loading / empty ordering in the template, same money formatting. Four things here are the
 * report's MEANING and not its decoration:
 *
 * 1. **There is no year filter and no date range.** The owner ruled that on 2026-08-25: the only
 *    two parts on record with anything to compare straddle 2025/2026 in both cases, so a default
 *    window would open the screen on an empty chart for exactly the data it exists to show.
 * 2. **A ฿0 line and a line with no price on the bill are DIFFERENT exclusions** (AC4), and both
 *    are listed rather than dropped. The ฿0 is a bill that wrote zero because the owner supplied
 *    the part; charting it reads as the garage charging nothing. The blank one is a bill that
 *    never wrote a per-unit price; deriving one puts a number the garage did not write into the
 *    chart used to judge that garage. A report that silently dropped either would leave the owner
 *    looking at two bars knowing he has three bills.
 * 3. **Bars are grouped and scaled by UNIT.** ฿400 per กระป๋อง against ฿480 per ลิตร is not a price
 *    rise, and one axis across two units would be the same silent lie in a new place.
 * 4. **The coverage line is not a footnote** (AC5). It states what the report cannot speak for,
 *    including the "หลายอย่าง ราคาเดียว" lines the owner ruled should be linked to nothing.
 */
@Component({
  selector: 'app-part-unit-price-report-page',
  templateUrl: './part-unit-price-report-page.component.html',
  styleUrl: './part-unit-price-report-page.component.scss',
  standalone: false,
})
export class PartUnitPriceReportPageComponent implements OnInit, OnDestroy {
  protected report: PartUnitPriceReportDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';

  protected readonly skeletonRows = Array.from({ length: 5 });

  // Built once per response rather than in getters: `app-admin-dropdown` takes an array input, and
  // `@for` would re-track a freshly built array on every change-detection pass.
  protected partOptions: Option[] = [];
  protected unitGroups: PartPriceUnitGroup[] = [];
  protected hasComparison = false;
  protected barCount = 0;

  private readonly destroy$ = new Subject<void>();

  constructor(
    protected readonly store: PartUnitPriceReportStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.report = data;
      this.partOptions = (data?.partOptions ?? []).map((option) => ({
        code: String(option.partId),
        label: this.partOptionLabel(option),
      }));
      this.unitGroups = groupComparableLinesByUnit(data?.lines ?? []);
      this.hasComparison = hasComparableUnitGroup(this.unitGroups);
      this.barCount = countBars(this.unitGroups);
    });
    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isRefreshing = refreshing;
    });
    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.loadError = failed
        ? this.translate.instant('ADMIN.PART_UNIT_PRICE_REPORT.LOAD_FAILED')
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

  protected get selectedPart(): string {
    const partId = this.store.filter.partId;
    return partId === null ? NO_PART : String(partId);
  }

  protected onPartChange(value: string): void {
    this.store.setPart(value === NO_PART ? null : Number(value));
  }

  protected get lines(): PartUnitPriceLineDto[] {
    return this.report?.lines ?? [];
  }

  /**
   * Which part the RENDERED report is about — the server's echo, not the local selection.
   *
   * <p>The dropdown follows the click (`selectedPart`, off `store.filter`) because a control that
   * lagged the finger would feel broken. Everything below it follows this instead, so the chart,
   * the table and the "pick a part" prompt always describe the response they were built from.
   *
   * <p>Branching the content on the local filter instead is a one-round-trip lie: between the click
   * and the response, the PREVIOUS part's lines would render underneath the NEW part's name — an
   * empty chart for an entry that has plenty to compare, or worse, two real bars belonging to
   * something else. `AdminCollectionStore` converges either way; what this decides is what the
   * owner reads in the meantime, and stale-but-labelled-correctly is the only honest option.
   * Found by obrs-scrutinize, 2026-08-29: the field's own javadoc claimed this protection before
   * anything read the field.
   */
  protected get renderedPartId(): number | null {
    return this.report?.partId ?? null;
  }

  /** No registry entry has ever been named on a bill — there is nothing to offer, let alone chart. */
  protected get isEmptyReport(): boolean {
    return (this.report?.partOptions ?? []).length === 0;
  }

  /**
   * More than one unit means the groups are not comparable with each other, so each one needs its
   * unit said out loud. With a single unit the heading would repeat what every row already shows.
   */
  protected get showsUnitHeadings(): boolean {
    return this.unitGroups.length > 1;
  }

  /**
   * The 13 seeded entries are translated, the owner's own are Thai verbatim (owner ruling
   * 2026-08-25). One function decides that, for this picker and the registry screen alike.
   *
   * <p>The counts ride along in the label, the way `PayeeSpendReportPageComponent` prints a year's
   * total inside its own option: an entry with fewer than two comparable lines renders the
   * no-comparison state, and a picker that hid that until after the click would make every such
   * entry look like a broken screen.
   */
  protected partOptionLabel(option: PartUnitPriceOptionDto): string {
    const name = maintenancePartLabel(
      { code: option.partCode, name: option.partName },
      (key) => this.translate.instant(key)
    );
    return this.translate.instant('ADMIN.PART_UNIT_PRICE_REPORT.PART_OPTION', {
      name,
      comparable: option.comparableLineCount,
      lines: option.lineCount,
    });
  }

  protected money(value: string | null | undefined): string {
    return formatMoney(value, this.translate.currentLang);
  }

  protected date(value: string): string {
    return formatDisplayDate(value, this.translate.currentLang);
  }

  /** A bill entered before `expenses.payee_id` existed has no garage on record — say so. */
  protected payeeLabel(payeeName: string | null): string {
    return payeeName ?? this.translate.instant('ADMIN.PART_UNIT_PRICE_REPORT.PAYEE_UNKNOWN');
  }

  protected unitLabel(unit: string | null): string {
    return unit ?? this.translate.instant('ADMIN.PART_UNIT_PRICE_REPORT.UNIT_NONE');
  }

  /** The per-unit price as it is read aloud: "฿480 / กระป๋อง", or just the money with no unit. */
  protected pricePerUnit(unitPrice: string | null, unit: string | null): string {
    const money = this.money(unitPrice);
    return unit === null || unit.trim() === '' ? money : `${money} / ${unit}`;
  }

  protected statusLabel(line: PartUnitPriceLineDto): string {
    return this.translate.instant(`ADMIN.PART_UNIT_PRICE_REPORT.STATUS.${line.status}`);
  }
}
