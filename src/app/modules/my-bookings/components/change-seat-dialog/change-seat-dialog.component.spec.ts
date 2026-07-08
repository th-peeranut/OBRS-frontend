import { BehaviorSubject } from 'rxjs';
import { Store } from '@ngrx/store';

import { ChangeSeatDialogComponent } from './change-seat-dialog.component';
import { MyBookingsState, initialMyBookingsState } from '../../store/my-bookings.model';
import { ChangeSeatAvailability } from '../../../../shared/interfaces/change-seat.interface';
import {
  closeChangeSeatDialog,
  confirmChangeSeat,
  loadChangeSeatAvailability,
  openChangeSeatDialog,
} from '../../store/my-bookings.action';

interface FakeRootState {
  myBookings: MyBookingsState;
}

/** A `BehaviorSubject` standing in for the NgRx `Store` — mirrors
 * `reschedule-dialog.component.spec.ts`'s `FakeStore` so the real selectors
 * run against whatever state is `.next()`-ed. */
class FakeStore extends BehaviorSubject<FakeRootState> {
  readonly dispatch = jasmine.createSpy('dispatch');
}

function buildState(overrides: Partial<MyBookingsState> = {}): MyBookingsState {
  return { ...initialMyBookingsState, ...overrides };
}

const sampleAvailability: ChangeSeatAvailability = {
  scheduleId: 999,
  vehicleType: 'bus',
  fromStopId: 10,
  toStopId: 20,
  seats: [{ seatNumber: 'B1' }, { seatNumber: 'B2' }, { seatNumber: 'B3' }],
  occupiedSeatNumbers: ['B2'],
  currentSeatNumbers: ['B1'],
};

