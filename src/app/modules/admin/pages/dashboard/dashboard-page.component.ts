import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AdminDashboardStore } from './admin-dashboard.store';
import {
  DashboardDepartureRowDto,
  DashboardTilesDto,
  DashboardTodayDto,
} from '../../../../shared/interfaces/dashboard-today.interface';
import { pollWhileVisible } from '../../shared/admin-auto-refresh';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';

@Component({
    selector: 'app-dashboard-page',
    templateUrl: './dashboard-page.component.html',
    styleUrl: './dashboard-page.component.scss',
    standalone: false
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  protected snapshot: DashboardTodayDto | null = null;
  protected isRefreshing = false;
  protected loadError = '';
  /** Raw error$ value, independent of whether there's a cache to fall back on
   *  — drives `app-admin-refresh-hint`'s "failed, showing saved data" line,
   *  which (unlike `loadError`) is meaningful precisely when there IS cache. */
  protected hasFailed = false;

  protected readonly skeletonRows = Array.from({ length: 5 });

  private readonly destroy$ = new Subject<void>();
  private pollSubscription: Subscription | null = null;

  constructor(
    private readonly store: AdminDashboardStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    // Bind to the cache first: if a snapshot exists from a previous visit it
    // renders immediately, then refresh() revalidates it in the background.
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.snapshot = data;
    });

    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isRefreshing = refreshing;
    });

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.hasFailed = failed;
      this.loadError = this.resolveLoadError(failed);
    });

    void this.store.refresh();
    // Operational data (bookings/departures) changes throughout the day, so
    // poll for it while this page is open; stops on navigate-away in
    // ngOnDestroy below.
    this.pollSubscription = pollWhileVisible(() => void this.store.refresh());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.pollSubscription?.unsubscribe();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  protected get tiles(): DashboardTilesDto | null {
    return this.snapshot?.tiles ?? null;
  }

  protected get departures(): DashboardDepartureRowDto[] {
    return this.snapshot?.departures ?? [];
  }

  /**
   * Off the PRESENCE of `tiles.revenue`, not a client-side role check —
   * forward-compatible with a future viewer (e.g. salesperson) without
   * revenue visibility, for whom the server simply omits the field.
   */
  protected get showRevenue(): boolean {
    return !!this.tiles?.revenue;
  }

  /**
   * A day with real occupancy but zero bookings is NOT empty — occupancy
   * keys on departure-date while bookingCount keys on booking-date, so the
   * two can legitimately diverge (OBRS-40 e41e88e precedent). "Empty" means
   * no departures scheduled AND no bookings AND no occupancy at all.
   */
  protected get isEmptyDay(): boolean {
    const t = this.tiles;
    return !!t && t.departuresCount === 0 && t.bookingCount === 0 && t.occupancyRatePct === 0;
  }

  /**
   * Single source of truth for what the body renders, so a state message
   * never shows alongside a stale/zero table. Priority: loading > error >
   * empty > data. There is no date picker on this page, so (unlike
   * ReportsPageComponent) there is no 'invalid' branch.
   */
  protected get contentState(): 'loading' | 'error' | 'empty' | 'data' {
    if (this.isLoading) {
      return 'loading';
    }
    if (this.loadError) {
      return 'error';
    }
    if (this.isEmptyDay) {
      return 'empty';
    }
    return 'data';
  }

  protected occupancyDisplay(pct: number): string {
    return `${pct.toFixed(1)}%`;
  }

  protected get revenueTileDisplay(): string {
    const revenue = this.tiles?.revenue;
    return revenue ? this.formatMoney(revenue.net, revenue.currency) : '';
  }

  protected formatMoney(value: string, currency: string): string {
    const amount = Number(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  protected displayDeparture(iso: string): string {
    return formatDisplayDateTime(iso, this.translate.currentLang);
  }

  protected trackByScheduleId(_index: number, row: DashboardDepartureRowDto): number {
    return row.scheduleId;
  }

  // Server error backstop — the message is generic (this page has no
  // client-chosen input to validate, unlike Reports' range guard). Only
  // meaningful when there is no cache to fall back on; a background
  // revalidate failure keeps showing the cached data.
  private resolveLoadError(failed: boolean): string {
    if (!failed || this.store.hasValue) {
      return '';
    }
    return this.translate.instant('ADMIN.DASHBOARD.LOAD_FAILED');
  }
}
