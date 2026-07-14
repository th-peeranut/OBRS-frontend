import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { BookingRow, BookingsStore, StatusOption } from './bookings.store';
import { pollWhileVisible } from '../../shared/admin-auto-refresh';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';
import {
  AdminApiService,
  AdminBookingDetailDto,
  AdminBookingDetailJourneyDto,
  AdminPaymentTransactionDto,
  AdminStatusDto,
  getAdminLookupLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';

interface TimelineEvent {
  time: string | null;
  labelKey: string;
  params?: Record<string, unknown>;
}

@Component({
  selector: 'app-bookings-page',
  templateUrl: './bookings-page.component.html',
  styleUrl: './bookings-page.component.scss',
})
export class BookingsPageComponent implements OnInit, OnDestroy {
  protected allBookings: BookingRow[] = [];

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected errorMessage = '';

  protected searchTerm = '';
  protected selectedStatus = '';
  protected statusOptions: StatusOption[] = [];

  protected readonly pageSize = 10;
  protected currentPage = 1;

  // Detail modal (OBRS-280, read-only) — mirrors UsabilityReportsPageComponent's
  // optimistic-open + stale-id-guard idiom, just with two independent fetches
  // (booking detail + payments) instead of one.
  protected selectedBookingId: number | null = null;
  protected detailBooking: AdminBookingDetailDto | null = null;
  protected paymentTransactions: AdminPaymentTransactionDto[] | null = null;
  protected isDetailFetching = false;
  protected isPaymentsFetching = false;
  protected detailLoadError = '';
  protected paymentsLoadError = '';

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly translate: TranslateService,
    private readonly store: BookingsStore,
    private readonly adminApiService: AdminApiService
  ) {}

  // Format a raw ISO timestamp for display in the current UI language. Called
  // from the template (not the store) so the cached, locale-independent rows
  // re-render on a live language switch (OBRS-178).
  protected displayDateTime(value: string | null | undefined): string {
    return formatDisplayDateTime(value, this.translate.currentLang);
  }

  ngOnInit(): void {
    // Render the cached bookings instantly on re-entry (skipping the payment
    // N+1 burst), then revalidate in the background.
    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        if (data) {
          this.allBookings = data.rows;
          this.statusOptions = data.statusOptions;
          // Preserve the user's current page across a background revalidate;
          // only clamp it if the (possibly smaller) result set has fewer pages.
          this.currentPage = Math.min(this.currentPage, this.totalPages);
        }
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        this.refreshFailed = failed && this.store.hasValue;
        this.errorMessage =
          failed && !this.store.hasValue
            ? this.translate.instant('ADMIN.BOOKINGS.LOAD_FAILED')
            : '';
      })
    );
    void this.store.refresh();
    // Bookings/payments are created by customers, so poll for new ones while
    // this page is open; stops on navigate-away via the teardown bag.
    this.subscriptions.add(pollWhileVisible(() => void this.store.refresh()));
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

  protected trackByBookingId(_index: number, booking: BookingRow): string {
    return booking.bookingId;
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

  // ── Detail modal (OBRS-280) ────────────────────────────────────────────

  // Whole-row click is a MOUSE convenience for opening the detail dialog,
  // same guard idiom as UsabilityReportsPageComponent.onRowActivate: the row
  // carries no role/keyboard handler (the View button is the accessible
  // affordance), so ignore clicks on an interactive control in the row or a
  // text selection in progress.
  protected onRowActivate(row: BookingRow, event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea')) {
      return;
    }
    if (window.getSelection()?.toString()) {
      return;
    }
    this.openDetail(row);
  }

  protected openDetail(row: BookingRow): void {
    const id = row.id;
    this.selectedBookingId = id;
    // Open optimistically (design-system.md §6): seed from the row already in
    // hand so the header/status render instantly, before either fetch resolves.
    this.detailBooking = this.toDetailFallback(row);
    this.paymentTransactions = null;
    this.isDetailFetching = true;
    this.isPaymentsFetching = true;
    this.detailLoadError = '';
    this.paymentsLoadError = '';

    // Two independent fetches, each with its own stale-id guard, so the
    // passengers/tickets section can render as soon as getBookingById
    // resolves without waiting on getBookingPayments, and vice versa.
    this.subscriptions.add(
      this.adminApiService.getBookingById(id).subscribe({
        next: (response) => {
          if (this.selectedBookingId !== id) {
            return;
          }
          this.isDetailFetching = false;
          if (response.data) {
            this.detailBooking = response.data;
          } else {
            this.detailLoadError = this.translate.instant('ADMIN.BOOKINGS.DETAIL.LOAD_FAILED');
          }
        },
        error: () => {
          if (this.selectedBookingId !== id) {
            return;
          }
          this.isDetailFetching = false;
          this.detailLoadError = this.translate.instant('ADMIN.BOOKINGS.DETAIL.LOAD_FAILED');
        },
      })
    );

    this.subscriptions.add(
      this.adminApiService.getBookingPayments(id).subscribe({
        next: (response) => {
          if (this.selectedBookingId !== id) {
            return;
          }
          this.isPaymentsFetching = false;
          this.paymentTransactions = response.data?.transactions ?? [];
        },
        error: () => {
          if (this.selectedBookingId !== id) {
            return;
          }
          this.isPaymentsFetching = false;
          this.paymentsLoadError = this.translate.instant('ADMIN.BOOKINGS.DETAIL.LOAD_FAILED');
        },
      })
    );
  }

  private toDetailFallback(row: BookingRow): AdminBookingDetailDto {
    return {
      id: row.id,
      bookingNumber: row.bookingId,
      status: row.bookingStatus,
      createdAt: row.bookingDate || undefined,
    };
  }

  protected closeDetail(): void {
    this.selectedBookingId = null;
    this.detailBooking = null;
    this.paymentTransactions = null;
    this.isDetailFetching = false;
    this.isPaymentsFetching = false;
    this.detailLoadError = '';
    this.paymentsLoadError = '';
  }

  protected onDetailBackdropDismiss(): void {
    this.closeDetail();
  }

  protected bookingStatusCode(status: string | AdminStatusDto | undefined): string {
    return parseAdminStatus(status).code;
  }

  protected bookingStatusLabel(status: string | AdminStatusDto | undefined): string {
    return parseAdminStatus(status, this.translate.currentLang).name;
  }

  protected ticketStatusCode(status: string | AdminStatusDto | undefined): string {
    return parseAdminStatus(status).code;
  }

  protected ticketStatusLabel(status: string | AdminStatusDto | undefined): string {
    return parseAdminStatus(status, this.translate.currentLang).name;
  }

  // Ticket-level status color mapping — a new small local method, following
  // this page's existing per-page duplication style (statusClass/paymentClass
  // above have no shared util either). REFUNDED is `.is-neutral` (§2.4): a
  // refunded ticket isn't an error state, it's a resolved one.
  protected ticketStatusClass(status: string): string {
    const normalized = status.toUpperCase();
    if (normalized === 'CONFIRMED' || normalized === 'ACTIVE') {
      return 'is-success';
    }
    if (normalized === 'PENDING') {
      return 'is-warning';
    }
    if (normalized === 'CANCELLED') {
      return 'is-danger';
    }
    return 'is-neutral';
  }

  protected journeyRouteLabel(journey: AdminBookingDetailJourneyDto): string {
    const from = getAdminLookupLabel(journey.fromStop) ?? '-';
    const to = getAdminLookupLabel(journey.toStop) ?? '-';
    return `${from} -> ${to}`;
  }

  protected formatMoney(
    amount: string | number | null | undefined,
    currency: string | null | undefined
  ): string {
    const value = Number(amount);
    if (!Number.isFinite(value)) {
      return '-';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'THB',
      maximumFractionDigits: 2,
    }).format(value);
  }

  // Client-composed timeline (design-system.md §12, new pattern) — no
  // history/audit endpoint exists. Built from fields already in hand:
  // created -> one entry per payment transaction -> expires (only if still
  // present) -> current status pinned last regardless of time sort.
  protected get timelineEvents(): TimelineEvent[] {
    const booking = this.detailBooking;
    if (!booking) {
      return [];
    }

    const events: TimelineEvent[] = [];
    if (booking.createdAt) {
      events.push({ time: booking.createdAt, labelKey: 'ADMIN.BOOKINGS.DETAIL.EVENT.CREATED' });
    }
    for (const tx of this.paymentTransactions ?? []) {
      if (tx.paidAt) {
        events.push({
          time: tx.paidAt,
          labelKey: 'ADMIN.BOOKINGS.DETAIL.EVENT.PAYMENT',
          params: { method: tx.paymentMethod ?? '-' },
        });
      }
    }
    if (booking.expiredAt) {
      events.push({ time: booking.expiredAt, labelKey: 'ADMIN.BOOKINGS.DETAIL.EVENT.EXPIRES' });
    }
    events.sort((a, b) => new Date(a.time ?? 0).getTime() - new Date(b.time ?? 0).getTime());

    events.push({
      time: null,
      labelKey: 'ADMIN.BOOKINGS.DETAIL.EVENT.CURRENT_STATUS',
      params: { status: this.bookingStatusLabel(booking.status) },
    });
    return events;
  }

  protected exportCsv(): void {
    const rows = this.filteredBookings;
    if (rows.length === 0) {
      return;
    }

    const headers = [
      this.translate.instant('ADMIN.BOOKINGS.BOOKING_ID'),
      this.translate.instant('ADMIN.BOOKINGS.BOOKER_NAME'),
      this.translate.instant('ADMIN.BOOKINGS.ROUTE'),
      this.translate.instant('ADMIN.BOOKINGS.BOOKING_DATE'),
      this.translate.instant('ADMIN.BOOKINGS.DEPARTURE_TIME'),
      this.translate.instant('ADMIN.BOOKINGS.TOTAL_FARE'),
      this.translate.instant('ADMIN.BOOKINGS.BOOKING_STATUS'),
      this.translate.instant('ADMIN.BOOKINGS.PAYMENT_STATUS'),
    ];

    const lines = rows.map((row) =>
      [
        row.bookingId,
        row.customer,
        row.route,
        // Rows carry raw ISO now (OBRS-178); format for the export too.
        this.displayDateTime(row.bookingDate),
        this.displayDateTime(row.departureTime),
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
