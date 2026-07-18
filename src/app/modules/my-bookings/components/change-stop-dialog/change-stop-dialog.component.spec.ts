import { BehaviorSubject } from 'rxjs';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';

import { ChangeStopDialogComponent } from './change-stop-dialog.component';
import { MyBookingsState, initialMyBookingsState } from '../../store/my-bookings.model';
import { MyBookingDto } from '../../../../shared/interfaces/my-booking.interface';
import { RouteStop } from '../../../../shared/interfaces/route-map.interface';
import {
  changeStopAbandoned,
  closeChangeStopDialog,
  confirmChangeStop,
  loadChangeStopEstimate,
  openChangeStopDialog,
} from '../../store/my-bookings.action';

interface FakeRootState {
  myBookings: MyBookingsState;
}

/**
 * A `BehaviorSubject` standing in for the NgRx `Store`. Real selectors
 * (`selectMyBookings` et al. — used transitively by the component) run
 * against whatever state is `.next()`-ed, mirroring
 * `reschedule-dialog.component.spec.ts`'s FakeStore.
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
    stopChangeCount: 0,
    bookingSchedules: [
      {
        id: 1,
        departureDateTime: '2026-12-21T09:00:00',
        fromStop: { code: 'a' },
        toStop: { code: 'c' },
        tickets: [{ id: 11, seatNumber: 'B4' }],
        routeSlug: 'bkk-cnx',
      },
    ],
    ...overrides,
  };
}

function buildStop(overrides: Partial<RouteStop>): RouteStop {
  return {
    order: 0,
    slug: 'x',
    name: 'X',
    address: '',
    approxTime: '',
    latitude: null,
    longitude: null,
    primaryPhotoUrl: null,
    googleMapsUrl: null,
    ...overrides,
  };
}

const PICKUP_STOPS: RouteStop[] = [
  buildStop({ order: 1, slug: 'a' }),
  buildStop({ order: 2, slug: 'b' }),
];
const DROPOFF_STOPS: RouteStop[] = [
  buildStop({ order: 2, slug: 'b' }),
  buildStop({ order: 3, slug: 'c' }),
];

describe('ChangeStopDialogComponent', () => {
  function create(state: MyBookingsState): { component: ChangeStopDialogComponent; store: FakeStore } {
    // changeStopDialogBookingId is forced to 5 (matching component.bookingId
    // below) so selectChangeStopBooking actually resolves the booking row —
    // real NgRx dispatch (which sets this via the reducer) is a no-op here
    // since `store.dispatch` is a bare spy, not wired to a reducer.
    const store = new FakeStore({ myBookings: { ...state, changeStopDialogBookingId: 5 } });
    const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
    (translate.instant as jasmine.Spy).and.callFake((key: string) => key);
    const component = new ChangeStopDialogComponent(store as unknown as Store, translate);
    component.bookingId = 5;
    return { component, store };
  }

  it('opens optimistically — dispatches openChangeStopDialog synchronously on init, before any data has loaded', () => {
    const { component, store } = create(buildState({ bookings: [buildBooking()] }));

    component.ngOnInit();

    expect(store.dispatch).toHaveBeenCalledWith(openChangeStopDialog({ bookingId: 5 }));
    expect(component.step).toBe('pickup');
  });

  it('preselects the current pickup stop from the booking row', () => {
    const { component } = create(buildState({ bookings: [buildBooking()] }));

    component.ngOnInit();

    expect(component.selectedPickupSlug).toBe('a');
  });

  describe('client-side segment guard (before any network call)', () => {
    function createOnDropoffStep(): { component: ChangeStopDialogComponent; store: FakeStore } {
      const { component, store } = create(
        buildState({
          bookings: [buildBooking()],
          changeStopPickupStops: PICKUP_STOPS,
          changeStopDropoffStops: DROPOFF_STOPS,
        })
      );
      component.ngOnInit();
      component.selectedPickupSlug = 'b'; // order 2
      component.step = 'dropoff';
      return { component, store };
    }

    it('INVALID_SEGMENT when the chosen drop-off is not after the pickup (dropoff.order <= pickup.order)', () => {
      const { component, store } = createOnDropoffStep();
      store.dispatch.calls.reset();

      // 'b' (order 2) is in both PICKUP_STOPS and DROPOFF_STOPS — picking it
      // as both pickup and drop-off gives dropoff.order (2) <= pickup.order (2).
      component.selectedDropoffSlug = 'b';
      component.onDropoffConfirmed();

      expect(component.segmentError).toBe('MY_BOOKINGS.CHANGE_STOP.ERROR.INVALID_SEGMENT');
      expect(component.step).toBe('dropoff');
      expect(store.dispatch).not.toHaveBeenCalledWith(jasmine.objectContaining({ type: loadChangeStopEstimate.type }));
    });

    it('SAME_SEGMENT when the chosen pickup/drop-off match the current booking segment', () => {
      const { component, store } = create(
        buildState({
          bookings: [buildBooking()],
          changeStopPickupStops: PICKUP_STOPS,
          changeStopDropoffStops: DROPOFF_STOPS,
        })
      );
      component.ngOnInit();
      component.step = 'dropoff';
      component.selectedPickupSlug = 'a'; // matches current fromStop
      component.selectedDropoffSlug = 'c'; // matches current toStop
      store.dispatch.calls.reset();

      component.onDropoffConfirmed();

      expect(component.segmentError).toBe('MY_BOOKINGS.CHANGE_STOP.ERROR.SAME_SEGMENT');
      expect(component.step).toBe('dropoff');
      expect(store.dispatch).not.toHaveBeenCalledWith(jasmine.objectContaining({ type: loadChangeStopEstimate.type }));
    });

    it('a valid, different segment dispatches loadChangeStopEstimate and advances to the estimate step', () => {
      const { component, store } = create(
        buildState({
          bookings: [buildBooking()],
          changeStopPickupStops: PICKUP_STOPS,
          changeStopDropoffStops: DROPOFF_STOPS,
          stopsLookup: { a: 10, b: 20, c: 30 },
          changeStopTickets: [{ ticketId: 11, seatNumber: 'B4' }],
        })
      );
      component.ngOnInit();
      component.step = 'dropoff';
      component.selectedPickupSlug = 'a';
      component.selectedDropoffSlug = 'b';

      component.onDropoffConfirmed();

      expect(component.segmentError).toBeNull();
      expect(component.step).toBe('estimate');
      expect(store.dispatch).toHaveBeenCalledWith(
        loadChangeStopEstimate({ bookingId: 5, newFromStopId: 10, newToStopId: 20, seats: ['B4'] })
      );
    });
  });

  it('does not dispatch the estimate load when stop ids have not resolved yet (background lookup still in flight)', () => {
    const { component, store } = create(
      buildState({
        bookings: [buildBooking()],
        changeStopPickupStops: PICKUP_STOPS,
        changeStopDropoffStops: DROPOFF_STOPS,
        stopsLookup: {}, // not loaded yet
        changeStopTickets: [{ ticketId: 11, seatNumber: 'B4' }],
      })
    );
    component.ngOnInit();
    component.step = 'dropoff';
    component.selectedPickupSlug = 'a';
    component.selectedDropoffSlug = 'b';

    component.onDropoffConfirmed();

    expect(component.step).toBe('estimate');
    expect(store.dispatch).not.toHaveBeenCalledWith(jasmine.objectContaining({ type: loadChangeStopEstimate.type }));
  });

  describe('OBRS-483: OPEN-seating (null seatNumber) no longer silently no-ops', () => {
    it('does NOT dispatch loadChangeStopEstimate while tickets are still resolving in the background, even though tickets.length is 0 (loaded-vs-empty guard)', () => {
      const { component, store } = create(
        buildState({
          bookings: [buildBooking()],
          changeStopPickupStops: PICKUP_STOPS,
          changeStopDropoffStops: DROPOFF_STOPS,
          stopsLookup: { a: 10, b: 20, c: 30 },
          changeStopTickets: [],
          changeStopTicketsLoading: true,
        })
      );
      component.ngOnInit();
      component.step = 'dropoff';
      component.selectedPickupSlug = 'a';
      component.selectedDropoffSlug = 'b';
      store.dispatch.calls.reset();

      component.onDropoffConfirmed();

      expect(store.dispatch).not.toHaveBeenCalledWith(
        jasmine.objectContaining({ type: loadChangeStopEstimate.type })
      );
    });

    it('dispatches loadChangeStopEstimate once tickets finish loading, even with a null seatNumber (OPEN seating) — mapped to an empty-string placeholder for the seats param', () => {
      const { component, store } = create(
        buildState({
          bookings: [buildBooking()],
          changeStopPickupStops: PICKUP_STOPS,
          changeStopDropoffStops: DROPOFF_STOPS,
          stopsLookup: { a: 10, b: 20, c: 30 },
          changeStopTickets: [],
          changeStopTicketsLoading: true,
        })
      );
      component.ngOnInit();
      component.step = 'dropoff';
      component.selectedPickupSlug = 'a';
      component.selectedDropoffSlug = 'b';
      component.onDropoffConfirmed(); // arms pendingEstimateDispatch; no-ops while tickets are loading
      store.dispatch.calls.reset();

      store.next({
        myBookings: buildState({
          bookings: [buildBooking()],
          changeStopDialogBookingId: 5,
          changeStopPickupStops: PICKUP_STOPS,
          changeStopDropoffStops: DROPOFF_STOPS,
          stopsLookup: { a: 10, b: 20, c: 30 },
          changeStopTickets: [{ ticketId: 11, seatNumber: null }],
          changeStopTicketsLoading: false,
        }),
      });

      expect(store.dispatch).toHaveBeenCalledWith(
        loadChangeStopEstimate({ bookingId: 5, newFromStopId: 10, newToStopId: 20, seats: [''] })
      );
    });

    it('confirm sends the null seatNumber through untouched (OBRS-475-equivalent contract, defense-in-depth)', () => {
      const { component, store } = create(
        buildState({
          bookings: [buildBooking()],
          stopsLookup: { a: 10, b: 20 },
          changeStopTickets: [{ ticketId: 11, seatNumber: null }],
          changeStopTicketsLoading: false,
          changeStopEstimate: {
            oldFare: '100',
            newFare: '120',
            fareDiff: '20',
            netAmount: '20.00',
            paymentDirection: 'TOP_UP',
          },
        })
      );
      component.ngOnInit();
      component.selectedPickupSlug = 'a';
      component.selectedDropoffSlug = 'b';

      component.onEstimateConfirm();

      expect(store.dispatch).toHaveBeenCalledWith(
        confirmChangeStop({
          bookingId: 5,
          newFromStopId: 10,
          newToStopId: 20,
          seatAssignments: { 11: null },
          clientNetAmount: 20,
        })
      );
    });
  });

  it('confirm sends clientNetAmount exactly equal to the current estimate netAmount', () => {
    const { component, store } = create(
      buildState({
        bookings: [buildBooking()],
        stopsLookup: { a: 10, b: 20 },
        changeStopTickets: [{ ticketId: 11, seatNumber: 'B4' }],
        changeStopEstimate: {
          oldFare: '100',
          newFare: '120',
          fareDiff: '20',
          netAmount: '20.00',
          paymentDirection: 'TOP_UP',
        },
      })
    );
    component.ngOnInit();
    component.selectedPickupSlug = 'a';
    component.selectedDropoffSlug = 'b';

    component.onEstimateConfirm();

    expect(store.dispatch).toHaveBeenCalledWith(
      confirmChangeStop({
        bookingId: 5,
        newFromStopId: 10,
        newToStopId: 20,
        seatAssignments: { 11: 'B4' },
        clientNetAmount: 20,
      })
    );
  });

  it('switches to the payment step once the store reflects a pending top-up payment (PENDING_PAYMENT handoff)', () => {
    const { component, store } = create(buildState({ bookings: [buildBooking()] }));
    component.ngOnInit();
    expect(component.step).not.toBe('payment');

    store.next({
      myBookings: buildState({
        bookings: [buildBooking()],
        changeStopPendingPayment: { bookingId: 5, paymentIntentId: 777 },
      }),
    });

    expect(component.step).toBe('payment');
  });

  it('dispatches changeStopAbandoned (not closeChangeStopDialog) when closed mid-payment-step', () => {
    const { component, store } = create(buildState({ bookings: [buildBooking()] }));
    component.ngOnInit();
    component.step = 'payment';

    component.close();

    expect(store.dispatch).toHaveBeenCalledWith(changeStopAbandoned());
    expect(store.dispatch).not.toHaveBeenCalledWith(closeChangeStopDialog());
  });

  it('dispatches closeChangeStopDialog when closed outside the payment step', () => {
    const { component, store } = create(buildState({ bookings: [buildBooking()] }));
    component.ngOnInit();

    component.close();

    expect(store.dispatch).toHaveBeenCalledWith(closeChangeStopDialog());
  });

  it('shows the full-step error card when the route stops fail to load (incl. a missing routeSlug)', () => {
    const { component } = create(
      buildState({
        bookings: [buildBooking()],
        changeStopRouteStopsError: 'MY_BOOKINGS.CHANGE_STOP.STOPS_LOAD_ERROR',
      })
    );

    component.ngOnInit();

    expect(component.step).toBe('error');
  });

  it('confirm-time error is NOT wiped by a re-dispatched estimate load (component reflects the store as-is)', () => {
    const { component } = create(
      buildState({
        bookings: [buildBooking()],
        changeStopConfirmError: 'MY_BOOKINGS.CHANGE_STOP.ERROR.NO_SEATS',
      })
    );

    component.ngOnInit();

    expect(component.confirmError).toBe('MY_BOOKINGS.CHANGE_STOP.ERROR.NO_SEATS');
  });

  // OBRS-351 (sibling of OBRS-345): on any loadChangeStopEstimateFailure the
  // component must consume selectChangeStopEstimateError so the estimate step
  // shows a message instead of a blank pane with a stuck-disabled Confirm.
  // Before OBRS-351 the component never subscribed that selector (the store set
  // changeStopEstimateError but nothing read it) and the estimate step bound
  // [error]="confirmError" (the confirm step's error), so a change-stop
  // estimate-load failure surfaced nothing — the same silent dead-end OBRS-345
  // fixed for reschedule, one dialog over.
  it('surfaces the estimate-load error at the estimate step and clears the spinner (never stuck) — OBRS-351', () => {
    const { component, store } = create(buildState({ bookings: [buildBooking()] }));
    component.ngOnInit();
    component.step = 'estimate';

    // Mirror the reducer's loadChangeStopEstimateFailure shape: loading cleared,
    // estimate still null, a localized error message set.
    store.next({
      myBookings: buildState({
        bookings: [buildBooking()],
        changeStopDialogBookingId: 5,
        changeStopEstimate: null,
        changeStopEstimateLoading: false,
        changeStopEstimateError: 'MY_BOOKINGS.CHANGE_STOP.ERROR.GENERIC',
      }),
    });

    expect(component.estimateError)
      .withContext('the estimate-load error must reach the component, not be dropped')
      .toBe('MY_BOOKINGS.CHANGE_STOP.ERROR.GENERIC');
    expect(component.estimateLoading)
      .withContext('the spinner must resolve on failure, never stay stuck')
      .toBeFalse();
  });
});
