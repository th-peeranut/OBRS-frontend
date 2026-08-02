import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Actions } from '@ngrx/effects';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { Action } from '@ngrx/store';

import { MyBookingsEffect } from './my-bookings.effect';
import { BookingService } from '../../../services/booking/booking.service';
import { AlertService } from '../../../shared/services/alert.service';
import { MyBookingView } from '../../../shared/interfaces/my-booking.interface';
import {
  cancelBookingFailure,
  cancelBookingSuccess,
  confirmCancelWithDestination,
  invokeLoadMoreMyBookingsApi,
  invokeLoadMoreMyBookingsApiFailure,
  invokeLoadMoreMyBookingsApiSuccess,
  invokeLoadMyBookingsApi,
  invokeLoadMyBookingsApiSuccess,
  openCancelRefundDestinationModal,
  refundDestinationInvalid,
  requestCancelBooking,
} from './my-bookings.action';
import { initialMyBookingsState, MY_BOOKINGS_PAGE_SIZE } from './my-bookings.model';
import { selectMyBookings } from './my-bookings.selector';
import { errorCodeFromMessageKey } from '../../../shared/lib/api-error-code';

// OBRS-839: mock the WIRE form the backend actually sends, derived from the
// messageKey exactly as `DomainException.getErrorCode()` derives it. These
// mocks previously carried the dotted messageKey — the same wrong shape the
// effect compared against — so the suite agreed with the code and both
// disagreed with the server, and the destination-error branch never once ran
// against a real response.
const DESTINATION_INVALID_CODE = errorCodeFromMessageKey('cancel.error.refund-destination-invalid');
const DESTINATION_REQUIRED_CODE = errorCodeFromMessageKey('cancel.error.refund-destination-required');
const WINDOW_CLOSED_CODE = errorCodeFromMessageKey('cancel.error.window-closed');

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

