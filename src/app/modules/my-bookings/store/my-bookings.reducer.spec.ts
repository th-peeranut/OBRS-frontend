import { myBookingsReducer } from './my-bookings.reducer';
import { initialMyBookingsState, MY_BOOKINGS_PAGE_SIZE } from './my-bookings.model';
import {
  closeCancelRefundDestinationModal,
  confirmChangeStopFailure,
  invokeLoadMoreMyBookingsApi,
  invokeLoadMoreMyBookingsApiFailure,
  invokeLoadMoreMyBookingsApiSuccess,
  invokeLoadMyBookingsApi,
  invokeLoadMyBookingsApiSuccess,
  loadChangeStopEstimate,
  requestCancelBooking,
} from './my-bookings.action';
import { MyBookingDto, MyBookingView } from '../../../shared/interfaces/my-booking.interface';

function buildBookingDto(id: number): MyBookingDto {
  return {
    id,
    bookingNumber: `B-${id}`,
    totalAmount: '100.00',
    status: 'confirmed',
    bookingType: 'one_way',
  };
}

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

/**
 * OBRS-577 AC2/AC6 — incremental "Load more". Locks Decision A's
 * `pagesLoaded` bookkeeping (derived from row count, not assumed-1, so a
 * `preserveWindow` refetch that returns several pages in one response
 * doesn't reset how many pages Load more thinks are already on screen) and
 * the append-never-replace contract for the row-101+ scenario itself.
 */
