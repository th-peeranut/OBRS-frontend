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
  openCancelRefundDestinationModal,
  refundDestinationInvalid,
  requestCancelBooking,
} from './my-bookings.action';
import { initialMyBookingsState } from './my-bookings.model';
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

    it('is byte-identical (still the Swal confirm path) for a non-manual refund method', async () => {
      const booking = buildBookingView();
      bookingService.getCancellationPolicy.and.returnValue(
        of({
          code: 200,
          message: 'ok',
          data: {
            originalAmount: 500,
            refundAmount: 500,
            penaltyAmount: 0,
            refundRatePercent: '100%',
            refundMethod: 'card',
            policyWindow: '24h',
          },
        })
      );
      alertService.confirm.and.resolveTo(false);

      const emitted: Action[] = [];
      effect.requestCancel$.subscribe((a) => emitted.push(a));

      actionsSubject.next(requestCancelBooking({ booking }));
      await Promise.resolve();
      await Promise.resolve();

      expect(alertService.confirm).toHaveBeenCalled();
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
});
