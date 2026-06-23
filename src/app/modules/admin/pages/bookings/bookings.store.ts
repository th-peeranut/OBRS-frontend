import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
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
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

export interface BookingRow {
  bookingId: string;
  customer: string;
  route: string;
  bookingDate: string;
  departureTime: string;
  totalFare: string;
  bookingStatus: string;
  paymentStatus: string;
}

export interface StatusOption {
  code: string;
  label: string;
}

export interface BookingsData {
  rows: BookingRow[];
  statusOptions: StatusOption[];
}

/**
 * Stale-while-revalidate cache for the bookings page. Rows are locale-
 * independent (statuses parsed in 'en'), so — like the dashboard — the store
 * caches the fully computed rows. This is especially valuable here because
 * each load fans out into one payment request per booking (N+1); caching
 * skips that whole burst on re-entry.
 */
@Injectable({ providedIn: 'root' })
export class BookingsStore extends AdminCollectionStore<BookingsData> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<BookingsData> {
    const response = await firstValueFrom(this.adminApiService.getBookings());
    const bookings = response?.data?.content ?? [];

    const paymentStatusMap = await this.loadPaymentStatusMap(bookings);
    const rows = bookings.map((booking) =>
      this.toBookingRow(booking, paymentStatusMap.get(booking.id))
    );

    return { rows, statusOptions: this.buildStatusOptions(rows) };
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

    const departureDateTimeRaw =
      booking.bookingSchedules?.[0]?.departureDateTime ??
      booking.journeys?.[0]?.departureDateTime ??
      null;

    return {
      bookingId: booking.bookingNumber ?? `#BK-${booking.id}`,
      customer: booking.contact?.fullName ?? booking.actor?.name ?? '-',
      route,
      bookingDate: this.formatDateTime(booking.createdAt),
      departureTime: this.formatDateTime(departureDateTimeRaw),
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

  private formatDateTime(value: string | null | undefined): string {
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
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
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
