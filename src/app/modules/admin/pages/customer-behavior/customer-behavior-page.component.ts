import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { CustomerBehaviorStore } from './customer-behavior.store';
import {
  CustomerBehaviorChannelDto,
  CustomerBehaviorDto,
  CustomerBehaviorRepeatBucketDto,
} from '../../../../shared/interfaces/customer-behavior.interface';
import { DateRange } from '../../../../shared/components/date-range-picker/date-range-picker.component';
import { dateRangeErrorKey } from '../../../../shared/lib/date-range-guard';
import { toDateControlValue, toDateInputValue } from '../../../../shared/lib/date-input-value';

/**
 * OBRS-154 — customer behavior page (aggregate-only). Same range filter + SWR store as the other
 * report pages: KPI tiles + a channel split + a repeat-frequency histogram. All shares are
 * server-computed; the page renders bars from them and never handles PII.
 */
@Component({
    selector: 'app-customer-behavior-page',
    templateUrl: './customer-behavior-page.component.html',
    styleUrl: './customer-behavior-page.component.scss',
    standalone: false
})
export class CustomerBehaviorPageComponent implements OnInit, OnDestroy {
  protected data: CustomerBehaviorDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';
  protected rangeError = '';
  protected fromDate: Date | null = null;
  protected toDate: Date | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(protected readonly store: CustomerBehaviorStore, private readonly translate: TranslateService) {}

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
  protected get channels(): CustomerBehaviorChannelDto[] { return this.data?.bookingsByChannel ?? []; }
  protected get repeat(): CustomerBehaviorRepeatBucketDto[] { return this.data?.repeatDistribution ?? []; }

  protected get contentState(): 'loading' | 'invalid' | 'error' | 'data' {
    if (this.rangeError) return 'invalid';
    if (this.isLoading) return 'loading';
    if (this.loadError) return 'error';
    return 'data';
  }

  protected barPct(pct: number): number { return Math.max(0, Math.min(100, pct)); }
  protected pctDisplay(pct: number): string { return `${pct.toFixed(1)}%`; }
  protected formatCount(value: number): string { return new Intl.NumberFormat(this.translate.currentLang || 'en').format(value); }
  protected formatAvg(value: number): string { return value.toFixed(1); }

  // A repeat bucket rendered relative to the busiest bucket (share of customers).
  private get maxRepeatShare(): number { return this.repeat.reduce((m, b) => Math.max(m, b.sharePct), 0); }
  protected repeatBarPct(bucket: CustomerBehaviorRepeatBucketDto): number {
    const max = this.maxRepeatShare;
    return max > 0 ? this.barPct((bucket.sharePct / max) * 100) : 0;
  }
  protected repeatLabel(bucket: CustomerBehaviorRepeatBucketDto): string {
    return this.translate.instant('ADMIN.CUSTOMER_BEHAVIOR.REPEAT_BOOKINGS', { count: bucket.bookings });
  }

  protected trackByChannel(_i: number, c: CustomerBehaviorChannelDto): string { return c.channel; }
  protected trackByBucket(_i: number, b: CustomerBehaviorRepeatBucketDto): number { return b.bookings; }

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
    return this.translate.instant('ADMIN.CUSTOMER_BEHAVIOR.LOAD_FAILED');
  }
}
