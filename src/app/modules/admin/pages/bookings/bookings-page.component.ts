import { Component, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminBookingDto,
  AdminPaymentByBookingIdDto,
  AdminTranslationDto,
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

@Component({
  selector: 'app-bookings-page',
  templateUrl: './bookings-page.component.html',
  styleUrl: './bookings-page.component.scss',
})
export class BookingsPageComponent implements OnInit {
  protected bookings: BookingRow[] = [
    {
      bookingId: '#BK-22910',
      customer: 'John Simmons',
      route: 'SFO -> LAX',
      bookingDate: 'Oct 24, 2023',
      totalFare: '$245.00',
      bookingStatus: 'CONFIRMED',
      paymentStatus: 'SUCCESS',
    },
    {
      bookingId: '#BK-22911',
      customer: 'Amanda Miller',
      route: 'NYC -> PHL',
      bookingDate: 'Oct 24, 2023',
      totalFare: '$89.50',
      bookingStatus: 'PENDING',
      paymentStatus: 'PENDING',
    },
    {
      bookingId: '#BK-22912',
      customer: 'Robert Taylor',
      route: 'CHI -> DET',
      bookingDate: 'Oct 23, 2023',
      totalFare: '$112.00',
      bookingStatus: 'CANCELLED',
      paymentStatus: 'FAILED',
    },
    {
      bookingId: '#BK-22913',
      customer: 'Linda White',
      route: 'SEA -> POR',
      bookingDate: 'Oct 23, 2023',
      totalFare: '$55.00',
      bookingStatus: 'CONFIRMED',
      paymentStatus: 'SUCCESS',
    },
  ];

  protected isLoading = false;
  protected errorMessage = '';

  constructor(private readonly adminApiService: AdminApiService) {}

  async ngOnInit(): Promise<void> {
    await this.loadBookings();
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
    const normalizedStatus = status.toUpperCase();

    if (
      normalizedStatus === 'SUCCESS' ||
      normalizedStatus === 'PAID' ||
      normalizedStatus === 'FULLY_PAID'
    ) {
      return 'is-success';
    }

    if (normalizedStatus === 'PENDING' || normalizedStatus === 'PARTIAL') {
      return 'is-warning';
    }

    return 'is-danger';
  }

  protected get pendingPaymentCount(): number {
    return this.bookings.filter((booking) => this.paymentClass(booking.paymentStatus) === 'is-warning').length;
  }

  protected get totalRevenue(): string {
    const amount = this.bookings.reduce((sum, booking) => {
      const parsedAmount = Number(booking.totalFare.replaceAll('$', '').replaceAll(',', ''));
      return Number.isFinite(parsedAmount) ? sum + parsedAmount : sum;
    }, 0);

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(amount);
  }

  private async loadBookings(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const response = await firstValueFrom(this.adminApiService.getBookings());
      const bookings = response?.data ?? [];

      const paymentStatusMap = await this.loadPaymentStatusMap(bookings);
      this.bookings = bookings.map((booking) =>
        this.toBookingRow(booking, paymentStatusMap.get(booking.id))
      );
    } catch {
      this.errorMessage = 'Unable to load booking data from backend.';
    } finally {
      this.isLoading = false;
    }
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
    return payment?.paymentSummary?.overallPaymentStatus ?? null;
  }

  private toBookingRow(
    booking: AdminBookingDto,
    paymentStatus: string | null | undefined
  ): BookingRow {
    const firstSchedule = booking.bookingSchedules?.[0];
    const fromStop =
      this.getTranslationLabel(firstSchedule?.fromStop?.translations, 'en') ??
      firstSchedule?.fromStop?.slug ??
      '-';
    const toStop =
      this.getTranslationLabel(firstSchedule?.toStop?.translations, 'en') ??
      firstSchedule?.toStop?.slug ??
      '-';
    const route = `${fromStop} -> ${toStop}`;

    const totalAmount = Number(booking.totalAmount);
    const totalFare = Number.isFinite(totalAmount)
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
        }).format(totalAmount)
      : String(booking.totalAmount ?? '$0.00');

    return {
      bookingId: booking.bookingNumber ?? `#BK-${booking.id}`,
      customer: booking.contact?.fullName ?? booking.actor?.fullName ?? '-',
      route,
      bookingDate: this.formatDate(booking.createdAt),
      totalFare,
      bookingStatus: (booking.status ?? 'UNKNOWN').replace(/_/g, ' ').toUpperCase(),
      paymentStatus: (
        paymentStatus ??
        this.inferPaymentStatusFromBookingStatus(booking.status)
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
    translations: AdminTranslationDto[] | null | undefined,
    locale?: string
  ): string | null {
    if (!translations || translations.length === 0) {
      return null;
    }

    if (locale) {
      const translation = translations.find(
        (item) => item.locale?.toLowerCase() === locale.toLowerCase()
      );

      if (translation?.label) {
        return translation.label;
      }
    }

    return translations.find((item) => item.label)?.label ?? null;
  }
}

