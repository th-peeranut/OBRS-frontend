import { BehaviorSubject } from 'rxjs';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import dayjs from 'dayjs';

import { RescheduleDialogComponent } from './reschedule-dialog.component';
import { AuthService } from '../../../../auth/auth.service';
import { MyBookingsState, initialMyBookingsState } from '../../store/my-bookings.model';
import { MyBookingDto } from '../../../../shared/interfaces/my-booking.interface';
import { RescheduleOption } from '../../../../shared/interfaces/reschedule.interface';
import {
  closeRescheduleDialog,
  confirmReschedule,
  loadRescheduleEstimate,
  loadRescheduleOptions,
  openRescheduleDialog,
  rescheduleAbandoned,
} from '../../store/my-bookings.action';

interface FakeRootState {
  myBookings: MyBookingsState;
}

/**
 * A `BehaviorSubject` standing in for the NgRx `Store`. Real selectors
 * (`selectMyBookings` et al. — used transitively by the component) run
 * against whatever state is `.next()`-ed, so this exercises the actual
 * selector wiring rather than a hand-rolled per-selector stub.
 */
class FakeStore extends BehaviorSubject<FakeRootState> {
  readonly dispatch = jasmine.createSpy('dispatch');
}

function buildState(overrides: Partial<MyBookingsState> = {}): MyBookingsState {
  return { ...initialMyBookingsState, ...overrides };
}

function buildBooking(overrides: Partial<MyBookingDto> = {}): MyBookingDto {
  return {
    id: 5,
    bookingNumber: 'B-5',
    status: 'confirmed',
    bookingType: 'one_way',
    rescheduleCount: 0,
    // OBRS-699: both picker bounds are wire-supplied now. A fixture omitting
    // them leaves the bound null (unbounded) by design, not defaulted.
    rescheduleWindowHours: 2,
    rescheduleMaxDaysAhead: 60,
    bookingSchedules: [
      {
        id: 1,
        departureDateTime: dayjs().add(10, 'day').toISOString(),
        fromStop: { code: 'a' },
        toStop: { code: 'b' },
        tickets: [{ id: 11, seatNumber: '1' }],
      },
    ],
    ...overrides,
  };
}

const sampleOption: RescheduleOption = {
  scheduleId: 999,
  departureDateTime: '2026-12-21T09:00:00',
  arrivalDateTime: '2026-12-21T11:00:00',
  pricePerSeat: '120.00',
  availableSeats: 3,
};

