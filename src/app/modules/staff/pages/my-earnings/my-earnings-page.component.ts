import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { MyEarningsStore } from './my-earnings.store';
import {
  PerHeadEarningBucketDto,
  PerHeadEarningsGranularity,
  PerHeadEarningsRespDto,
} from '../../../../shared/interfaces/driver-cash.interface';

/**
 * OBRS-1147 AC-1 — "ค่าหัวฉันได้เท่าไร" for the person who earned it, per day /
 * month / year.
 *
 * ⛔ This screen shows PAY, never the owner's takings. The nearest-looking
 * report, `/admin/reports` → EOD by salesperson, is the owner's revenue
 * attributed to whoever sold it; the two numbers travel in opposite directions
 * and must never be presented as comparable.
 *
 * There is no "รอรับ / ได้รับแล้ว" split: the owner settled on 2026-08-08
 * (OBRS-1145) that the fee is netted at the round — the seller keeps it out of
 * the cash they hand over — so every line here is money already in hand.
 */
@Component({
  selector: 'app-my-earnings-page',
  templateUrl: './my-earnings-page.component.html',
  styleUrl: './my-earnings-page.component.scss',
  standalone: false,
  providers: [MyEarningsStore],
})
export class MyEarningsPageComponent implements OnInit, OnDestroy {
  protected earnings: PerHeadEarningsRespDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';
  protected rangeError = '';

  protected fromDate: Date | null = null;
  protected toDate: Date | null = null;
  protected granularity: PerHeadEarningsGranularity = 'MONTH';

  protected readonly granularityOptions: { value: PerHeadEarningsGranularity; labelKey: string }[] = [
    { value: 'DAY', labelKey: 'STAFF.MY_EARNINGS.GRANULARITY.DAY' },
    { value: 'MONTH', labelKey: 'STAFF.MY_EARNINGS.GRANULARITY.MONTH' },
    { value: 'YEAR', labelKey: 'STAFF.MY_EARNINGS.GRANULARITY.YEAR' },
  ];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: MyEarningsStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    // Default window: this calendar year to date, grouped by month. A salesperson
    // asking "what have I earned" almost always means the running year, and a
    // year of MONTH buckets is 12 rows — small enough to read without paging.
    const today = new Date();
    this.fromDate = new Date(today.getFullYear(), 0, 1);
    this.toDate = today;

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.earnings = data;
    });
    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isRefreshing = refreshing;
    });
    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.loadError = failed ? this.translate.instant('STAFF.MY_EARNINGS.LOAD_FAILED') : '';
    });

    this.applyQuery();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get buckets(): PerHeadEarningBucketDto[] {
    return this.earnings?.buckets ?? [];
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.earnings;
  }

  /**
   * One state drives the body, so a message never renders ALONGSIDE a stale
   * table — which would read as "there is data" (the ReportsPageComponent
   * precedent). An empty range is a friendly note, not an error: a person who
   * took no heads this month has earned nothing, and that is a fact, not a
   * failure.
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
    if (this.buckets.length === 0) {
      return 'empty';
    }
    return 'data';
  }

  protected onFromDateChange(value: Date | null): void {
    this.fromDate = value;
    this.applyQuery();
  }

  protected onToDateChange(value: Date | null): void {
    this.toDate = value;
    this.applyQuery();
  }

  protected onGranularityChange(value: PerHeadEarningsGranularity): void {
    this.granularity = value;
    this.applyQuery();
  }

  /**
   * The bucket label the row shows. Derived from `bucketStart`, never by
   * slicing `bucketKey` — the key is an identity, and parsing it here would be
   * a second, silently drifting copy of the backend's bucketing rule.
   */
  protected bucketLabel(bucket: PerHeadEarningBucketDto): string {
    const start = this.parseIsoDate(bucket.bucketStart);
    if (!start) {
      return bucket.bucketKey;
    }
    const locale = this.translate.currentLang === 'th' ? 'th-TH' : 'en-GB';
    if (this.granularity === 'YEAR') {
      return start.toLocaleDateString(locale, { year: 'numeric' });
    }
    if (this.granularity === 'MONTH') {
      return start.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
    }
    return start.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  protected formatMoney(value: string | null): string {
    if (value === null) {
      return '—';
    }
    const amount = Number(value);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  protected trackByBucketKey(_index: number, bucket: PerHeadEarningBucketDto): string {
    return bucket.bucketKey;
  }

  // Client guard first: a reversed range is rejected here and NOT dispatched.
  // The backend rejects it too (400) — this exists so the person sees why
  // instead of a generic failure.
  private applyQuery(): void {
    this.rangeError = '';
    if (!this.fromDate || !this.toDate) {
      return;
    }
    const from = this.toDateInputValue(this.fromDate);
    const to = this.toDateInputValue(this.toDate);
    if (from > to) {
      this.rangeError = this.translate.instant('STAFF.MY_EARNINGS.ERROR.RANGE_INVALID');
      return;
    }
    this.store.setQuery(from, to, this.granularity);
  }

  private toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseIsoDate(value: string): Date | null {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) {
      return null;
    }
    return new Date(year, month - 1, day);
  }
}