describe('MyBookingsEffect (OBRS-286)', () => {
  let actionsSubject: Subject<Action>;
  let effect: MyBookingsEffect;
  let bookingService: jasmine.SpyObj<BookingService>;
  let alertService: jasmine.SpyObj<AlertService>;
  let store: MockStore;

  beforeEach(async () => {
    actionsSubject = new Subject<Action>();
    bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getMyBookings',
      'getCancellationPolicy',
      'cancelBooking',
    ]);
    alertService = jasmine.createSpyObj<AlertService>('AlertService', ['success', 'error', 'confirm']);
    alertService.success.and.resolveTo(undefined as any);

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        MyBookingsEffect,
        provideMockStore({ initialState: { myBookings: initialMyBookingsState } }),
        { provide: Actions, useValue: new Actions(actionsSubject) },
        { provide: BookingService, useValue: bookingService },
        { provide: AlertService, useValue: alertService },
      ],
    }).compileComponents();

    effect = TestBed.inject(MyBookingsEffect);
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectMyBookings, initialMyBookingsState);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  describe('requestCancel$', () => {
    it('dispatches openCancelRefundDestinationModal instead of the Swal confirm when the policy resolves to manual', () => {
      const booking = buildBookingView();
      bookingService.getCancellationPolicy.and.returnValue(
        of({
          code: 200,
          message: 'ok',
          data: {
            originalAmount: 500,
            refundAmount: 400,
            penaltyAmount: 100,
            refundRatePercent: '80%',
            refundMethod: 'MANUAL_REFUND_REQUIRED',
            policyWindow: '24h',
          },
        })
      );

      const emitted: Action[] = [];
      effect.requestCancel$.subscribe((a) => emitted.push(a));

      actionsSubject.next(requestCancelBooking({ booking }));

      expect(emitted).toEqual([
        openCancelRefundDestinationModal({
          booking,
          policy: {
            originalAmount: 500,
            refundAmount: 400,
            penaltyAmount: 100,
            refundRatePercent: '80%',
            refundMethod: 'MANUAL_REFUND_REQUIRED',
            policyWindow: '24h',
          },
        }),
      ]);
      expect(alertService.confirm).not.toHaveBeenCalled();
    });

    it('OBRS-942: a non-manual refund method also opens the cancel modal — the Swal confirm lane is deleted', () => {
      const booking = buildBookingView();
      const policy = {
        originalAmount: 500,
        refundAmount: 500,
        penaltyAmount: 0,
        refundRatePercent: '100%',
        refundMethod: 'card',
        policyWindow: '24h',
      };
      bookingService.getCancellationPolicy.and.returnValue(
        of({ code: 200, message: 'ok', data: policy })
      );

      const emitted: Action[] = [];
      effect.requestCancel$.subscribe((a) => emitted.push(a));

      actionsSubject.next(requestCancelBooking({ booking }));

      expect(emitted).toEqual([openCancelRefundDestinationModal({ booking, policy })]);
      expect(alertService.confirm).not.toHaveBeenCalled();
    });
  });

  describe('confirmCancelWithDestination$', () => {
    const booking = buildBookingView();
    const refundDestination = { type: 'promptpay' as const, promptpayPhone: '0812345678' };

    it('dispatches cancelBookingSuccess on a 200', () => {
      bookingService.cancelBooking.and.returnValue(
        of({
          code: 200,
          message: 'ok',
          data: { bookingId: 5, bookingNumber: 'B-5', status: 'cancelled', refundAmount: 400, refundMethod: 'MANUAL_REFUND_REQUIRED' },
        })
      );

      const emitted: Action[] = [];
      effect.confirmCancelWithDestination$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmCancelWithDestination({ booking, refundDestination }));

      expect(bookingService.cancelBooking).toHaveBeenCalledWith(5, { refundDestination });
      expect(emitted).toEqual([
        cancelBookingSuccess({
          result: { bookingId: 5, bookingNumber: 'B-5', status: 'cancelled', refundAmount: 400, refundMethod: 'MANUAL_REFUND_REQUIRED' },
        }),
      ]);
    });

    it('dispatches refundDestinationInvalid (not cancelBookingFailure) on a destination-invalid 400', () => {
      bookingService.cancelBooking.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errorCode: DESTINATION_INVALID_CODE, message: 'Invalid PromptPay number' },
            })
        )
      );

      const emitted: Action[] = [];
      effect.confirmCancelWithDestination$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmCancelWithDestination({ booking, refundDestination }));

      expect(emitted).toEqual([refundDestinationInvalid({ message: 'Invalid PromptPay number' })]);
    });

    it('dispatches refundDestinationInvalid on a destination-required 400 too', () => {
      bookingService.cancelBooking.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errorCode: DESTINATION_REQUIRED_CODE, message: 'A destination is required' },
            })
        )
      );

      const emitted: Action[] = [];
      effect.confirmCancelWithDestination$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmCancelWithDestination({ booking, refundDestination }));

      expect(emitted).toEqual([refundDestinationInvalid({ message: 'A destination is required' })]);
    });

    it('falls through to the generic cancelBookingFailure on every other error (e.g. window-closed)', () => {
      bookingService.cancelBooking.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errorCode: WINDOW_CLOSED_CODE, message: 'Too late to cancel' },
            })
        )
      );

      const emitted: Action[] = [];
      effect.confirmCancelWithDestination$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmCancelWithDestination({ booking, refundDestination }));

      expect(emitted).toEqual([cancelBookingFailure({ error: 'Too late to cancel' })]);
    });

    it('OBRS-839 (must-NOT-match): a DOTTED destination code falls through to the generic failure', () => {
      // The form the wire never carries. This is the assertion that turns red if
      // the Set is reverted to dotted messageKeys — the two tests above would
      // simply start matching again and stay green, which is exactly how the
      // defect shipped.
      bookingService.cancelBooking.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: {
                errorCode: 'cancel.error.refund-destination-invalid',
                message: 'Invalid PromptPay number',
              },
            })
        )
      );

      const emitted: Action[] = [];
      effect.confirmCancelWithDestination$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmCancelWithDestination({ booking, refundDestination }));

      expect(emitted).toEqual([cancelBookingFailure({ error: 'Invalid PromptPay number' })]);
    });
  });

  // ── OBRS-843: an HTTP 200 whose `data` is null is a FAILURE, and its
  // `message` is the reason phrase "OK" ─────────────────────────────────────
  //
  // Three code paths built their error text as `response.message || <translated>`.
  // On a 2xx that left side is `ApiSuccessRespDto`'s `HttpStatus.OK
  // .getReasonPhrase()`, so the traveler's error toast read "OK" — a word that
  // says nothing went wrong, on the path where something did.
  describe('a 200 with null data never surfaces the envelope message (OBRS-843)', () => {
    const booking = buildBookingView();
    const refundDestination = { type: 'promptpay' as const, promptpayPhone: '0812345678' };

    it('cancel-policy fetch: null data → translated failure, not "OK"', () => {
      bookingService.getCancellationPolicy.and.returnValue(of({ code: 200, message: 'OK', data: null } as any));

      const emitted: Action[] = [];
      effect.requestCancel$.subscribe((a) => emitted.push(a));

      actionsSubject.next(requestCancelBooking({ booking }));

      expect(emitted).toEqual([cancelBookingFailure({ error: 'MY_BOOKINGS.CANCEL.FAILED' })]);
    });

    it('cancel-with-destination: null data → translated failure, not "OK"', () => {
      bookingService.cancelBooking.and.returnValue(of({ code: 200, message: 'OK', data: null } as any));

      const emitted: Action[] = [];
      effect.confirmCancelWithDestination$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmCancelWithDestination({ booking, refundDestination }));

      expect(emitted).toEqual([cancelBookingFailure({ error: 'MY_BOOKINGS.CANCEL.FAILED' })]);
    });
  });

  // ── OBRS-577 AC2/AC6: incremental "Load more" + Decision A's
  // preserveWindow refetch ────────────────────────────────────────────────
  describe('loadMyBookings$ (OBRS-577 preserveWindow sizing)', () => {
    it('a plain (non-preserveWindow) load requests exactly MY_BOOKINGS_PAGE_SIZE at page 0', () => {
      bookingService.getMyBookings.and.returnValue(
        of({ code: 200, message: 'OK', data: { content: [], totalElements: 0, totalPages: 0 } } as any)
      );

      effect.loadMyBookings$.subscribe();
      actionsSubject.next(invokeLoadMyBookingsApi({ status: null }));

      expect(bookingService.getMyBookings).toHaveBeenCalledWith({
        status: null,
        page: 0,
        size: MY_BOOKINGS_PAGE_SIZE,
        showLoadingDialog: undefined,
      });
    });

    it('preserveWindow:true requests page 0 at (pagesLoaded * MY_BOOKINGS_PAGE_SIZE) — refetches the whole loaded window in ONE request (Decision A)', () => {
      store.overrideSelector(selectMyBookings, { ...initialMyBookingsState, pagesLoaded: 5 });
      store.refreshState();
      bookingService.getMyBookings.and.returnValue(
        of({ code: 200, message: 'OK', data: { content: [], totalElements: 0, totalPages: 0 } } as any)
      );

      effect.loadMyBookings$.subscribe();
      actionsSubject.next(invokeLoadMyBookingsApi({ status: 'confirmed', preserveWindow: true }));

      expect(bookingService.getMyBookings).toHaveBeenCalledWith({
        status: 'confirmed',
        page: 0,
        size: 5 * MY_BOOKINGS_PAGE_SIZE,
        showLoadingDialog: undefined,
      });
    });

    it('preserveWindow:true with pagesLoaded=0 (first load never sets it) still requests at least one page, never size=0', () => {
      store.overrideSelector(selectMyBookings, { ...initialMyBookingsState, pagesLoaded: 0 });
      store.refreshState();
      bookingService.getMyBookings.and.returnValue(
        of({ code: 200, message: 'OK', data: { content: [], totalElements: 0, totalPages: 0 } } as any)
      );

      effect.loadMyBookings$.subscribe();
      actionsSubject.next(invokeLoadMyBookingsApi({ status: null, preserveWindow: true }));

      expect(bookingService.getMyBookings).toHaveBeenCalledWith(
        jasmine.objectContaining({ size: MY_BOOKINGS_PAGE_SIZE })
      );
    });

    it('maps a successful response to invokeLoadMyBookingsApiSuccess carrying totalElements/totalPages', () => {
      bookingService.getMyBookings.and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: { content: [{ id: 1 }], totalElements: 137, totalPages: 7 },
        } as any)
      );

      const emitted: Action[] = [];
      effect.loadMyBookings$.subscribe((a) => emitted.push(a));
      actionsSubject.next(invokeLoadMyBookingsApi({ status: null }));

      expect(emitted).toEqual([
        invokeLoadMyBookingsApiSuccess({ bookings: [{ id: 1 } as any], totalElements: 137, totalPages: 7 }),
      ]);
    });
  });

  describe('loadMoreMyBookings$ (OBRS-577 AC2/AC6)', () => {
    it('requests the NEXT page (page = pagesLoaded) at MY_BOOKINGS_PAGE_SIZE, using the active status filter, and never surfaces the global loading dialog', () => {
      store.overrideSelector(selectMyBookings, {
        ...initialMyBookingsState,
        statusFilter: 'confirmed',
        pagesLoaded: 5,
        totalPages: 7,
      });
      store.refreshState();
      bookingService.getMyBookings.and.returnValue(
        of({ code: 200, message: 'OK', data: { content: [], totalElements: 137, totalPages: 7 } } as any)
      );

      effect.loadMoreMyBookings$.subscribe();
      actionsSubject.next(invokeLoadMoreMyBookingsApi());

      expect(bookingService.getMyBookings).toHaveBeenCalledWith({
        status: 'confirmed',
        page: 5,
        size: MY_BOOKINGS_PAGE_SIZE,
        showLoadingDialog: false,
      });
    });

    it('AC6: reaching row 101+ — page 5 (rows 101-120) comes back and is emitted as invokeLoadMoreMyBookingsApiSuccess', () => {
      store.overrideSelector(selectMyBookings, {
        ...initialMyBookingsState,
        pagesLoaded: 5,
        totalPages: 7,
      });
      store.refreshState();
      const page6 = Array.from({ length: MY_BOOKINGS_PAGE_SIZE }, (_, i) => ({ id: 101 + i }));
      bookingService.getMyBookings.and.returnValue(
        of({ code: 200, message: 'OK', data: { content: page6, totalElements: 137, totalPages: 7 } } as any)
      );

      const emitted: Action[] = [];
      effect.loadMoreMyBookings$.subscribe((a) => emitted.push(a));
      actionsSubject.next(invokeLoadMoreMyBookingsApi());

      expect(emitted).toEqual([
        invokeLoadMoreMyBookingsApiSuccess({ bookings: page6 as any, totalElements: 137, totalPages: 7 }),
      ]);
    });

    /**
     * Scrutinize round 3 (QA-caught live-browser failure, `c039fd35`): the
     * PREVIOUS version of this test overrode `selectMyBookings` with
     * `loadingMore: true` and asserted the filter's `!state.loadingMore`
     * clause blocked the dispatch — which is exactly the mechanism that made
     * every real click a no-op: `invokeLoadMoreMyBookingsApi`'s OWN reducer
     * case sets `loadingMore: true`, and NgRx runs the reducer before any
     * effect observes that same action, so in production `!state.loadingMore`
     * was `false` on EVERY dispatch. A statically overridden selector can
     * fake ANY combination — including one the real reducer→effect ordering
     * can never actually produce — so that version of this test proved
     * nothing about double-click protection; it only proved the (buggy)
     * filter clause existed. This version proves the REAL double-click
     * protection (`exhaustMap` ignoring a new source emission while its
     * inner request is still active) using an unresolved request, not a
     * faked flag.
     */
    it('a second Load more click while the first request is still in flight is ignored (exhaustMap), not queued or duplicated', () => {
      store.overrideSelector(selectMyBookings, {
        ...initialMyBookingsState,
        pagesLoaded: 2,
        totalPages: 7,
      });
      store.refreshState();
      const firstRequest$ = new Subject<any>();
      bookingService.getMyBookings.and.returnValue(firstRequest$);

      const emitted: Action[] = [];
      effect.loadMoreMyBookings$.subscribe((a) => emitted.push(a));

      // First click — request A goes in flight, unresolved.
      actionsSubject.next(invokeLoadMoreMyBookingsApi());
      expect(bookingService.getMyBookings).toHaveBeenCalledTimes(1);

      // A second click lands WHILE A is still pending.
      actionsSubject.next(invokeLoadMoreMyBookingsApi());
      // exhaustMap ignores it — no second HTTP call, nothing queued.
      expect(bookingService.getMyBookings).toHaveBeenCalledTimes(1);

      // A finally resolves — exactly one success, from the FIRST click only.
      firstRequest$.next({
        code: 200,
        message: 'OK',
        data: { content: [{ id: 1 }], totalElements: 137, totalPages: 7 },
      } as any);
      firstRequest$.complete();

      expect(emitted).toEqual([
        invokeLoadMoreMyBookingsApiSuccess({ bookings: [{ id: 1 } as any], totalElements: 137, totalPages: 7 }),
      ]);
    });

    it('the remaining guard clause (pagesLoaded < totalPages) is sound — that action never touches either field, so it cannot be defeated by reducer/effect ordering', () => {
      store.overrideSelector(selectMyBookings, {
        ...initialMyBookingsState,
        pagesLoaded: 7,
        totalPages: 7,
      });
      store.refreshState();

      const emitted: Action[] = [];
      effect.loadMoreMyBookings$.subscribe((a) => emitted.push(a));
      actionsSubject.next(invokeLoadMoreMyBookingsApi());

      expect(emitted).toEqual([]);
      expect(bookingService.getMyBookings).not.toHaveBeenCalled();
    });

    it('a failure dispatches invokeLoadMoreMyBookingsApiFailure and toasts (list/count line stay untouched, per spec)', () => {
      store.overrideSelector(selectMyBookings, {
        ...initialMyBookingsState,
        pagesLoaded: 1,
        totalPages: 7,
      });
      store.refreshState();
      bookingService.getMyBookings.and.returnValue(throwError(() => new Error('network')));

      const emitted: Action[] = [];
      effect.loadMoreMyBookings$.subscribe((a) => emitted.push(a));
      actionsSubject.next(invokeLoadMoreMyBookingsApi());

      expect(emitted.length).toBe(1);
      expect((emitted[0] as ReturnType<typeof invokeLoadMoreMyBookingsApiFailure>).error).toBeTruthy();

      effect.loadMoreMyBookingsFailureToast$.subscribe();
      actionsSubject.next(invokeLoadMoreMyBookingsApiFailure({ error: 'oops' }));
      expect(alertService.error).toHaveBeenCalledWith('oops');
    });

    /**
     * Scrutinize composed-path fix: a status-filter switch (or Retry, or any
     * of the 6 mutation reloads) dispatches `invokeLoadMyBookingsApi` while a
     * Load more request is still in flight. Without cancelling that in-flight
     * request, its eventual response appends onto — and overwrites the
     * totals of — the list the superseding full load just replaced,
     * producing a permanently wrong-filter, wrong-count list. A single-action
     * test cannot reach this: the request must be left UNRESOLVED (a bare
     * Subject, not `of(...)`) so the superseding action can be dispatched
     * while it is still pending.
     */
    it('a superseding invokeLoadMyBookingsApi (filter switch/Retry/mutation reload) cancels an in-flight Load more before it can append — and the effect stream survives to serve the NEXT Load more', () => {
      store.overrideSelector(selectMyBookings, {
        ...initialMyBookingsState,
        statusFilter: 'confirmed',
        pagesLoaded: 3,
        totalPages: 7,
      });
      store.refreshState();
      const loadMoreResponse$ = new Subject<any>();
      bookingService.getMyBookings.and.returnValue(loadMoreResponse$);

      const emitted: Action[] = [];
      effect.loadMoreMyBookings$.subscribe((a) => emitted.push(a));

      // Request A (Load more, page 3) goes in flight...
      actionsSubject.next(invokeLoadMoreMyBookingsApi());
      // ...then the user switches filters (or Retry, or a mutation settles)
      // before A resolves — a superseding full load.
      actionsSubject.next(invokeLoadMyBookingsApi({ status: null }));
      // A finally resolves, carrying the OLD filter's page/status...
      loadMoreResponse$.next({
        code: 200,
        message: 'OK',
        data: { content: [{ id: 999 }], totalElements: 999, totalPages: 99 },
      } as any);
      loadMoreResponse$.complete();

      // ...but must never reach the reducer: cancelled, not appended.
      expect(emitted).toEqual([]);

      // Scrutinize: `emitted === []` alone can't distinguish "correctly
      // cancelled request A" from "takeUntil placed on the OUTER stream,
      // killing loadMoreMyBookings$ permanently after the first supersession"
      // — both produce an empty array here. Prove the effect is still ALIVE
      // by driving a completely fresh Load more through it and asserting it
      // resolves normally.
      bookingService.getMyBookings.and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: { content: [{ id: 1 }], totalElements: 137, totalPages: 7 },
        } as any)
      );
      actionsSubject.next(invokeLoadMoreMyBookingsApi());

      expect(emitted).toEqual([
        invokeLoadMoreMyBookingsApiSuccess({ bookings: [{ id: 1 } as any], totalElements: 137, totalPages: 7 }),
      ]);
    });
  });

  describe('cancelSuccess$ (OBRS-577 Decision A)', () => {
    it('reloads with preserveWindow:true so a multi-page list does not snap back to page 1 after a successful cancel', () => {
      bookingService.cancelBooking.and.returnValue(
        of({
          code: 200,
          message: 'ok',
          data: { bookingId: 5, bookingNumber: 'B-5', status: 'cancelled', refundAmount: 400, refundMethod: 'card' },
        })
      );
      store.overrideSelector(selectMyBookings, { ...initialMyBookingsState, statusFilter: 'confirmed' });
      store.refreshState();

      const emitted: Action[] = [];
      effect.cancelSuccess$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        cancelBookingSuccess({
          result: { bookingId: 5, bookingNumber: 'B-5', status: 'cancelled', refundAmount: 400, refundMethod: 'card' },
        })
      );

      expect(emitted).toEqual([
        invokeLoadMyBookingsApi({ status: 'confirmed', preserveWindow: true }),
      ]);
    });
  });
});
