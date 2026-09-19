import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { PaymentSummaryComponent } from './payment-summary.component';
import { BookingState } from '../../../interfaces/booking.interface';
import { PassengerInfo } from '../../../interfaces/passenger-info.interface';
import {
  selectBooking,
  selectBookingNetAmount,
} from '../../../stores/booking/booking.selector';
import { selectPassengerInfo } from '../../../stores/passenger-info/passenger-info.selector';
import { selectScheduleBooking } from '../../../stores/schedule-booking/schedule-booking.selector';
import { selectScheduleFilter } from '../../../stores/schedule-filter/schedule-filter.selector';

/**
 * OBRS-1986 (AC-5/AC-7) - the money assertions, made against the RENDERED summary rather
 * than against a helper method, because the defect lived in the template's choice of
 * branch and not in any single function.
 *
 * PROD, 2026-09-19: a refresh of /payment emptied the NgRx passenger store (it is never
 * persisted - names and phone numbers must not be written to the customer's machine,
 * OBRS-903) while the trip selection survived in `obrs.booking_context`. The summary's
 * fallback total, `pricePerSeat x passengerCount`, therefore resolved to `200 x 0` and the
 * screen printed "0 baht" beside a live pay button while the backend charged 200.
 *
 * These fixtures reproduce exactly that state: a 200-baht fare, an EMPTY passenger store,
 * and a booking whose server-side `netAmount` is 400. The old template printed `THB 0`
 * here; the only acceptable answers now are the server's 400, or no number at all.
 */
describe('PaymentSummaryComponent - the total comes from the server (OBRS-1986)', () => {
  const FARE_200 = {
    scheduleBooking: { schedule: [{ pricePerSeat: '200' }] },
    scheduleFilter: { roundTrip: {}, passengerInfo: [] },
  };

  let fixture: ComponentFixture<PaymentSummaryComponent>;

  /**
   * `MockStore.overrideSelector` writes its answer into the MEMOIZED SELECTOR, which is
   * module-scoped and therefore shared by every spec in the browser session - and it is
   * not undone when that spec's TestBed is torn down. `passenger-info-form.component.spec`
   * overrides `selectScheduleBooking`/`selectPassengerInfo` and leaves them overridden, so
   * without this these tests silently rendered THAT spec's van schedule and no passengers,
   * whatever the fixture below said. It passed in isolation and failed in the full run.
   */
  beforeEach(() => {
    for (const selector of [
      selectScheduleBooking,
      selectScheduleFilter,
      selectPassengerInfo,
      selectBooking,
      selectBookingNetAmount,
    ]) {
      selector.clearResult();
      selector.release();
    }
  });

  function render(state: Record<string, unknown>): string {
    const store = {
      pipe: (...operators: unknown[]) =>
        (of(state) as unknown as { pipe: (...o: unknown[]) => unknown }).pipe(
          ...operators
        ),
      select: (selector: (s: unknown) => unknown) => of(selector(state)),
      dispatch: () => undefined,
    };

    TestBed.configureTestingModule({
      declarations: [PaymentSummaryComponent],
      imports: [CommonModule, TranslateModule.forRoot()],
      providers: [
        { provide: Store, useValue: store },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      ],
    });

    fixture = TestBed.createComponent(PaymentSummaryComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('prints the server netAmount, not fare x headcount, after a refresh emptied the passenger store', () => {
    const text = render({
      ...FARE_200,
      passengerInfo: null,
      booking: {
        bookingId: 77,
        bookingNumber: 'BK-77',
        netAmount: 400,
        adultCount: 2,
        childCount: 0,
      } as BookingState,
    });

    expect(text).toContain('THB 400');
    // The defect, stated as its own assertion: `200 x 0` must not reach the screen.
    expect(text).not.toContain('THB 0');
  });

  it('shows a placeholder instead of a computed number when the server total is missing', () => {
    const text = render({
      ...FARE_200,
      passengerInfo: [
        { isAdult: true } as PassengerInfo,
        { isAdult: true } as PassengerInfo,
      ],
      booking: null,
    });

    // Two passengers and a 200 fare: the old template would have printed THB 400 from
    // its own arithmetic. Nothing on this screen may state an amount the server did not.
    expect(text).not.toContain('THB 400');
    expect(text).not.toContain('THB 0');
    expect(text).toContain('PAYMENT.SUMMARY.TOTAL_PENDING');
  });

  it('restores the passenger-count row from the server counts when the store is empty', () => {
    const text = render({
      ...FARE_200,
      passengerInfo: null,
      booking: {
        bookingId: 77,
        bookingNumber: 'BK-77',
        netAmount: 400,
        adultCount: 2,
        childCount: 1,
      } as BookingState,
    });

    expect(text).toContain('PAYMENT.SUMMARY.ADULT_LABEL');
    expect(text).toContain('PAYMENT.SUMMARY.CHILD_LABEL');
  });

  it('still prefers the passenger rows while they are in the store (OBRS-1384 stays true)', () => {
    const text = render({
      ...FARE_200,
      // Three rows in the store against a server count of 1: mid-flow, after an
      // OPEN-seating "+", the store is the fresher of the two.
      passengerInfo: [
        { isAdult: true } as PassengerInfo,
        { isAdult: true } as PassengerInfo,
        { isAdult: true } as PassengerInfo,
      ],
      booking: {
        bookingId: 77,
        bookingNumber: 'BK-77',
        netAmount: 600,
        adultCount: 1,
        childCount: 0,
      } as BookingState,
    });

    expect(text).toContain('3');
    expect(text).not.toContain('PAYMENT.SUMMARY.CHILD_LABEL');
    expect(text).toContain('THB 600');
  });
});
