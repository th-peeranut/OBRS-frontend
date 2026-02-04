import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { ScheduleBooking } from '../../../../shared/interfaces/schedule-booking.interface';
import {
  Schedule,
  ScheduleFilter,
} from '../../../../shared/interfaces/schedule.interface';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleBooking } from '../../../../shared/stores/schedule-booking/schedule-booking.selector';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';

@Component({
  selector: 'app-review-schedule-booking-total',
  templateUrl: './review-schedule-booking-total.component.html',
  styleUrl: './review-schedule-booking-total.component.scss',
})
export class ReviewScheduleBookingTotalComponent {
  scheduleBooking: Observable<ScheduleBooking>;
  scheduleFilter: Observable<ScheduleFilter>;

  constructor(
    private store: Store,
    private router: Router,
    private appStore: Store<Appstate>,
    private translateService: TranslateService
  ) {
    this.scheduleBooking = this.store.pipe(select(selectScheduleBooking));
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));
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

  sumFare(items?: Schedule[] | null, passengers?: { type: string; count: number }[]): number {
    const sumPassengers = this.sumPassengers(passengers) ?? 0;
    const sumFare =
      items?.reduce((total, item) => total + this.getPricePerSeat(item?.pricePerSeat), 0) ??
      0;
    return sumFare * sumPassengers;
  }

  getPricePerSeat(value: string | number | null | undefined): number {
    const parsed = typeof value === 'string' ? parseFloat(value) : value ?? 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  onConfirm(): void {
    this.router.navigate(['/passenger-info']);
  }
}
