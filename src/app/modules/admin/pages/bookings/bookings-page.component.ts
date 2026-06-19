import { Component, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminBookingDto,
  AdminPaymentByBookingIdDto,
  AdminStatusDto,
  AdminTranslationCollection,
  getAdminLookupCode,
  getAdminLookupLabel,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';

interface BookingRow {
  bookingId: string;
  customer: string;
  route: string;
  bookingDate: string;
  totalFare: string;
  bookingStatus: string;
  paymentStatus: string;
}

interface StatusOption {
  code: string;
  label: string;
}

@Component({
  selector: 'app-bookings-page',
  templateUrl: './bookings-page.component.html',
  styleUrl: './bookings-page.component.scss',
})
export class BookingsPageComponent implements OnInit {
  protected allBookings: BookingRow[] = [];

  protected isLoading = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected errorMessage = '';

  protected searchTerm = '';
  protected selectedStatus = '';
  protected statusOptions: StatusOption[] = [];

  protected readonly pageSize = 10;
  protected currentPage = 1;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly translate: TranslateService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadBookings();
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

  private async loadBookings(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const response = await firstValueFrom(this.adminApiService.getBookings());
      const bookings = response?.data?.content ?? [];

      const paymentStatusMap = await this.loadPaymentStatusMap(bookings);
      this.allBookings = bookings.map((booking) =>
        this.toBookingRow(booking, paymentStatusMap.get(booking.id))
      );
      this.statusOptions = this.buildStatusOptions(this.allBookings);
      this.currentPage = 1;
    } catch {
      this.errorMessage = this.translate.instant('ADMIN.BOOKINGS.LOAD_FAILED');
    } finally {
      this.isLoading = false;
    }
  }

  private buildStatusOptions(bookings: BookingRow[]): StatusOption[] {
    const codes = Array.from(
      new Set(bookings.map((booking) => booking.bookingStatus).filter((code) => code.length > 0))
    ).sort();
    return codes.map((code) => ({ code, label: code }));
  }

  private async loadPaymentStatusMap(
    bookings: AdminBookingDto[]
  ): Promise<Map<number, string>> {
    const statusMap = new Map<number, string>();

    const paymentRequests = bookings
      .filter((booking) => Number.isFinite(booking.id))
      .map((booking) => this.loadPaymentStatusByBookingId(booking.id));

    const paymentResults = await Promise.all(paymentRequests);
    for (const result of paymentResults) {
      if (result.status) {
        statusMap.set(result.bookingId, result.status);
      }
    }

    return statusMap;
  }

  private async loadPaymentStatusByBookingId(
    bookingId: number
  ): Promise<{ bookingId: number; status: string | null }> {
    try {
      const response = await firstValueFrom(this.adminApiService.getBookingPayments(bookingId));
      const payment = response?.data;
      const status = this.extractPaymentStatus(payment);
      return { bookingId, status };
    } catch {
      return { bookingId, status: null };
    }
  }

  private extractPaymentStatus(
    payment: AdminPaymentByBookingIdDto | null | undefined
  ): string | null {
    return (
      payment?.paymentSummary?.status ??
      payment?.paymentSummary?.overallPaymentStatus ??
      null
    );
  }

  private toBookingRow(
    booking: AdminBookingDto,
    paymentStatus: string | null | undefined
  ): BookingRow {
    const firstSchedule = booking.journeys?.[0] ?? booking.bookingSchedules?.[0];
    const fromStop = (
      getAdminLookupLabel(firstSchedule?.fromStop, 'en') ??
      this.getTranslationLabel(firstSchedule?.fromStop?.translations, 'en') ??
      getAdminLookupCode(firstSchedule?.fromStop)
    ) ||
      '-';
    const toStop = (
      getAdminLookupLabel(firstSchedule?.toStop, 'en') ??
      this.getTranslationLabel(firstSchedule?.toStop?.translations, 'en') ??
      getAdminLookupCode(firstSchedule?.toStop)
    ) ||
      '-';
    const route = `${fromStop} -> ${toStop}`;

    const totalAmount = Number(
      booking.totalAmount ??
      booking.pricing?.netAmount ??
      booking.payment?.totalAmount
    );
    const currency = booking.pricing?.currency ?? booking.payment?.currency ?? 'THB';
    const totalFare = Number.isFinite(totalAmount)
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency,
          maximumFractionDigits: 2,
        }).format(totalAmount)
      : String(booking.totalAmount ?? booking.pricing?.netAmount ?? '0.00');

    const bookingStatus = this.parseStatus(booking.status);

    return {
      bookingId: booking.bookingNumber ?? `#BK-${booking.id}`,
      customer: booking.contact?.fullName ?? booking.actor?.name ?? '-',
      route,
      bookingDate: this.formatDate(booking.createdAt),
      totalFare,
      bookingStatus: bookingStatus.name,
      paymentStatus: (
        paymentStatus ??
        booking.payment?.status ??
        this.inferPaymentStatusFromBookingStatus(bookingStatus.code)
      )
        .replace(/_/g, ' ')
        .toUpperCase(),
    };
  }

  private inferPaymentStatusFromBookingStatus(status: string | null | undefined): string {
    const normalizedStatus = (status ?? '').toUpperCase();
    if (normalizedStatus === 'CANCELLED') {
      return 'FAILED';
    }

    if (normalizedStatus === 'CONFIRMED' || normalizedStatus === 'COMPLETED') {
      return 'SUCCESS';
    }

    return 'PENDING';
  }

  private formatDate(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
  }

  private getTranslationLabel(
    translations: AdminTranslationCollection | null | undefined,
    locale?: string
  ): string | null {
    return getAdminTranslationLabel(translations, locale);
  }

  private parseStatus(value: string | AdminStatusDto | null | undefined): {
    code: string;
    name: string;
  } {
    return parseAdminStatus(value, 'en');
  }
}
