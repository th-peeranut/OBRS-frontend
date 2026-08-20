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
import { selectPassengerInfo } from '../../../../shared/stores/passenger-info/passenger-info.selector';
import { PassengerInfo } from '../../../../shared/interfaces/passenger-info.interface';

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
  /**
   * OBRS-1384: the passengers that became this booking's tickets, dispatched by
   * /passenger-info immediately before it created the booking
   * (`passenger-info.component.ts` -> `invokeSetPassengerInfo`). Same source
   * OBRS-1226 moved the sibling summary on that page to, for the same reason.
   */
  passengerInfo$: Observable<PassengerInfo[] | null>;
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
    this.passengerInfo$ = this.store.pipe(select(selectPassengerInfo));
  }

  hasDiscount(booking: BookingState | null | undefined): boolean {
    return Number(booking?.discountAmountSnapshot ?? 0) > 0;
  }

  getScheduleBooking(schedule?: Schedule[] | null): Schedule[] {
    return schedule ?? [];
  }

  /**
   * OBRS-1384: counted off the passenger rows that become the real tickets, not
   * off `scheduleFilter.passengerInfo` — that only ever holds what was typed on
   * the SEARCH page and never hears about the OPEN-seating +/- stepper or the
   * adult/child radio on /passenger-info. Printing it here put "ผู้ใหญ่ 1 คน"
   * directly above a server total of 380.
   */
  getAdultCount(passengers?: PassengerInfo[] | null): number {
    return passengers?.filter((p) => p.isAdult).length ?? 0;
  }

  getKidCount(passengers?: PassengerInfo[] | null): number {
    return passengers?.filter((p) => !p.isAdult).length ?? 0;
  }

  sumPassengers(items?: PassengerInfo[] | null): number {
    return items?.length ?? 0;
  }

  sumFare(
    items?: Schedule[] | null,
    passengers?: PassengerInfo[] | null
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
