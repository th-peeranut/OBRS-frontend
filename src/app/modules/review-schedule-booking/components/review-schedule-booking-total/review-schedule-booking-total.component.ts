import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { ScheduleBooking } from '../../../../shared/interfaces/schedule-booking.interface';
import { parsePricePerSeat } from '../../../../shared/lib/trip-format';
import {
  Schedule,
  ScheduleFilter,
} from '../../../../shared/interfaces/schedule.interface';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleBooking } from '../../../../shared/stores/schedule-booking/schedule-booking.selector';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { selectPassengerInfo } from '../../../../shared/stores/passenger-info/passenger-info.selector';
import { PassengerInfo } from '../../../../shared/interfaces/passenger-info.interface';
import { formatMoney } from '../../../../shared/lib/money-display';

@Component({
    selector: 'app-review-schedule-booking-total',
    templateUrl: './review-schedule-booking-total.component.html',
    styleUrl: './review-schedule-booking-total.component.scss',
    standalone: false
})
export class ReviewScheduleBookingTotalComponent {
  scheduleBooking: Observable<ScheduleBooking>;
  scheduleFilter: Observable<ScheduleFilter>;
  passengerInfo$: Observable<PassengerInfo[] | null>;

  constructor(
    private store: Store,
    private router: Router,
    private appStore: Store<Appstate>,
    private translateService: TranslateService
  ) {
    this.scheduleBooking = this.store.pipe(select(selectScheduleBooking));
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));
    this.passengerInfo$ = this.store.pipe(select(selectPassengerInfo));
  }

  getScheduleBooking(schedule?: Schedule[] | null): Schedule[] {
    return schedule ?? [];
  }

  /**
   * OBRS-1384 AC-3. This page comes BEFORE /passenger-info in the stepper, so the
   * two directions through it have DIFFERENT correct answers and the fix OBRS-1226
   * applied to /passenger-info would be wrong here.
   *
   * On the way forward no passenger row exists yet, and `scheduleFilter` — the
   * headcount typed on the search page — is the only source there is and the right
   * one; reading the passengers alone would print "0 คน" on every normal visit. It
   * is only on the way BACK (`passenger-info.component.ts` -> onBack()) that
   * passenger rows exist, and from then on they are what the tickets will be,
   * OPEN-seating +/- and adult/child radio included. So: real passengers when there
   * are any, the search filter when there are none.
   */
  getAdultCount(
    filter?: ScheduleFilter | null,
    passengers?: PassengerInfo[] | null
  ): number {
    if (passengers?.length) {
      return passengers.filter((p) => p.isAdult).length;
    }
    return filter?.passengerInfo?.find((p) => p.type === 'ADULT')?.count ?? 0;
  }

  getKidCount(
    filter?: ScheduleFilter | null,
    passengers?: PassengerInfo[] | null
  ): number {
    if (passengers?.length) {
      return passengers.filter((p) => !p.isAdult).length;
    }
    return filter?.passengerInfo?.find((p) => p.type === 'KIDS')?.count ?? 0;
  }

  sumPassengers(
    filter?: ScheduleFilter | null,
    passengers?: PassengerInfo[] | null
  ): number {
    if (passengers?.length) {
      return passengers.length;
    }
    return (
      filter?.passengerInfo?.reduce((total, item) => total + item.count, 0) ?? 0
    );
  }

  sumFare(
    items?: Schedule[] | null,
    filter?: ScheduleFilter | null,
    passengers?: PassengerInfo[] | null
  ): number {
    const sumPassengers = this.sumPassengers(filter, passengers) ?? 0;
    const sumFare =
      items?.reduce((total, item) => total + this.getPricePerSeat(item?.pricePerSeat), 0) ??
      0;
    return sumFare * sumPassengers;
  }

  getPricePerSeat(value: string | number | null | undefined): number {
    return parsePricePerSeat(value);
  }

  onConfirm(): void {
    this.router.navigate(['/passenger-info']);
  }
  /** OBRS-1592: this screen used to compose the raw number with a `*_UNIT`
   * i18n key, which is the same shape the search page carried and printed
   * `1850 บาท` — no thousand separator, satang whenever the API sent them. */
  protected formatMoney(value: number | string | null | undefined): string {
    return formatMoney(value, this.translateService.currentLang);
  }

}
