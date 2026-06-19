import { Component, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminBookingDto,
  AdminVehicleDto,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { PageResponse } from '../../../../shared/interfaces/payment.interface';

interface RecentBookingRow {
  bookingId: string;
  customer: string;
  totalFare: string;
  status: string;
}

@Component({
  selector: 'app-dashboard-page',
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent implements OnInit {
  protected isLoading = false;
  protected errorMessage = '';

  protected totalBookings = 0;
  protected pendingPayments = 0;
  protected revenue = '';
  protected activeVehicles = 0;
  protected recentBookings: RecentBookingRow[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly translate: TranslateService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadDashboard();
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

  private async loadDashboard(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    this.revenue = this.formatCurrency(0);

    // Load each source independently so one failing endpoint doesn't blank the
    // whole dashboard — whatever resolves is rendered, and we flag the rest.
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

    if (bookingsPage) {
      // totalElements is the true count across all pages; revenue/pending/recent
      // are derived from the fetched page (most recent first — see API ordering).
      const bookings = bookingsPage.content ?? [];
      this.totalBookings = bookingsPage.totalElements ?? bookings.length;
      this.pendingPayments = this.countPendingPayments(bookings);
      this.revenue = this.formatCurrency(this.sumRevenue(bookings));
      this.recentBookings = this.toRecentBookings(bookings);
    }

    if (vehicles) {
      this.activeVehicles = this.countActiveVehicles(vehicles);
    }

    if (failed.length > 0) {
      this.errorMessage = this.translate.instant('ADMIN.DASHBOARD.PARTIAL_LOAD_FAILED');
    }

    this.isLoading = false;
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
