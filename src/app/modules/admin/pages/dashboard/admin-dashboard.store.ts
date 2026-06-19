import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Observable } from 'rxjs';
import {
  AdminApiService,
  AdminBookingDto,
  AdminVehicleDto,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { PageResponse } from '../../../../shared/interfaces/payment.interface';
import { AuthService } from '../../../../auth/auth.service';

export interface RecentBookingRow {
  bookingId: string;
  customer: string;
  totalFare: string;
  status: string;
}

export interface DashboardSnapshot {
  totalBookings: number;
  pendingPayments: number;
  revenue: string;
  activeVehicles: number;
  recentBookings: RecentBookingRow[];
  /** True when at least one source failed and its tiles show the prior value. */
  partialFailure: boolean;
}

/**
 * Root-scoped cache for the admin dashboard. It outlives the dashboard
 * component (which Angular destroys on navigation away and recreates on
 * return), so re-entering /admin/dashboard renders the last snapshot
 * *instantly* instead of waiting on the network.
 *
 * Stale-while-revalidate: `refresh()` keeps showing the cached snapshot and
 * fetches in the background; successfully fetched sources overwrite their
 * tiles when the response lands, so new data appears within ~1s of re-entry
 * without ever blanking the screen.
 */
@Injectable({ providedIn: 'root' })
export class AdminDashboardStore {
  private readonly snapshotSubject = new BehaviorSubject<DashboardSnapshot | null>(null);
  private readonly refreshingSubject = new BehaviorSubject<boolean>(false);

  /** Last computed snapshot, or null before the first successful-ish load. */
  readonly snapshot$: Observable<DashboardSnapshot | null> = this.snapshotSubject.asObservable();
  /** True while a background revalidate is in flight. */
  readonly refreshing$: Observable<boolean> = this.refreshingSubject.asObservable();

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    // The cache is root-scoped and outlives the session. Drop it on logout
    // (or token expiry) so a different admin can't briefly see the previous
    // session's tiles before the next background refresh lands.
    authService.authStatus$.subscribe((isAuthenticated) => {
      if (!isAuthenticated) {
        this.clear();
      }
    });
  }

  get snapshot(): DashboardSnapshot | null {
    return this.snapshotSubject.value;
  }

  /** Forget the cached snapshot (e.g. on logout). */
  clear(): void {
    this.snapshotSubject.next(null);
  }

  /**
   * Revalidate the dashboard in the background. Concurrent calls are deduped
   * so rapid re-entry doesn't fan out into parallel fetches. The cached
   * snapshot stays visible throughout.
   */
  async refresh(): Promise<void> {
    if (this.refreshingSubject.value) {
      return;
    }
    this.refreshingSubject.next(true);
    try {
      // Load each source independently so one failing endpoint doesn't blank
      // the dashboard — whatever resolves overwrites its tiles; the rest keep
      // their previous (cached) value and we flag a partial failure.
      const failed: string[] = [];
      const [bookingsPage, vehicles] = await Promise.all([
        this.fetchBookings().catch(() => {
          failed.push('bookings');
          return null;
        }),
        this.fetchVehicles().catch(() => {
          failed.push('vehicles');
          return null;
        }),
      ]);

      const previous = this.snapshotSubject.value;
      const next: DashboardSnapshot = {
        totalBookings: previous?.totalBookings ?? 0,
        pendingPayments: previous?.pendingPayments ?? 0,
        revenue: previous?.revenue ?? this.formatCurrency(0),
        activeVehicles: previous?.activeVehicles ?? 0,
        recentBookings: previous?.recentBookings ?? [],
        partialFailure: failed.length > 0,
      };

      if (bookingsPage) {
        // totalElements is the true count across all pages; revenue/pending/
        // recent are derived from the fetched page (most recent first).
        const bookings = bookingsPage.content ?? [];
        next.totalBookings = bookingsPage.totalElements ?? bookings.length;
        next.pendingPayments = this.countPendingPayments(bookings);
        next.revenue = this.formatCurrency(this.sumRevenue(bookings));
        next.recentBookings = this.toRecentBookings(bookings);
      }

      if (vehicles) {
        next.activeVehicles = this.countActiveVehicles(vehicles);
      }

      // If the very first load fails entirely, leave the snapshot null so the
      // component keeps showing its loading state rather than empty zeros.
      if (previous || bookingsPage || vehicles) {
        this.snapshotSubject.next(next);
      }
    } finally {
      this.refreshingSubject.next(false);
    }
  }

  private async fetchBookings(): Promise<PageResponse<AdminBookingDto> | null> {
    const response = await firstValueFrom(this.adminApiService.getBookings());
    return response?.data ?? null;
  }

  private async fetchVehicles(): Promise<AdminVehicleDto[]> {
    const response = await firstValueFrom(this.adminApiService.getVehicles());
    return response?.data ?? [];
  }

  private getBookingAmount(booking: AdminBookingDto): number {
    const amount = Number(
      booking.totalAmount ?? booking.pricing?.netAmount ?? booking.payment?.totalAmount
    );
    return Number.isFinite(amount) ? amount : 0;
  }

  private sumRevenue(bookings: AdminBookingDto[]): number {
    return bookings.reduce((sum, booking) => sum + this.getBookingAmount(booking), 0);
  }

  private countPendingPayments(bookings: AdminBookingDto[]): number {
    return bookings.filter((booking) => {
      const status = String(
        booking.payment?.status ?? parseAdminStatus(booking.status, 'en').code
      )
        .replace(/\s+/g, '_')
        .toUpperCase();
      return status === 'PENDING' || status.includes('PARTIAL') || status.includes('REFUND_REQUIRED');
    }).length;
  }

  private countActiveVehicles(vehicles: AdminVehicleDto[]): number {
    return vehicles.filter((vehicle) => {
      const code = parseAdminStatus(vehicle.status, 'en').code.toUpperCase();
      return code === 'ACTIVE' || code === 'ONLINE' || code === 'AVAILABLE';
    }).length;
  }

  private toRecentBookings(bookings: AdminBookingDto[]): RecentBookingRow[] {
    return bookings.slice(0, 5).map((booking) => {
      const status = parseAdminStatus(booking.status, 'en');
      return {
        bookingId: booking.bookingNumber ?? `#BK-${booking.id}`,
        customer: booking.contact?.fullName ?? booking.actor?.name ?? '-',
        totalFare: this.formatCurrency(this.getBookingAmount(booking)),
        status: status.name,
      };
    });
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 2,
    }).format(amount);
  }
}
