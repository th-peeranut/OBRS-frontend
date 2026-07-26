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
import { AuthService } from '../../../../auth/auth.service';

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
  // OBRS-727: a 403 is not a load failure. While the list endpoint was
  // ADMIN-only, an owner walked in through the /admin shell guard
  // (ROLE_GRANTS.owner includes 'admin'), the GET 403'd, and this page said
  // "Unable to load booking data from backend" — indistinguishable from the
  // backend being down, so the reader concluded the system had no bookings
  // rather than that the page was not theirs. The endpoint now admits OWNER,
  // but the distinction has to exist for whoever is denied next: OBRS-728 will
  // scope this list per fleet, and 403 is exactly what an out-of-scope caller
  // must then read as "not yours".
  protected isForbidden = false;

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

  // Override-cancel (OBRS-690 / OBRS-661 AC9). OWNER-only — the backend endpoint
  // is @PreAuthorize("hasRole('OWNER')") (ADMIN inherits, SALESPERSON gets 403),
  // and hasAnyRole(['owner']) resolves to exactly {owner, admin} on the FE, so
  // the button never shows to a salesperson who would only bounce off a 403.
  protected readonly canOverrideCancel: boolean;
  protected isOverrideCancelOpen = false;

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly translate: TranslateService,
    private readonly store: BookingsStore,
    private readonly adminApiService: AdminApiService,
    private readonly authService: AuthService
  ) {
    this.canOverrideCancel = this.authService.hasAnyRole(['owner']);
  }

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
      // OBRS-506: honor a null emission (OBRS-467 shape) — clear() (e.g.
      // logout) DISCARDS the cached value; the old `if (data)` guard kept the
      // previous session's rows on screen.
      this.store.data$.subscribe((data) => {
        this.allBookings = data?.rows ?? [];
        this.statusOptions = data?.statusOptions ?? [];
        // Preserve the user's current page across a background revalidate;
        // only clamp it if the (possibly smaller) result set has fewer pages.
        this.currentPage = Math.min(this.currentPage, this.totalPages);
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        // A denial is never a transient refresh hiccup, so it wins over both
        // the "showing stale data" hint and the generic load-failure text —
        // even when a cached list is on screen, which after a denial is data
        // this caller is no longer entitled to see.
        this.isForbidden = failed && this.store.errorStatus === 403;
        this.refreshFailed = failed && !this.isForbidden && this.store.hasValue;
        this.errorMessage = this.isForbidden
          ? this.translate.instant('ADMIN.BOOKINGS.FORBIDDEN')
          : failed && !this.store.hasValue
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
      normalizedStatus === 'REFUNDED' ||
      // OBRS-298: booking still live, gross collected >= total, part of it
      // since refunded — nothing outstanding, so this reads as "success"
      // (§2.4), not a warning like PARTIAL_PAID (which still owes money).
      normalizedStatus === 'REFUNDED_PARTIAL'
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

  // OBRS-298: these badges were rendered raw with no translate pipe.
  //
  // The value bound to the row badge is NOT one vocabulary. BookingsStore
  // .toBookingRow picks the first of three sources and then humanises it with
  // .replace(/_/g, ' ').toUpperCase():
  //   1. the API's EOverallPaymentStatus code   -> unpaid/partial_paid/...
  //   2. booking.payment?.status                -> EPaymentStatus (paid/...)
  //   3. inferPaymentStatusFromBookingStatus()  -> FAILED/SUCCESS/PENDING
  // Only (1) is the booking-level vocabulary this card is about, but all
  // three land in the same badge, so translating only (1) would have turned
  // the other two into "Unknown" — a regression introduced by the fix. Look
  // the code up in the booking-level map first, then the transaction-level
  // map, and only then fall back to a translated "unknown" (never a bare
  // key). Source (3) fabricating a payment status out of a BOOKING status is
  // its own defect and has its own card — it is not papered over here.
  //
  // The detail-modal summary passes the raw "partial_paid" straight through,
  // so normalise both shapes back to lower_snake_case before the lookup.
  protected paymentStatusLabel(status: string | null | undefined): string {
    return this.lookupStatusLabel(status, [
      'ADMIN.BOOKINGS.PAYMENT_STATUS_CODES',
      'ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES',
    ]);
  }

  // OBRS-298: the per-transaction row in the detail modal carries an
  // EPaymentStatus value, a different vocabulary from the booking-level codes
  // above — resolve it against the transaction map only, so a booking-level
  // code can never be silently rendered with a transaction label.
  protected transactionStatusLabel(status: string | null | undefined): string {
    return this.lookupStatusLabel(status, ['ADMIN.BOOKINGS.TRANSACTION_STATUS_CODES']);
  }

  private lookupStatusLabel(status: string | null | undefined, namespaces: string[]): string {
    const code = (status ?? '').trim().replace(/\s+/g, '_').toLowerCase();
    if (code) {
      for (const namespace of namespaces) {
        const key = `${namespace}.${code}`;
        const translated = this.translate.instant(key);
        // ngx-translate returns the key itself when the entry is missing.
        if (translated && translated !== key) {
          return translated;
        }
      }
    }
    return this.translate.instant('ADMIN.BOOKINGS.PAYMENT_STATUS_CODES.unknown');
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

  // ── Override-cancel (OBRS-690) ─────────────────────────────────────────

  // Only a CONFIRMED booking can be override-cancelled (the backend rejects
  // anything else). Gates the button so an already-cancelled/pending booking
  // never offers it.
  protected get isDetailCancellable(): boolean {
    const booking = this.detailBooking;
    if (!booking) {
      return false;
    }
    return this.bookingStatusCode(booking.status).toUpperCase() === 'CONFIRMED';
  }

  protected openOverrideCancel(): void {
    if (!this.canOverrideCancel || !this.isDetailCancellable) {
      return;
    }
    this.isOverrideCancelOpen = true;
  }

  protected onOverrideCancelClosed(): void {
    this.isOverrideCancelOpen = false;
  }

  // A successful override-cancel: close both dialogs and revalidate the list so
  // the row's status flips to CANCELLED.
  protected onOverrideCancelled(): void {
    this.isOverrideCancelOpen = false;
    this.closeDetail();
    void this.store.refresh();
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
