import { myBookingsReducer } from './my-bookings.reducer';
import { initialMyBookingsState } from './my-bookings.model';
import {
  closeCancelRefundDestinationModal,
  confirmChangeStopFailure,
  loadChangeStopEstimate,
  requestCancelBooking,
} from './my-bookings.action';
import { MyBookingView } from '../../../shared/interfaces/my-booking.interface';

function buildBookingView(overrides: Partial<MyBookingView> = {}): MyBookingView {
  return {
    id: 5,
    bookingNumber: 'B-5',
    statusCode: 'confirmed',
    bookingType: 'one_way',
    route: 'A -> B',
    departureLabel: '21/12/2026',
    passengerCount: 1,
    totalAmount: 500,
    totalAmountLabel: '฿500.00',
    createdLabel: '01/12/2026',
    cancellable: true,
    paid: true,
    rescheduleEligible: false,
    rescheduleReasonKey: null,
    changeSeatEligible: false,
    changeSeatReasonKey: null,
    changeStopEligible: false,
    changeStopReasonKey: null,
    ...overrides,
  };
}

/**
 * Locks the OBRS-83 NO_SEATS lesson for change-stop (OBRS-110 wave 2): a
 * re-dispatched `loadChangeStopEstimate` (e.g. after the traveler picks a
 * different pickup/drop-off) must never wipe a still-relevant confirm-time
 * banner — only a fresh `confirmChangeStop` attempt does that. Mirrors
 * `ChangeSeatEffect`'s `loadChangeSeatAvailability` reducer case, NOT
 * reschedule's `loadRescheduleEstimate` case (which does reset it) — see
 * `change-stop-error.ts` and `docs/adr/0010-change-stop-dialog.md`.
 */
describe('myBookingsReducer — change-stop confirm-error persistence', () => {
  it('loadChangeStopEstimate does not clear changeStopConfirmError/changeStopConfirmErrorCode', () => {
    const stateWithConfirmError = {
      ...initialMyBookingsState,
      changeStopConfirmError: 'MY_BOOKINGS.CHANGE_STOP.ERROR.NO_SEATS',
      changeStopConfirmErrorCode: 'CHANGE_STOP_ERROR_NO_SEATS',
    };

    const next = myBookingsReducer(
      stateWithConfirmError,
      loadChangeStopEstimate({ bookingId: 5, newFromStopId: 10, newToStopId: 30, seats: ['B4'] })
    );

    expect(next.changeStopConfirmError).toBe('MY_BOOKINGS.CHANGE_STOP.ERROR.NO_SEATS');
    expect(next.changeStopConfirmErrorCode).toBe('CHANGE_STOP_ERROR_NO_SEATS');
    expect(next.changeStopEstimateLoading).toBeTrue();
  });

  it('a fresh confirmChangeStopFailure still sets a new confirm error normally', () => {
    const next = myBookingsReducer(
      initialMyBookingsState,
      confirmChangeStopFailure({ errorCode: 'CHANGE_STOP_ERROR_NO_SEATS', error: 'no seats' })
    );

    expect(next.changeStopConfirmError).toBe('no seats');
    expect(next.changeStopConfirmErrorCode).toBe('CHANGE_STOP_ERROR_NO_SEATS');
  });
});

/**
 * OBRS-942 QA regression: dismissing the cancel modal WITHOUT confirming (×,
 * backdrop, Escape, or taking the reschedule offer — all four dispatch
 * `closeCancelRefundDestinationModal`) never cleared `cancellingBookingId`,
 * because that clearing used to happen via `cancelBookingDismissed`'s reducer
 * case — an action whose sole dispatcher (the non-manual Swal "no" branch) was
 * deleted along with the second cancel screen. Every lane's dismiss now routes
 * through `closeCancelRefundDestinationModal`, which only ever cleared
 * `refundDestinationModal`. Left unfixed, `cancellingBookingId` stays set
 * forever after one dismissal, and `MyBookingsComponent`'s
 * `[disabled]="cancellingBookingId !== null"` on the overflow menu's Cancel
 * item disables Cancel for EVERY booking until a page reload — reproduced by
 * QA in a live browser. No prior spec covered dismiss-then-reopen, which is
 * why 4557 unit tests and a 154/154 gate run both stayed green through this.
 */
describe('myBookingsReducer — OBRS-942 dismiss must clear cancellingBookingId', () => {
  it('closeCancelRefundDestinationModal clears BOTH refundDestinationModal and cancellingBookingId', () => {
    const booking = buildBookingView();
    const afterRequest = myBookingsReducer(initialMyBookingsState, requestCancelBooking({ booking }));
    expect(afterRequest.cancellingBookingId).toBe(5);

    const afterDismiss = myBookingsReducer(afterRequest, closeCancelRefundDestinationModal());

    expect(afterDismiss.cancellingBookingId).toBeNull();
    expect(afterDismiss.refundDestinationModal).toBeNull();
  });

  it('the same fix covers the reschedule-offer exit — onRescheduleInsteadOfCancel dispatches this same action first', () => {
    // MyBookingsComponent.onRescheduleInsteadOfCancel dispatches
    // closeCancelRefundDestinationModal() then openRescheduleDialog() — this
    // pins that the FIRST of those two already leaves cancellingBookingId
    // clear, so the reschedule dialog never opens on top of a still-disabled
    // Cancel menu.
    const booking = buildBookingView({ id: 9 });
    const afterRequest = myBookingsReducer(initialMyBookingsState, requestCancelBooking({ booking }));

    const afterDismiss = myBookingsReducer(afterRequest, closeCancelRefundDestinationModal());

    expect(afterDismiss.cancellingBookingId).toBeNull();
  });
});
