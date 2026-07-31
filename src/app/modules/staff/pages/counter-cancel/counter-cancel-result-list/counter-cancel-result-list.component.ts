import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  CANCELLABLE_BOOKING_STATUS,
  getStopLabel,
  normalizeStatusCode,
  SupportedLocale,
  toAmountNumber,
} from '../../../../../shared/interfaces/my-booking.interface';
import {
  CounterBookingSearchJourneyDto,
  CounterBookingSearchResultDto,
} from '../../../../../services/staff/staff-api.service';
import { formatDisplayDateTime } from '../../../../../shared/lib/display-date-time';

/**
 * OBRS-766 — dumb result table. Columns/i18n keys per the UX spec: most are
 * REUSED verbatim from the customer my-bookings vocabulary (`MY_BOOKINGS.*`)
 * and the admin bookings table (`ADMIN.BOOKINGS.*`) — only CUSTOMER/PHONE are
 * new keys, because the customer's my-bookings list never shows a phone
 * column (it's always "your own" bookings) and never needs a name column
 * either.
 *
 * The phone column renders `contactPhoneMasked` VERBATIM — it is already
 * masked server-side; this component must never re-mask or reformat it
 * (that would risk hiding a digit the backend deliberately left visible).
 * Because the phone is masked, the row's other four fields (name, booking
 * number, route/departure, amount) are what let the operator confirm they
 * have the right booking.
 */
@Component({
    selector: 'app-counter-cancel-result-list',
    templateUrl: './counter-cancel-result-list.component.html',
    styleUrl: './counter-cancel-result-list.component.scss',
    standalone: false
})
export class CounterCancelResultListComponent {
  @Input() results: CounterBookingSearchResultDto[] = [];
  @Input() loading = false;
  @Input() hasSearched = false;
  @Input() page = 1;
  @Input() totalPages = 1;

  @Output() readonly selectBooking = new EventEmitter<CounterBookingSearchResultDto>();
  @Output() readonly pageChange = new EventEmitter<number>();

  protected readonly skeletonRows = [1, 2, 3];

  constructor(private readonly translate: TranslateService) {}

  protected trackByBookingId(_index: number, row: CounterBookingSearchResultDto): number {
    return row.bookingId;
  }

  /** Same precedent as `MyBookingsComponent`: a booking can only be cancelled
   * by the traveler (here: on the traveler's behalf) while `confirmed`. */
  protected isCancellable(row: CounterBookingSearchResultDto): boolean {
    return normalizeStatusCode(row.status) === CANCELLABLE_BOOKING_STATUS;
  }

  /** Mirrors `MyBookingsComponent.statusClass()` — same status vocabulary
   * (`MY_BOOKINGS.STATUS.*`), so the same colour mapping applies. Kept as its
   * own small method rather than extracted to a shared util: neither
   * `MyBookingsComponent` nor `BookingsPageComponent`'s own `statusClass()`
   * share one either (existing per-page duplication convention for this
   * exact shape, per that page's own in-code comment). */
  protected statusClass(status: string): string {
    switch (normalizeStatusCode(status)) {
      case 'confirmed':
        return 'is-success';
      case 'pending':
        return 'is-warning';
      case 'refunded':
        return 'is-info';
      default:
        return 'is-danger';
    }
  }

  protected statusLabelKey(status: string): string {
    return `MY_BOOKINGS.STATUS.${normalizeStatusCode(status)}`;
  }

  protected routeLabel(journey: CounterBookingSearchJourneyDto): string {
    const locale = this.translate.currentLang as SupportedLocale;
    const from = getStopLabel(journey.fromStop, locale);
    const to = getStopLabel(journey.toStop, locale);
    if (!from && !to) {
      return '-';
    }
    return `${from || '-'} → ${to || '-'}`;
  }

  protected departureLabel(journey: CounterBookingSearchJourneyDto): string {
    if (!journey.departureDateTime) {
      return '-';
    }
    return formatDisplayDateTime(journey.departureDateTime, this.translate.currentLang);
  }

  protected amountLabel(netAmount: number | string): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 2,
    }).format(toAmountNumber(netAmount));
  }
}
