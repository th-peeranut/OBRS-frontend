import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import dayjs from 'dayjs';
import { Observable, combineLatest, map, startWith } from 'rxjs';
import {
  CANCELLABLE_BOOKING_STATUS,
  MyBookingDto,
  MyBookingView,
  SupportedLocale,
  getStopLabel,
  normalizeStatusCode,
  toAmountNumber,
} from '../../shared/interfaces/my-booking.interface';
import {
  invokeLoadMyBookingsApi,
  requestCancelBooking,
} from './store/my-bookings.action';
import {
  selectMyBookings,
} from './store/my-bookings.selector';

interface MyBookingsVm {
  items: MyBookingView[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  cancellingBookingId: number | null;
}

interface StatusFilterOption {
  /** API status slug, or '' for "all". */
  value: string;
  labelKey: string;
}

@Component({
  selector: 'app-my-bookings',
  templateUrl: './my-bookings.component.html',
  styleUrl: './my-bookings.component.scss',
})
export class MyBookingsComponent implements OnInit {
  selectedStatus = '';
  readonly skeletonRows = Array.from({ length: 3 });

  /** Booking whose e-ticket modal is open, or null when closed. */
  activeTicketBookingId: number | null = null;

  readonly statusFilters: StatusFilterOption[] = [
    { value: '', labelKey: 'MY_BOOKINGS.FILTERS.ALL' },
    { value: 'confirmed', labelKey: 'MY_BOOKINGS.FILTERS.CONFIRMED' },
    { value: 'pending', labelKey: 'MY_BOOKINGS.FILTERS.PENDING' },
    { value: 'cancelled', labelKey: 'MY_BOOKINGS.FILTERS.CANCELLED' },
    { value: 'expired', labelKey: 'MY_BOOKINGS.FILTERS.EXPIRED' },
  ];

  vm$!: Observable<MyBookingsVm>;

  private readonly monthLabels: Record<SupportedLocale, readonly string[]> = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
    zh: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  };

  constructor(
    private readonly store: Store,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    const locale$ = this.translate.onLangChange.pipe(
      map((event: LangChangeEvent) => this.normalizeLocale(event.lang)),
      startWith(this.normalizeLocale(this.translate.currentLang))
    );

    this.vm$ = combineLatest([this.store.select(selectMyBookings), locale$]).pipe(
      map(([state, locale]) => ({
        items: state.bookings.map((booking) => this.toView(booking, locale)),
        loading: state.loading,
        loaded: state.loaded,
        error: state.error,
        cancellingBookingId: state.cancellingBookingId,
      }))
    );

    this.store.dispatch(invokeLoadMyBookingsApi({ status: null }));
  }

  onStatusChange(status: string): void {
    if (status === this.selectedStatus) {
      return;
    }
    this.selectedStatus = status;
    // Switching filters keeps the current cards on screen, so surface the
    // global loading dialog instead of the (first-load only) skeletons.
    this.store.dispatch(
      invokeLoadMyBookingsApi({ status: status || null, showLoading: true })
    );
  }

  onCancel(booking: MyBookingView): void {
    this.store.dispatch(requestCancelBooking({ booking }));
  }

  /** Open the e-ticket modal for a paid booking. */
  onViewTicket(booking: MyBookingView): void {
    this.activeTicketBookingId = booking.id;
  }

  onCloseTicket(): void {
    this.activeTicketBookingId = null;
  }

  onRetry(): void {
    this.store.dispatch(
      invokeLoadMyBookingsApi({
        status: this.selectedStatus || null,
        showLoading: true,
      })
    );
  }

  trackById(_index: number, booking: MyBookingView): number {
    return booking.id;
  }

  statusClass(statusCode: string): string {
    switch (statusCode) {
      case 'confirmed':
        return 'is-success';
      case 'pending':
        return 'is-warning';
      case 'refunded':
        return 'is-info';
      default:
        // cancelled, expired, and any unknown status
        return 'is-danger';
    }
  }

  private toView(booking: MyBookingDto, locale: SupportedLocale): MyBookingView {
    const schedules = booking.bookingSchedules ?? [];
    const firstLeg = schedules[0];
    const fromLabel = getStopLabel(firstLeg?.fromStop, locale);
    const toLabel = getStopLabel(firstLeg?.toStop, locale);
    const route =
      fromLabel && toLabel
        ? `${fromLabel} → ${toLabel}`
        : fromLabel || toLabel || '-';

    const statusCode = normalizeStatusCode(booking.status);
    const totalAmount = toAmountNumber(booking.totalAmount);

    return {
      id: booking.id,
      bookingNumber: booking.bookingNumber?.trim() || `#BK-${booking.id}`,
      statusCode,
      bookingType: normalizeStatusCode(booking.bookingType) || 'one_way',
      route,
      departureLabel: this.formatDateTime(firstLeg?.departureDateTime, locale),
      passengerCount: firstLeg?.tickets?.length ?? 0,
      totalAmount,
      totalAmountLabel: this.formatCurrency(totalAmount),
      createdLabel: this.formatDateTime(booking.createdAt, locale),
      cancellable: statusCode === CANCELLABLE_BOOKING_STATUS,
      paid: statusCode === CANCELLABLE_BOOKING_STATUS,
    };
  }

  private formatDateTime(
    value: string | undefined,
    locale: SupportedLocale
  ): string {
    if (!value) {
      return '-';
    }
    const date = dayjs(value);
    if (!date.isValid()) {
      return '-';
    }
    const month = this.monthLabels[locale][date.month()];
    return `${date.date()} ${month} ${date.year()} • ${date.format('HH:mm')}`;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 2,
    }).format(value);
  }

  private normalizeLocale(locale: string | null | undefined): SupportedLocale {
    const value = (locale || '').toLowerCase();
    if (value.startsWith('th')) {
      return 'th';
    }
    if (value.startsWith('zh')) {
      return 'zh';
    }
    return 'en';
  }
}
