import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { BookingRow, BookingsStore, StatusOption } from './bookings.store';

@Component({
  selector: 'app-bookings-page',
  templateUrl: './bookings-page.component.html',
  styleUrl: './bookings-page.component.scss',
})
export class BookingsPageComponent implements OnInit, OnDestroy {
  protected allBookings: BookingRow[] = [];

  protected isRefreshing = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected errorMessage = '';

  protected searchTerm = '';
  protected selectedStatus = '';
  protected statusOptions: StatusOption[] = [];

  protected readonly pageSize = 10;
  protected currentPage = 1;

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly translate: TranslateService,
    private readonly store: BookingsStore
  ) {}

  ngOnInit(): void {
    // Render the cached bookings instantly on re-entry (skipping the payment
    // N+1 burst), then revalidate in the background.
    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        if (data) {
          this.allBookings = data.rows;
          this.statusOptions = data.statusOptions;
          this.currentPage = 1;
        }
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        this.errorMessage =
          failed && !this.store.hasValue
            ? this.translate.instant('ADMIN.BOOKINGS.LOAD_FAILED')
            : '';
      })
    );
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Skeletons only while loading with no cached data yet. */
  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  protected get filteredBookings(): BookingRow[] {
    const term = this.searchTerm.trim().toLowerCase();
    const status = this.selectedStatus.trim().toUpperCase();

    return this.allBookings.filter((booking) => {
      const matchesTerm =
        term === '' ||
        booking.bookingId.toLowerCase().includes(term) ||
        booking.customer.toLowerCase().includes(term);
      const matchesStatus =
        status === '' || booking.bookingStatus.toUpperCase() === status;
      return matchesTerm && matchesStatus;
    });
  }

  protected get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredBookings.length / this.pageSize));
  }

  protected get pagedBookings(): BookingRow[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredBookings.slice(start, start + this.pageSize);
  }

  protected get rangeStart(): number {
    return this.filteredBookings.length === 0
      ? 0
      : (this.currentPage - 1) * this.pageSize + 1;
  }

  protected get rangeEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredBookings.length);
  }

  protected onSearchChange(value: string): void {
    this.searchTerm = value;
    this.currentPage = 1;
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatus = value ?? '';
    this.currentPage = 1;
  }

  protected goToPage(page: number): void {
    this.currentPage = Math.min(Math.max(1, page), this.totalPages);
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

  protected paymentClass(status: string): string {
    const normalizedStatus = status.trim().replace(/\s+/g, '_').toUpperCase();

    if (
      normalizedStatus === 'SUCCESS' ||
      normalizedStatus === 'PAID' ||
      normalizedStatus === 'FULLY_PAID' ||
      normalizedStatus === 'REFUND_PROCESSED' ||
      normalizedStatus === 'REFUNDED'
    ) {
      return 'is-success';
    }

    if (
      normalizedStatus === 'PENDING' ||
      normalizedStatus === 'PARTIAL' ||
      normalizedStatus === 'PARTIAL_PAID' ||
      normalizedStatus === 'REFUND_REQUIRED' ||
      normalizedStatus === 'MANUAL_REFUND_REQUIRED'
    ) {
      return 'is-warning';
    }

    return 'is-danger';
  }

  protected exportCsv(): void {
    const rows = this.filteredBookings;
    if (rows.length === 0) {
      return;
    }

    const headers = [
      this.translate.instant('ADMIN.BOOKINGS.BOOKING_ID'),
      this.translate.instant('ADMIN.BOOKINGS.CUSTOMER'),
      this.translate.instant('ADMIN.BOOKINGS.ROUTE'),
      this.translate.instant('ADMIN.BOOKINGS.BOOKING_DATE'),
      this.translate.instant('ADMIN.BOOKINGS.TOTAL_FARE'),
      this.translate.instant('ADMIN.BOOKINGS.BOOKING_STATUS'),
      this.translate.instant('ADMIN.BOOKINGS.PAYMENT_STATUS'),
    ];

    const lines = rows.map((row) =>
      [
        row.bookingId,
        row.customer,
        row.route,
        row.bookingDate,
        row.totalFare,
        row.bookingStatus,
        row.paymentStatus,
      ]
        .map((value) => this.toCsvCell(value))
        .join(',')
    );

    const csv = [headers.map((value) => this.toCsvCell(value)).join(','), ...lines].join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private toCsvCell(value: string): string {
    const safe = (value ?? '').replace(/"/g, '""');
    return `"${safe}"`;
  }
}