describe('RescheduleDialogComponent', () => {
  /**
   * OBRS-1167: `isCounterStaff` is a real `AuthService.hasAnyRole(['salesperson'])` call, so the
   * fake answers that one question and nothing else. It defaults to FALSE — a customer — because
   * that is the path every pre-existing test in this file exercises, and this card rests on that
   * path being unchanged.
   */
  function create(
    state: MyBookingsState,
    isCounterStaff = false
  ): { component: RescheduleDialogComponent; store: FakeStore } {
    const store = new FakeStore({ myBookings: state });
    const translate = { currentLang: 'th' } as unknown as TranslateService;
    const auth = { hasAnyRole: () => isCounterStaff } as unknown as AuthService;
    const component = new RescheduleDialogComponent(store as unknown as Store, translate, auth);
    component.bookingId = 5;
    return { component, store };
  }

  it('exposes the current trip (route + departure) so the traveller sees what they move from (OBRS-189)', () => {
    const { component } = create(
      buildState({ bookings: [buildBooking()], rescheduleDialogBookingId: 5 })
    );
    component.ngOnInit();

    const trip = component.originalTrip;
    expect(trip).not.toBeNull();
    expect(trip?.fromLabel).toBe('a');
    expect(trip?.toLabel).toBe('b');
    expect(trip?.departure).toBeTruthy();
  });

  it('exposes the NEW trip only once an option is picked — same stops, new departure (OBRS-189)', () => {
    const { component } = create(
      buildState({ bookings: [buildBooking()], rescheduleDialogBookingId: 5 })
    );
    component.ngOnInit();

    expect(component.newTrip).toBeNull(); // nothing selected yet

    component.selectedOption = sampleOption;
    const nt = component.newTrip;
    expect(nt).not.toBeNull();
    expect(nt?.fromLabel).toBe('a'); // route unchanged
    expect(nt?.toLabel).toBe('b');
    expect(nt?.departure).toBeTruthy();
  });

  it('opens optimistically — dispatches openRescheduleDialog synchronously on init, before any data has loaded', () => {
    const { component, store } = create(
      buildState({ bookings: [buildBooking()], rescheduleDialogBookingId: 5 })
    );

    component.ngOnInit();

    expect(store.dispatch).toHaveBeenCalledWith(openRescheduleDialog({ bookingId: 5 }));
    expect(component.step).toBe('date');
  });

  it('switches to the payment step once the store reflects a pending top-up payment (PENDING_PAYMENT handoff)', () => {
    const { component, store } = create(
      buildState({ bookings: [buildBooking()], rescheduleDialogBookingId: 5 })
    );
    component.ngOnInit();
    expect(component.step).not.toBe('payment');

    store.next({
      myBookings: buildState({
        bookings: [buildBooking()],
        rescheduleDialogBookingId: 5,
        reschedulePendingPayment: { bookingId: 5, paymentIntentId: 777 },
      }),
    });

    expect(component.step).toBe('payment');
  });

  it('confirm sends clientNetAmount exactly equal to the current (re-fetched) estimate netAmount', () => {
    const { component, store } = create(
      buildState({
        bookings: [buildBooking()],
        rescheduleDialogBookingId: 5,
        stopsLookup: { a: 10, b: 20 },
        rescheduleTickets: [{ ticketId: 11, seatNumber: '1' }],
        rescheduleEstimate: {
          oldFare: '100',
          newFare: '120',
          fareDiff: '20',
          rescheduleFee: '30',
          netAmount: '50.00',
          paymentDirection: 'TOP_UP',
        },
      })
    );
    component.ngOnInit();
    component.selectedOption = sampleOption;

    component.onConfirm();

    expect(store.dispatch).toHaveBeenCalledWith(
      confirmReschedule({
        bookingId: 5,
        newScheduleId: sampleOption.scheduleId,
        newFromStopId: 10,
        newToStopId: 20,
        seatAssignments: { 11: '1' },
        clientNetAmount: 50,
      })
    );
  });

  // ── OBRS-1167 (AC-5): the counter's cash hand-over lane ────────────────────
  //
  // The state below is the one case where it applies: a move that refunds money
  // (`netAmount` negative) on a booking the server has told us was paid in cash.

  function cashRefundState() {
    return buildState({
      bookings: [buildBooking()],
      rescheduleDialogBookingId: 5,
      stopsLookup: { a: 10, b: 20 },
      rescheduleTickets: [{ ticketId: 11, seatNumber: '1' }],
      rescheduleEstimate: {
        oldFare: '100',
        newFare: '80',
        fareDiff: '-20',
        rescheduleFee: '0',
        netAmount: '-20.00',
        paymentDirection: 'REFUND',
        cashRefundEligible: true,
      },
    });
  }

  it('AC-5: a CUSTOMER never sees the cash hand-over panel, even on a cash refund the counter could book', () => {
    const { component } = create(cashRefundState(), false);
    component.ngOnInit();

    expect(component.showCashHandover).toBeFalse();
  });

  it('AC-5: STAFF see it — but only when the server says this move actually refunds cash', () => {
    const { component } = create(cashRefundState(), true);
    component.ngOnInit();
    expect(component.showCashHandover).toBeTrue();

    // Same staff member, a candidate that charges MORE instead: the panel goes away, because
    // there is no cash to hand over and offering the control would invite a false claim.
    const { component: topUp } = create(
      buildState({
        bookings: [buildBooking()],
        rescheduleDialogBookingId: 5,
        stopsLookup: { a: 10, b: 20 },
        rescheduleTickets: [{ ticketId: 11, seatNumber: '1' }],
        rescheduleEstimate: {
          oldFare: '100',
          newFare: '120',
          fareDiff: '20',
          rescheduleFee: '0',
          netAmount: '20.00',
          paymentDirection: 'TOP_UP',
          cashRefundEligible: false,
        },
      }),
      true
    );
    topUp.ngOnInit();
    expect(topUp.showCashHandover).toBeFalse();
  });

  it('AC-5/AC-6: the confirm payload carries NO cash keys at all unless the panel was shown and ticked', () => {
    const { component, store } = create(cashRefundState(), false);
    component.ngOnInit();
    component.selectedOption = sampleOption;

    component.onConfirm();

    // Absent, not `false`. The customer's request body says nothing about a drawer, which is what
    // makes the safe outcome the server's default rather than something it has to be careful about.
    expect(store.dispatch).toHaveBeenCalledWith(
      confirmReschedule({
        bookingId: 5,
        newScheduleId: sampleOption.scheduleId,
        newFromStopId: 10,
        newToStopId: 20,
        seatAssignments: { 11: '1' },
        clientNetAmount: -20,
      })
    );
  });

  it('AC-5: a staff member who ticks the panel sends the claim AND the owner code together', () => {
    const { component, store } = create(cashRefundState(), true);
    component.ngOnInit();
    component.selectedOption = sampleOption;
    component.onCashHandoverStateChange({ cashHandedOverNow: true, approvalCode: '246813' });

    component.onConfirm();

    expect(store.dispatch).toHaveBeenCalledWith(
      confirmReschedule({
        bookingId: 5,
        newScheduleId: sampleOption.scheduleId,
        newFromStopId: 10,
        newToStopId: 20,
        seatAssignments: { 11: '1' },
        clientNetAmount: -20,
        cashHandedOverNow: true,
        approvalCode: '246813',
      })
    );
  });

  it('AC-5: a claim made and then invalidated by a new estimate does not survive to the confirm', () => {
    const store = new FakeStore({ myBookings: cashRefundState() });
    const translate = { currentLang: 'th' } as unknown as TranslateService;
    const auth = { hasAnyRole: () => true } as unknown as AuthService;
    const component = new RescheduleDialogComponent(store as unknown as Store, translate, auth);
    component.bookingId = 5;
    component.ngOnInit();
    component.selectedOption = sampleOption;
    component.onCashHandoverStateChange({ cashHandedOverNow: true, approvalCode: '246813' });

    // The operator goes back and picks a round that costs MORE. The estimate that arrives is no
    // longer cash-refunding, so the earlier claim — about a payout that no longer exists — is
    // dropped along with the code.
    store.next({
      myBookings: buildState({
        bookings: [buildBooking()],
        rescheduleDialogBookingId: 5,
        stopsLookup: { a: 10, b: 20 },
        rescheduleTickets: [{ ticketId: 11, seatNumber: '1' }],
        rescheduleEstimate: {
          oldFare: '100',
          newFare: '120',
          fareDiff: '20',
          rescheduleFee: '0',
          netAmount: '20.00',
          paymentDirection: 'TOP_UP',
          cashRefundEligible: false,
        },
      }),
    });
    store.dispatch.calls.reset();

    component.onConfirm();

    expect(store.dispatch).toHaveBeenCalledWith(
      confirmReschedule({
        bookingId: 5,
        newScheduleId: sampleOption.scheduleId,
        newFromStopId: 10,
        newToStopId: 20,
        seatAssignments: { 11: '1' },
        clientNetAmount: 20,
      })
    );
  });

  it('does not confirm when the stop ids have not resolved yet (background lookup still in flight)', () => {
    const { component, store } = create(
      buildState({
        bookings: [buildBooking()],
        rescheduleDialogBookingId: 5,
        stopsLookup: {}, // not loaded yet
        rescheduleTickets: [{ ticketId: 11, seatNumber: '1' }],
        rescheduleEstimate: {
          oldFare: '100',
          newFare: '120',
          fareDiff: '20',
          rescheduleFee: '30',
          netAmount: '50.00',
          paymentDirection: 'TOP_UP',
        },
      })
    );
    component.ngOnInit();
    component.selectedOption = sampleOption;

    component.onConfirm();

    expect(store.dispatch).not.toHaveBeenCalledWith(jasmine.objectContaining({ type: confirmReschedule.type }));
  });

  it('dispatches rescheduleAbandoned (not closeRescheduleDialog) when closed mid-payment-step', () => {
    const { component, store } = create(
      buildState({ bookings: [buildBooking()], rescheduleDialogBookingId: 5 })
    );
    component.ngOnInit();
    component.step = 'payment';

    component.close();

    expect(store.dispatch).toHaveBeenCalledWith(rescheduleAbandoned());
    expect(store.dispatch).not.toHaveBeenCalledWith(closeRescheduleDialog());
  });

  it('dispatches closeRescheduleDialog when closed outside the payment step', () => {
    const { component, store } = create(
      buildState({ bookings: [buildBooking()], rescheduleDialogBookingId: 5 })
    );
    component.ngOnInit();

    component.close();

    expect(store.dispatch).toHaveBeenCalledWith(closeRescheduleDialog());
  });

  describe('OBRS-483: OPEN-seating (null seatNumber) no longer silently no-ops', () => {
    it('does NOT dispatch loadRescheduleEstimate while tickets are still resolving in the background, even though tickets.length is 0 (loaded-vs-empty guard)', () => {
      const { component, store } = create(
        buildState({
          bookings: [buildBooking()],
          rescheduleDialogBookingId: 5,
          stopsLookup: { a: 10, b: 20 },
          rescheduleTickets: [],
          rescheduleTicketsLoading: true, // still in flight
        })
      );
      component.ngOnInit();
      store.dispatch.calls.reset();

      component.onOptionSelect(sampleOption);

      expect(store.dispatch).not.toHaveBeenCalledWith(
        jasmine.objectContaining({ type: loadRescheduleEstimate.type })
      );
    });

    it('dispatches loadRescheduleEstimate once tickets finish loading, even with a null seatNumber (OPEN seating) — mapped to an empty-string placeholder for the seats param', () => {
      const { component, store } = create(
        buildState({
          bookings: [buildBooking()],
          rescheduleDialogBookingId: 5,
          stopsLookup: { a: 10, b: 20 },
          rescheduleTickets: [],
          rescheduleTicketsLoading: true,
        })
      );
      component.ngOnInit();
      component.onOptionSelect(sampleOption);
      store.dispatch.calls.reset();

      // The background load resolves: OPEN seating, null seat, loading clears.
      store.next({
        myBookings: buildState({
          bookings: [buildBooking()],
          rescheduleDialogBookingId: 5,
          stopsLookup: { a: 10, b: 20 },
          rescheduleTickets: [{ ticketId: 11, seatNumber: null }],
          rescheduleTicketsLoading: false,
        }),
      });

      expect(store.dispatch).toHaveBeenCalledWith(
        loadRescheduleEstimate({
          bookingId: 5,
          newScheduleId: sampleOption.scheduleId,
          newFromStopId: 10,
          newToStopId: 20,
          seats: [''],
        })
      );
    });

    it('confirm sends the null seatNumber through untouched in seatAssignments (OBRS-475 made the backend accept it)', () => {
      const { component, store } = create(
        buildState({
          bookings: [buildBooking()],
          rescheduleDialogBookingId: 5,
          stopsLookup: { a: 10, b: 20 },
          rescheduleTickets: [{ ticketId: 11, seatNumber: null }],
          rescheduleTicketsLoading: false,
          rescheduleEstimate: {
            oldFare: '100',
            newFare: '120',
            fareDiff: '20',
            rescheduleFee: '30',
            netAmount: '50.00',
            paymentDirection: 'TOP_UP',
          },
        })
      );
      component.ngOnInit();
      component.selectedOption = sampleOption;

      component.onConfirm();

      expect(store.dispatch).toHaveBeenCalledWith(
        confirmReschedule({
          bookingId: 5,
          newScheduleId: sampleOption.scheduleId,
          newFromStopId: 10,
          newToStopId: 20,
          seatAssignments: { 11: null },
          clientNetAmount: 50,
        })
      );
    });
  });

  describe('NO_SEATS confirm failure (regression)', () => {
    // Locks the QA-reported bug: bouncing back to the options step must NOT
    // force a fresh loadRescheduleOptions dispatch (that reducer case wipes
    // rescheduleConfirmError and re-arms rescheduleOptionsLoading), which
    // both erased the localized message before it could render and left the
    // options spinner looking permanently stuck.
    it('returns to the options step with the error visible, the already-loaded options intact, and the spinner not stuck', () => {
      const { component, store } = create(
        buildState({
          bookings: [buildBooking()],
          rescheduleDialogBookingId: 5,
          rescheduleOptions: [sampleOption],
          rescheduleOptionsLoading: false,
        })
      );
      component.ngOnInit();
      // Go through the real date-selection path first so `selectedDateIso`
      // is set — the old buggy code only re-dispatched loadRescheduleOptions
      // when a date had been picked, so this is required for the assertion
      // below to actually exercise (and fail against) the old behavior.
      component.onDateSelected('2026-07-20');
      component.step = 'estimate';
      component.selectedOption = sampleOption;
      store.dispatch.calls.reset();

      // Simulate the reducer's confirmRescheduleFailure handling for a
      // RESCHEDULE_ERROR_NO_SEATS response.
      store.next({
        myBookings: buildState({
          bookings: [buildBooking()],
          rescheduleDialogBookingId: 5,
          rescheduleOptions: [sampleOption],
          rescheduleOptionsLoading: false,
          rescheduleConfirmError: 'MY_BOOKINGS.RESCHEDULE.ERROR.NO_SEATS',
          rescheduleConfirmErrorCode: 'RESCHEDULE_ERROR_NO_SEATS',
        }),
      });

      expect(component.step).toBe('options');
      expect(component.confirmError)
        .withContext('the localized NO_SEATS message must survive, not be wiped')
        .toBe('MY_BOOKINGS.RESCHEDULE.ERROR.NO_SEATS');
      expect(component.rescheduleOptionsLoading)
        .withContext('the spinner must resolve, never stay stuck')
        .toBeFalse();
      expect(component.rescheduleOptions).toEqual([sampleOption]);
      expect(component.selectedOption).toBeNull();
      expect(store.dispatch).not.toHaveBeenCalledWith(
        jasmine.objectContaining({ type: loadRescheduleOptions.type })
      );
    });
  });

  describe('estimate-load failure (regression — OBRS-345, residual of OBRS-186)', () => {
    // Locks the silent dead-end: on any loadRescheduleEstimateFailure the
    // component must consume selectRescheduleEstimateError so the estimate step
    // shows a message instead of an empty pane with a stuck-disabled Confirm.
    // Before OBRS-345 the component never subscribed that selector (the store
    // set rescheduleEstimateError but nothing read it), and the estimate step
    // bound [error]="confirmError" (the confirm step's error), so an estimate
    // load failure surfaced nothing — reproducing OBRS-186 from a trigger the
    // backend own-schedule filter (bd1c8533) doesn't cover.
    it('surfaces the estimate-load error at the estimate step and clears the spinner (never stuck)', () => {
      const { component, store } = create(
        buildState({
          bookings: [buildBooking()],
          rescheduleDialogBookingId: 5,
          rescheduleOptions: [sampleOption],
          rescheduleOptionsLoading: false,
        })
      );
      component.ngOnInit();
      component.step = 'estimate';
      component.selectedOption = sampleOption;

      // Mirror the reducer's loadRescheduleEstimateFailure shape: loading
      // cleared, estimate still null, a localized error message set.
      store.next({
        myBookings: buildState({
          bookings: [buildBooking()],
          rescheduleDialogBookingId: 5,
          rescheduleOptions: [sampleOption],
          rescheduleOptionsLoading: false,
          rescheduleEstimate: null,
          rescheduleEstimateLoading: false,
          rescheduleEstimateError: 'MY_BOOKINGS.RESCHEDULE.ERROR.GENERIC',
        }),
      });

      expect(component.estimateError)
        .withContext('the estimate-load error must reach the component, not be dropped')
        .toBe('MY_BOOKINGS.RESCHEDULE.ERROR.GENERIC');
      expect(component.estimateLoading)
        .withContext('the spinner must resolve on failure, never stay stuck')
        .toBeFalse();
    });
  });

  describe('OBRS-655/OBRS-699: date-picker bounds carry the reschedule window and horizon', () => {
    // `computeDateBounds` runs `now.add(booking.rescheduleWindowHours, 'hour').startOf('day')`,
    // so at most clock times 2h and 4h collapse onto the SAME calendar day and a
    // test written at an arbitrary `now` cannot tell them apart. The clock is
    // pinned to 21:00 local — the one band where the two values differ: +2h stays
    // on the pinned day, +4h rolls past midnight onto the next one.
    const pinnedNow = new Date(2026, 11, 20, 21, 0, 0);

    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate(pinnedNow);
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('minDate is the start of the day containing now + 2h (not now + 4h)', () => {
      const { component } = create(
        buildState({ bookings: [buildBooking()], rescheduleDialogBookingId: 5 })
      );
      component.ngOnInit();

      expect(component.minDate)
        .withContext('at 21:00, a 4h window would push the earliest pickable day to the 21st')
        .toEqual(dayjs(pinnedNow).add(2, 'hour').startOf('day').toDate());
    });

    it('maxDate is the end of the day 60 days after the original departure (not 30)', () => {
      // The horizon is anchored on the ORIGINAL departure, not on `now`.
      const originalDeparture = dayjs(pinnedNow).add(10, 'day').toISOString();
      const booking = buildBooking({
        bookingSchedules: [
          {
            id: 1,
            departureDateTime: originalDeparture,
            fromStop: { code: 'a' },
            toStop: { code: 'b' },
            tickets: [{ id: 11, seatNumber: '1' }],
          },
        ],
      });
      const { component } = create(
        buildState({ bookings: [booking], rescheduleDialogBookingId: 5 })
      );
      component.ngOnInit();

      expect(component.maxDate).toEqual(
        dayjs(originalDeparture).add(60, 'day').endOf('day').toDate()
      );
      expect(dayjs(component.maxDate).diff(dayjs(originalDeparture), 'day'))
        .withContext('a 30-day horizon must not satisfy this')
        .toBeGreaterThanOrEqual(60);
    });

    // OBRS-699: absent means the backend could not resolve an operator. The
    // bound stays unbounded and the server still refuses out-of-policy dates —
    // substituting 2/60 here is exactly the fallback this card removed.
    it('leaves both bounds null when the row carries no policy numbers', () => {
      const booking = buildBooking({
        rescheduleWindowHours: undefined,
        rescheduleMaxDaysAhead: undefined,
      });
      const { component } = create(
        buildState({ bookings: [booking], rescheduleDialogBookingId: 5 })
      );
      component.ngOnInit();

      expect(component.minDate)
        .withContext('an unresolvable window must not silently become 2 hours')
        .toBeNull();
      expect(component.maxDate)
        .withContext('an unresolvable horizon must not silently become 60 days')
        .toBeNull();
    });

    it('honours an operator horizon that is not the platform default', () => {
      // 90 is a value no constant in this repo ever held, so a re-introduced
      // literal cannot satisfy it.
      const originalDeparture = dayjs(pinnedNow).add(10, 'day').toISOString();
      const booking = buildBooking({
        rescheduleMaxDaysAhead: 90,
        bookingSchedules: [
          {
            id: 1,
            departureDateTime: originalDeparture,
            fromStop: { code: 'a' },
            toStop: { code: 'b' },
            tickets: [{ id: 11, seatNumber: '1' }],
          },
        ],
      });
      const { component } = create(
        buildState({ bookings: [booking], rescheduleDialogBookingId: 5 })
      );
      component.ngOnInit();

      expect(component.maxDate).toEqual(
        dayjs(originalDeparture).add(90, 'day').endOf('day').toDate()
      );
    });
  });
});
