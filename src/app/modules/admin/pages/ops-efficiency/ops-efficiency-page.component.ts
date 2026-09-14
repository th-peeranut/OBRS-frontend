import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { OpsEfficiencyStore } from './ops-efficiency.store';
import {
  OpsDeparturesDto,
  OpsEfficiencyDto,
  OpsSeatUtilizationDto,
  OpsVehicleTypeRowDto,
} from '../../../../shared/interfaces/ops-efficiency.interface';
import { DateRange } from '../../../../shared/components/date-range-picker/date-range-picker.component';
import { dateRangeErrorKey } from '../../../../shared/lib/date-range-guard';
import { toDateControlValue, toDateInputValue } from '../../../../shared/lib/date-input-value';

/**
 * OBRS-155 — operational efficiency page. Same range filter + SWR store as the other report pages:
 * departure-completion + seat-fill tiles, and a per-vehicle-type table with a fill-rate bar. All
 * rates are server-computed.
 */
@Component({
    selector: 'app-ops-efficiency-page',
    templateUrl: './ops-efficiency-page.component.html',
    styleUrl: './ops-efficiency-page.component.scss',
    standalone: false
})
export class OpsEfficiencyPageComponent implements OnInit, OnDestroy {
  protected data: OpsEfficiencyDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';
  protected rangeError = '';
  protected fromDate: Date | null = null;
  protected toDate: Date | null = null;
  protected readonly skeletonRows = Array.from({ length: 3 });
  private readonly destroy$ = new Subject<void>();

  constructor(protected readonly store: OpsEfficiencyStore, private readonly translate: TranslateService) {}

  ngOnInit(): void {
    const range = this.store.range;
    this.fromDate = toDateControlValue(range.from);
    this.toDate = toDateControlValue(range.to);
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((d) => (this.data = d));
    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((r) => (this.isRefreshing = r));
    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((f) => (this.loadError = this.resolveLoadError(f)));
    void this.store.refresh();
  }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  protected get isLoading(): boolean { return this.isRefreshing && !this.store.hasValue; }
  protected get departures(): OpsDeparturesDto | null { return this.data?.departures ?? null; }
  protected get seat(): OpsSeatUtilizationDto | null { return this.data?.seatUtilization ?? null; }
  protected get rows(): OpsVehicleTypeRowDto[] { return this.data?.byVehicleType ?? []; }

  protected get contentState(): 'loading' | 'invalid' | 'error' | 'data' {
    if (this.rangeError) return 'invalid';
    if (this.isLoading) return 'loading';
    if (this.loadError) return 'error';
    return 'data';
  }

  protected barPct(pct: number): number { return Math.max(0, Math.min(100, pct)); }
  protected pctDisplay(pct: number): string { return `${pct.toFixed(1)}%`; }
  protected formatCount(value: number): string { return new Intl.NumberFormat(this.translate.currentLang || 'en').format(value); }
  protected trackByType(_i: number, r: OpsVehicleTypeRowDto): string { return r.vehicleType; }

  protected onRangeChange(range: DateRange): void { this.fromDate = range.from; this.toDate = range.to; this.applyRange(); }

  private applyRange(): void {
    this.rangeError = '';
    if (!this.fromDate || !this.toDate) return;
    const from = toDateInputValue(this.fromDate);
    const to = toDateInputValue(this.toDate);
    const errorKey = dateRangeErrorKey(this.fromDate, this.toDate, from, to, 'ADMIN.REPORTS.ERROR');
    if (errorKey) { this.rangeError = this.translate.instant(errorKey); return; }
    this.store.setRange(from, to);
  }
  private resolveLoadError(failed: boolean): string {
    if (!failed || this.store.hasValue) return '';
    const code = this.store.lastErrorCode;
    if (code === 'REPORT_RANGE_INVALID') return this.translate.instant('ADMIN.REPORTS.ERROR.RANGE_INVALID');
    if (code === 'REPORT_RANGE_TOO_LARGE') return this.translate.instant('ADMIN.REPORTS.ERROR.RANGE_TOO_LARGE');
    return this.translate.instant('ADMIN.OPS_EFFICIENCY.LOAD_FAILED');
  }
}
