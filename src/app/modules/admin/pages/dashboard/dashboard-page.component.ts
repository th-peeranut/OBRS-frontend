import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminDashboardStore,
  DashboardSnapshot,
  RecentBookingRow,
} from './admin-dashboard.store';

@Component({
  selector: 'app-dashboard-page',
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  protected snapshot: DashboardSnapshot | null = null;
  protected isRefreshing = false;

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly store: AdminDashboardStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    // Bind to the cache first: if a snapshot exists from a previous visit it
    // renders immediately, then refresh() revalidates it in the background.
    this.subscriptions.add(
      this.store.snapshot$.subscribe((snapshot) => (this.snapshot = snapshot))
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Skeletons only on the very first load (no cached snapshot yet). */
  protected get isLoading(): boolean {
    return this.snapshot === null;
  }

  protected get totalBookings(): number {
    return this.snapshot?.totalBookings ?? 0;
  }

  protected get pendingPayments(): number {
    return this.snapshot?.pendingPayments ?? 0;
  }

  protected get revenue(): string {
    return this.snapshot?.revenue ?? '';
  }

  protected get activeVehicles(): number {
    return this.snapshot?.activeVehicles ?? 0;
  }

  protected get recentBookings(): RecentBookingRow[] {
    return this.snapshot?.recentBookings ?? [];
  }

  protected get errorMessage(): string {
    return this.snapshot?.partialFailure
      ? this.translate.instant('ADMIN.DASHBOARD.PARTIAL_LOAD_FAILED')
      : '';
  }

  protected statusClass(status: string): string {
    const normalizedStatus = status.toUpperCase();
    if (
      normalizedStatus === 'CONFIRMED' ||
      normalizedStatus === 'PAID' ||
      normalizedStatus === 'COMPLETED'
    ) {
      return 'is-success';
    }
    if (normalizedStatus === 'PENDING') {
      return 'is-warning';
    }
    return 'is-danger';
  }
}
