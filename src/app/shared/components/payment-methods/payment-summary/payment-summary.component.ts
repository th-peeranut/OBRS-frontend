import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { BookingState } from '../../../../shared/interfaces/booking.interface';
import { ScheduleBooking } from '../../../../shared/interfaces/schedule-booking.interface';
import { parsePricePerSeat } from '../../../../shared/lib/trip-format';
import { ScheduleFilter, Schedule } from '../../../../shared/interfaces/schedule.interface';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectBooking } from '../../../../shared/stores/booking/booking.selector';
import { selectScheduleBooking } from '../../../../shared/stores/schedule-booking/schedule-booking.selector';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';

@Component({
    selector: 'app-payment-summary',
    templateUrl: './payment-summary.component.html',
    styleUrl: './payment-summary.component.scss',
    standalone: false
})
export class PaymentSummaryComponent {
  @Input() variant: 'default' | 'inline' = 'default';
  /**
   * OBRS-415: this component's default rendering derives the total entirely
   * from the seat-booking `scheduleBooking`/`scheduleFilter`/`booking` NgRx
   * stores (passenger count × fare, discount snapshot) — none of which a
   * non-seat booking (e.g. a parcel) ever populates, which would otherwise
   * render a silent "0 บาท" total while the real amount is charged
   * server-side. Optional, null-default so every existing call site (seat
   * booking, reschedule/change-stop dialogs) stays byte-identical
   * (design-system §10 "extend, don't fork"); when set, the template renders
   * a single total line from this value instead of the seat-booking
   * breakdown. */
  @Input() amountOverride: number | null = null;
  scheduleBooking: Observable<ScheduleBooking>;
  scheduleFilter: Observable<ScheduleFilter>;
  // OBRS-85: only the post-booking-creation payment summary can show a real
  // discount — the server computes discountAmountSnapshot/netAmount only once
  // the booking exists (see AGENT_MEMORY.md Finding 1). Never precompute one.
  booking: Observable<BookingState | null>;

  constructor(
    private store: Store,
    private router: Router,
    private appStore: Store<Appstate>,
    private translateService: TranslateService
  ) {
    this.scheduleBooking = this.store.pipe(select(selectScheduleBooking));
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));
    this.booking = this.store.pipe(select(selectBooking));
  }

  hasDiscount(booking: BookingState | null | undefined): boolean {
    return Number(booking?.discountAmountSnapshot ?? 0) > 0;
  }

  getScheduleBooking(schedule?: Schedule[] | null): Schedule[] {
    return schedule ?? [];
  }

  getAdultCount(passengers?: { type: string; count: number }[]): number {
    return passengers?.find((p) => p.type === 'ADULT')?.count ?? 0;
  }

  getKidCount(passengers?: { type: string; count: number }[]): number {
    return passengers?.find((p) => p.type === 'KIDS')?.count ?? 0;
  }

  sumPassengers(items?: { type: string; count: number }[]): number {
    return items?.reduce((total, item) => total + item.count, 0) ?? 0;
  }

  sumFare(
    items?: Schedule[] | null,
    passengers?: { type: string; count: number }[]
  ): number {
    const sumPassengers = this.sumPassengers(passengers) ?? 0;
    const sumFare =
      items?.reduce((total, item) => total + this.getPricePerSeat(item?.pricePerSeat), 0) ?? 0;
    return sumFare * sumPassengers;
  }

  getPricePerSeat(value: string | number | null | undefined): number {
    return parsePricePerSeat(value);
  }
}
