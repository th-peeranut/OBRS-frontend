import { myBookingsReducer } from './my-bookings.reducer';
import { initialMyBookingsState } from './my-bookings.model';
import { confirmChangeStopFailure, loadChangeStopEstimate } from './my-bookings.action';

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
