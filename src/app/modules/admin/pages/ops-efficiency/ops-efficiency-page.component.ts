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

const MAX_RANGE_SPAN_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * OBRS-155 — operational efficiency page. Same range filter + SWR store as the other report pages:
 * departure-completion + seat-fill tiles, and a per-vehicle-type table with a fill-rate bar. All
 * rates are server-computed.
 */
@Component({
  selector: 'app-ops-efficiency-page',
  templateUrl: './ops-efficiency-page.component.html',
  styleUrl: './ops-efficiency-page.component.scss',
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
    this.fromDate = this.parseDateInputValue(range.from);
    this.toDate = this.parseDateInputValue(range.to);
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

  protected onFromDateChange(value: Date | null): void { this.fromDate = value; this.applyRange(); }
  protected onToDateChange(value: Date | null): void { this.toDate = value; this.applyRange(); }

  private applyRange(): void {
    this.rangeError = '';
    if (!this.fromDate || !this.toDate) return;
    const from = this.toDateInputValue(this.fromDate);
    const to = this.toDateInputValue(this.toDate);
    if (from > to) { this.rangeError = this.translate.instant('ADMIN.REPORTS.ERROR.RANGE_INVALID'); return; }
    const spanDays = Math.round((this.toDate.getTime() - this.fromDate.getTime()) / MS_PER_DAY);
    if (spanDays > MAX_RANGE_SPAN_DAYS) { this.rangeError = this.translate.instant('ADMIN.REPORTS.ERROR.RANGE_TOO_LARGE'); return; }
    this.store.setRange(from, to);
  }
  private resolveLoadError(failed: boolean): string {
    if (!failed || this.store.hasValue) return '';
    const code = this.store.lastErrorCode;
    if (code === 'REPORT_RANGE_INVALID') return this.translate.instant('ADMIN.REPORTS.ERROR.RANGE_INVALID');
    if (code === 'REPORT_RANGE_TOO_LARGE') return this.translate.instant('ADMIN.REPORTS.ERROR.RANGE_TOO_LARGE');
    return this.translate.instant('ADMIN.OPS_EFFICIENCY.LOAD_FAILED');
  }
  private toDateInputValue(value: Date): string {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  private parseDateInputValue(value: string): Date | null {
    const p = value.split('-');
    if (p.length !== 3) return null;
    const [y, m, d] = p.map(Number);
    return new Date(y, m - 1, d);
  }
}