describe('myBookingsReducer — OBRS-577 incremental load more', () => {
  it('invokeLoadMyBookingsApiSuccess sets totalElements/totalPages and derives pagesLoaded from the row count', () => {
    const bookings = Array.from({ length: MY_BOOKINGS_PAGE_SIZE }, (_, i) => buildBookingDto(i + 1));

    const next = myBookingsReducer(
      initialMyBookingsState,
      invokeLoadMyBookingsApiSuccess({ bookings, totalElements: 137, totalPages: 7 })
    );

    expect(next.bookings.length).toBe(MY_BOOKINGS_PAGE_SIZE);
    expect(next.totalElements).toBe(137);
    expect(next.totalPages).toBe(7);
    expect(next.pagesLoaded).toBe(1);
  });

  it('a preserveWindow refetch (5 pages in one response) sets pagesLoaded to 5, not 1', () => {
    const bookings = Array.from(
      { length: MY_BOOKINGS_PAGE_SIZE * 5 },
      (_, i) => buildBookingDto(i + 1)
    );

    const next = myBookingsReducer(
      initialMyBookingsState,
      invokeLoadMyBookingsApiSuccess({ bookings, totalElements: 137, totalPages: 7 })
    );

    expect(next.pagesLoaded).toBe(5);
  });

  it('invokeLoadMoreMyBookingsApi sets loadingMore without touching the existing list', () => {
    const seeded = {
      ...initialMyBookingsState,
      bookings: [buildBookingDto(1)],
      totalElements: 137,
      totalPages: 7,
      pagesLoaded: 1,
    };

    const next = myBookingsReducer(seeded, invokeLoadMoreMyBookingsApi());

    expect(next.loadingMore).toBeTrue();
    expect(next.bookings.length).toBe(1);
  });

  it('invokeLoadMoreMyBookingsApiSuccess APPENDS (never replaces) and increments pagesLoaded by exactly 1 — this is what makes row 101+ reachable', () => {
    // Seed as if 5 pages (100 rows) were already loaded, mirroring a
    // traveler who has clicked "Load more" 4 times already.
    const first100 = Array.from({ length: 100 }, (_, i) => buildBookingDto(i + 1));
    const seeded = {
      ...initialMyBookingsState,
      bookings: first100,
      totalElements: 137,
      totalPages: 7,
      pagesLoaded: 5,
      loadingMore: true,
    };
    const page6 = Array.from({ length: MY_BOOKINGS_PAGE_SIZE }, (_, i) => buildBookingDto(101 + i));

    const next = myBookingsReducer(
      seeded,
      invokeLoadMoreMyBookingsApiSuccess({ bookings: page6, totalElements: 137, totalPages: 7 })
    );

    expect(next.bookings.length).toBe(120);
    // Row 101 (0-indexed 100) is now reachable — the whole point of AC6.
    expect(next.bookings[100].id).toBe(101);
    expect(next.pagesLoaded).toBe(6);
    expect(next.loadingMore).toBeFalse();
  });

  it('invokeLoadMoreMyBookingsApiFailure clears loadingMore but leaves the list/error untouched (toast-only, per spec)', () => {
    const seeded = {
      ...initialMyBookingsState,
      bookings: [buildBookingDto(1)],
      loadingMore: true,
      error: null,
    };

    const next = myBookingsReducer(seeded, invokeLoadMoreMyBookingsApiFailure({ error: 'network error' }));

    expect(next.loadingMore).toBeFalse();
    expect(next.bookings.length).toBe(1);
    expect(next.error).toBeNull();
  });

  /**
   * Scrutinize round 1 (AC3 persistent violation): a status-filter switch /
   * Retry dispatches `invokeLoadMyBookingsApi` (preserveWindow falsy — a
   * genuine page-1 reset) while a `Load more` may still be in flight from
   * the PREVIOUS filter. Without this reset, the new filter's list renders
   * with the Load-more button stuck disabled ("Loading…") because
   * `loadingMore` survives the full reload untouched, and a stale
   * `pagesLoaded`/`totalPages` (from the old filter) can let a click during
   * the transition compute a wrong page number against the new filter's
   * totals.
   */
  it('a NON-preserveWindow reload (status switch / Retry / initial load) resets loadingMore AND zeroes pagesLoaded/totalPages — a genuine page-1 reset', () => {
    const staleFromPreviousFilter = {
      ...initialMyBookingsState,
      bookings: [buildBookingDto(1)],
      loadingMore: true,
      pagesLoaded: 3,
      totalPages: 7,
      totalElements: 137,
    };

    const next = myBookingsReducer(
      staleFromPreviousFilter,
      invokeLoadMyBookingsApi({ status: 'confirmed' })
    );

    expect(next.loadingMore).toBeFalse();
    expect(next.pagesLoaded).toBe(0);
    expect(next.totalPages).toBe(0);
  });

  /**
   * Scrutinize round 2 (regression in round 1's fix): round 1 zeroed
   * `pagesLoaded`/`totalPages` UNCONDITIONALLY, including on `preserveWindow:
   * true` — the exact flag all 6 mutation-reload sites pass. Because NgRx
   * runs the reducer before effects observe the SAME action,
   * `loadMyBookings$`'s `withLatestFrom(select(selectMyBookings))` reads the
   * value THIS case just wrote, not the value before it — so zeroing here
   * made the effect's `size = Math.max(20, pagesLoaded * 20)` always compute
   * `20`, collapsing a 5-page (100-row) list to 20 rows on every cancel/
   * reschedule/change-seat/change-stop. `pagesLoaded`/`totalPages` must
   * SURVIVE a `preserveWindow: true` dispatch untouched — only `loadingMore`
   * resets (a superseding full load always supersedes an in-flight Load
   * more, preserve or not; the effect-side half of that is
   * `loadMoreMyBookings$`'s `takeUntil`).
   */
  it('a preserveWindow:true reload (a mutation-reload site) resets loadingMore but PRESERVES pagesLoaded/totalPages — the effect reads these for the SAME action', () => {
    const fivePagesLoaded = {
      ...initialMyBookingsState,
      bookings: Array.from({ length: 100 }, (_, i) => buildBookingDto(i + 1)),
      loadingMore: false,
      pagesLoaded: 5,
      totalPages: 7,
      totalElements: 137,
    };

    const next = myBookingsReducer(
      fivePagesLoaded,
      invokeLoadMyBookingsApi({ status: 'confirmed', preserveWindow: true })
    );

    expect(next.loadingMore).toBeFalse();
    expect(next.pagesLoaded).toBe(5);
    expect(next.totalPages).toBe(7);
  });
});
