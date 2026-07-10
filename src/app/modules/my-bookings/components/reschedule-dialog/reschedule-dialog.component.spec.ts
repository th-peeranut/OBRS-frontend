import { BehaviorSubject } from 'rxjs';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import dayjs from 'dayjs';

import { RescheduleDialogComponent } from './reschedule-dialog.component';
import { MyBookingsState, initialMyBookingsState } from '../../store/my-bookings.model';
import { MyBookingDto } from '../../../../shared/interfaces/my-booking.interface';
import { RescheduleOption } from '../../../../shared/interfaces/reschedule.interface';
import {
  closeRescheduleDialog,
  confirmReschedule,
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
  function create(state: MyBookingsState): { component: RescheduleDialogComponent; store: FakeStore } {
    const store = new FakeStore({ myBookings: state });
    const translate = { currentLang: 'th' } as unknown as TranslateService;
    const component = new RescheduleDialogComponent(store as unknown as Store, translate);
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
});