describe('ChangeSeatDialogComponent', () => {
  function create(state: MyBookingsState): { component: ChangeSeatDialogComponent; store: FakeStore } {
    const store = new FakeStore({ myBookings: state });
    const component = new ChangeSeatDialogComponent(store as unknown as Store);
    component.bookingId = 5;
    return { component, store };
  }

  it('opens optimistically — dispatches openChangeSeatDialog synchronously on init, before any data has loaded', () => {
    const { component, store } = create(buildState({ changeSeatDialogBookingId: 5 }));

    component.ngOnInit();

    expect(store.dispatch).toHaveBeenCalledWith(openChangeSeatDialog({ bookingId: 5 }));
    expect(component.step).toBe('loading');
  });

  it('moves to the map step once availability and tickets have both loaded, seeding seatAssignments from the current tickets', () => {
    const { component, store } = create(buildState({ changeSeatDialogBookingId: 5 }));
    component.ngOnInit();

    store.next({
      myBookings: buildState({
        changeSeatDialogBookingId: 5,
        changeSeatAvailability: sampleAvailability,
        changeSeatAvailabilityLoading: false,
        changeSeatTickets: [{ ticketId: 11, seatNumber: 'B1' }],
        changeSeatTicketsLoading: false,
      }),
    });

    expect(component.step).toBe('map');
    expect(component.seatAssignments).toEqual({ 11: 'B1' });
    expect(component.activePickedSeat).toBe('B1');
  });

  it('goes to the error step on a total availability-load failure', () => {
    const { component, store } = create(buildState({ changeSeatDialogBookingId: 5 }));
    component.ngOnInit();

    store.next({
      myBookings: buildState({
        changeSeatDialogBookingId: 5,
        changeSeatAvailabilityLoading: false,
        changeSeatAvailabilityError: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.GENERIC',
      }),
    });

    expect(component.step).toBe('error');
    expect(component.availabilityError).toBe('MY_BOOKINGS.CHANGE_SEAT.ERROR.GENERIC');
  });

  it('onRetry re-dispatches loadChangeSeatAvailability', () => {
    const { component, store } = create(buildState({ changeSeatDialogBookingId: 5 }));
    component.ngOnInit();
    store.dispatch.calls.reset();

    component.onRetry();

    expect(store.dispatch).toHaveBeenCalledWith(loadChangeSeatAvailability({ bookingId: 5 }));
  });

  it('onSeatPicked reassigns the ACTIVE ticket only, leaving other tickets untouched', () => {
    const { component, store } = create(
      buildState({
        changeSeatDialogBookingId: 5,
        changeSeatAvailability: sampleAvailability,
        changeSeatTickets: [
          { ticketId: 11, seatNumber: 'B1' },
          { ticketId: 12, seatNumber: 'B3' },
        ],
      })
    );
    component.ngOnInit();
    component.activeTicketIndex = 0;

    component.onSeatPicked('B4');

    expect(component.seatAssignments).toEqual({ 11: 'B4', 12: 'B3' });
  });

  it('activeTakenSeats unions occupiedSeatNumbers with every OTHER ticket\'s draft pick, excluding the active ticket', () => {
    const { component } = create(
      buildState({
        changeSeatDialogBookingId: 5,
        changeSeatAvailability: sampleAvailability,
        changeSeatTickets: [
          { ticketId: 11, seatNumber: 'B1' },
          { ticketId: 12, seatNumber: 'B3' },
        ],
      })
    );
    component.ngOnInit();
    component.activeTicketIndex = 0;

    expect(component.activeTakenSeats.sort()).toEqual(['B2', 'B3']);
  });

  it('does not mutate availability.occupiedSeatNumbers when computing activeTakenSeats', () => {
    const { component } = create(
      buildState({
        changeSeatDialogBookingId: 5,
        changeSeatAvailability: sampleAvailability,
        changeSeatTickets: [{ ticketId: 11, seatNumber: 'B1' }],
      })
    );
    component.ngOnInit();

    const before = [...sampleAvailability.occupiedSeatNumbers];
    void component.activeTakenSeats;

    expect(sampleAvailability.occupiedSeatNumbers).toEqual(before);
  });

  it('confirm sends the full seatAssignments map, including unchanged tickets', () => {
    const { component, store } = create(
      buildState({
        changeSeatDialogBookingId: 5,
        changeSeatAvailability: sampleAvailability,
        changeSeatTickets: [
          { ticketId: 11, seatNumber: 'B1' },
          { ticketId: 12, seatNumber: 'B3' },
        ],
      })
    );
    component.ngOnInit();
    component.activeTicketIndex = 0;
    component.onSeatPicked('B4');

    component.onConfirm();

    expect(store.dispatch).toHaveBeenCalledWith(
      confirmChangeSeat({ bookingId: 5, seatAssignments: { 11: 'B4', 12: 'B3' } })
    );
  });

  it('does not confirm before availability has loaded', () => {
    const { component, store } = create(buildState({ changeSeatDialogBookingId: 5 }));
    component.ngOnInit();
    store.dispatch.calls.reset();

    component.onConfirm();

    expect(store.dispatch).not.toHaveBeenCalledWith(
      jasmine.objectContaining({ type: confirmChangeSeat.type })
    );
  });

  it('dispatches closeChangeSeatDialog and emits closed on close()', () => {
    const { component, store } = create(buildState({ changeSeatDialogBookingId: 5 }));
    component.ngOnInit();
    const closedSpy = jasmine.createSpy('closed');
    component.closed.subscribe(closedSpy);

    component.close();

    expect(store.dispatch).toHaveBeenCalledWith(closeChangeSeatDialog());
    expect(closedSpy).toHaveBeenCalled();
  });

  describe('non-terminal confirm failure (NO_SEATS-style regression, mirrors OBRS-83)', () => {
    // Locks the same class of bug the reschedule dialog regression-tests:
    // a background availability re-fetch triggered after a non-terminal
    // confirm failure (SEAT_UNAVAILABLE/NO_SEATS/etc.) must never bounce the
    // dialog back to the 'loading' step, and must never silently drop the
    // confirm-error banner.
    it('stays on the map step, with the banner visible, while availability silently refreshes in the background', () => {
      const { component, store } = create(buildState({ changeSeatDialogBookingId: 5 }));
      component.ngOnInit();

      // First arrival: map is ready.
      store.next({
        myBookings: buildState({
          changeSeatDialogBookingId: 5,
          changeSeatAvailability: sampleAvailability,
          changeSeatAvailabilityLoading: false,
          changeSeatTickets: [{ ticketId: 11, seatNumber: 'B1' }],
          changeSeatTicketsLoading: false,
        }),
      });
      expect(component.step).toBe('map');

      // Simulate confirmChangeSeatFailure(SEAT_UNAVAILABLE) → the reducer's
      // loadChangeSeatAvailability case re-arms availabilityLoading while
      // ChangeSeatEffect.confirmChangeSeatReturnToMap$ re-fetches, and sets
      // the confirm error banner via a separate channel.
      store.next({
        myBookings: buildState({
          changeSeatDialogBookingId: 5,
          changeSeatAvailability: sampleAvailability,
          changeSeatAvailabilityLoading: true,
          changeSeatTickets: [{ ticketId: 11, seatNumber: 'B1' }],
          changeSeatTicketsLoading: false,
          changeSeatConfirmError: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.SEAT_UNAVAILABLE',
          changeSeatConfirmErrorCode: 'CHANGE_SEAT_ERROR_SEAT_UNAVAILABLE',
        }),
      });

      expect(component.step)
        .withContext('must not bounce back to the full loading step')
        .toBe('map');
      expect(component.confirmError)
        .withContext('the localized SEAT_UNAVAILABLE message must survive')
        .toBe('MY_BOOKINGS.CHANGE_SEAT.ERROR.SEAT_UNAVAILABLE');
    });
  });
});
