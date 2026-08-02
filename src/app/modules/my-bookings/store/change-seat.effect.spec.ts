import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Actions } from '@ngrx/effects';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { Action } from '@ngrx/store';

import { ChangeSeatEffect } from './change-seat.effect';
import { BookingService } from '../../../services/booking/booking.service';
import { AlertService } from '../../../shared/services/alert.service';
import { ResponseAPI } from '../../../shared/interfaces/response.interface';
import { ChangeSeatResult } from '../../../shared/interfaces/change-seat.interface';
import { BookingTicketsData } from '../../../shared/interfaces/booking-ticket.interface';
import {
  changeSeatSettled,
  closeChangeSeatDialog,
  confirmChangeSeat,
  confirmChangeSeatFailure,
  confirmChangeSeatSuccess,
  invokeLoadMyBookingsApi,
  loadChangeSeatAvailability,
  loadChangeSeatAvailabilityFailure,
  loadChangeSeatTicketsFailure,
  loadChangeSeatTicketsSuccess,
  openChangeSeatDialog,
} from './my-bookings.action';
import { initialMyBookingsState } from './my-bookings.model';
import { selectMyBookings } from './my-bookings.selector';

describe('ChangeSeatEffect', () => {
  let actionsSubject: Subject<Action>;
  let effect: ChangeSeatEffect;
  let bookingService: jasmine.SpyObj<BookingService>;
  let alertService: jasmine.SpyObj<AlertService>;
  let store: MockStore;

  const CONFIRM_PAYLOAD = {
    bookingId: 5,
    seatAssignments: { 11: 'B4' },
  };

  beforeEach(async () => {
    actionsSubject = new Subject<Action>();
    bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getChangeSeatAvailability',
      'confirmChangeSeat',
      'getBookingTickets',
    ]);
    alertService = jasmine.createSpyObj<AlertService>('AlertService', ['success', 'error', 'info']);

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        ChangeSeatEffect,
        provideMockStore({ initialState: { myBookings: initialMyBookingsState } }),
        { provide: Actions, useValue: new Actions(actionsSubject) },
        { provide: BookingService, useValue: bookingService },
        { provide: AlertService, useValue: alertService },
      ],
    }).compileComponents();

    effect = TestBed.inject(ChangeSeatEffect);
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectMyBookings, initialMyBookingsState);
  });

  afterEach(() => {
    // See the matching comment in reschedule.effect.spec.ts —
    // `overrideSelector` pins the shared selector singleton's memoized
    // result and leaks into other spec files in the same Karma bundle
    // unless released.
    store.resetSelectors();
  });

  describe('loadChangeSeatTickets$ (OBRS-171 follow-up: ticket-mismatch on stop-changed/rescheduled bookings)', () => {
    it('excludes a CANCELLED leftover ticket that still carries a seatNumber, keeping only the CONFIRMED ticket — proving the change-seat keyset now matches the backend\'s confirmed-ticket set', () => {
      // Mirrors the live-DB proof for B-P4HPH6 (bookingId 4): ticket 11 =
      // seat "4" status=cancelled (leftover from a prior change-stop/
      // reschedule, which cancel+recreate tickets), ticket 15 = seat "4"
      // status=confirmed. Filtering on seatNumber alone used to seed both,
      // so the dialog sent keys {11,15} while the backend's confirmed set
      // was {15} → CHANGE_SEAT_ERROR_TICKET_MISMATCH.
      bookingService.getBookingTickets.and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: {
            bookingId: 4,
            bookingNumber: 'B-P4HPH6',
            journeys: [
              {
                tickets: [
                  {
                    id: 11,
                    ticketNumber: 'T-11',
                    seatNumber: '4',
                    status: { code: 'cancelled', label: 'Cancelled' },
                  },
                  {
                    id: 15,
                    ticketNumber: 'T-15',
                    seatNumber: '4',
                    status: { code: 'confirmed', label: 'Confirmed' },
                  },
                ],
              },
            ],
          },
        } as ResponseAPI<BookingTicketsData>)
      );

      const emitted: Action[] = [];
      effect.loadChangeSeatTickets$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openChangeSeatDialog({ bookingId: 4 }));

      expect(emitted).toEqual([
        loadChangeSeatTicketsSuccess({ tickets: [{ ticketId: 15, seatNumber: '4' }] }),
      ]);
    });

    it('OBRS-483: includes a CONFIRMED ticket with a null seatNumber (OPEN seating) instead of dropping it — change-seat itself stays gated off for OPEN via changeSeatEligible=false, but the effect must not additionally rely on `!!ticket.seatNumber`', () => {
      bookingService.getBookingTickets.and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: {
            bookingId: 4,
            bookingNumber: 'B-OPEN1',
            journeys: [
              {
                tickets: [
                  {
                    id: 31,
                    ticketNumber: 'T-31',
                    seatNumber: null,
                    status: { code: 'confirmed', label: 'Confirmed' },
                  },
                ],
              },
            ],
          },
        } as ResponseAPI<BookingTicketsData>)
      );

      const emitted: Action[] = [];
      effect.loadChangeSeatTickets$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openChangeSeatDialog({ bookingId: 4 }));

      // `ChangeSeatTicket.seatNumber` stays typed `string` (change-seat is
      // ASSIGNED-only in practice, gated off for OPEN by `changeSeatEligible`)
      // — the cast documents that this path is never really null in
      // production, only in this defense-in-depth proof.
      expect(emitted).toEqual([
        loadChangeSeatTicketsSuccess({ tickets: [{ ticketId: 31, seatNumber: null as unknown as string }] }),
      ]);
    });

    it('is case/whitespace-insensitive on the confirmed-status check, mirroring normalizeStatusCode', () => {
      bookingService.getBookingTickets.and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: {
            bookingId: 6,
            bookingNumber: 'B-6',
            journeys: [
              {
                tickets: [
                  { id: 21, ticketNumber: 'T-21', seatNumber: '7', status: { code: ' CONFIRMED ', label: 'Confirmed' } },
                ],
              },
            ],
          },
        } as ResponseAPI<BookingTicketsData>)
      );

      const emitted: Action[] = [];
      effect.loadChangeSeatTickets$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openChangeSeatDialog({ bookingId: 6 }));

      expect(emitted).toEqual([
        loadChangeSeatTicketsSuccess({ tickets: [{ ticketId: 21, seatNumber: '7' }] }),
      ]);
    });

    it('still surfaces a failure when the API call itself fails, tiered on HTTP status (OBRS-170)', () => {
      bookingService.getBookingTickets.and.returnValue(
        throwError(() => new HttpErrorResponse({ error: null, status: 500 }))
      );

      const emitted: Action[] = [];
      effect.loadChangeSeatTickets$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openChangeSeatDialog({ bookingId: 4 }));

      expect(emitted).toEqual([
        loadChangeSeatTicketsFailure({ error: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.SERVICE_UNAVAILABLE' }),
      ]);
    });
  });

  describe('loadChangeSeatAvailability$ code-less failure branching (OBRS-170)', () => {
    it('maps a 5xx/network failure with no errorCode to the SERVICE_UNAVAILABLE key', () => {
      bookingService.getChangeSeatAvailability.and.returnValue(
        throwError(() => new HttpErrorResponse({ error: null, status: 503 }))
      );

      const emitted: Action[] = [];
      effect.loadChangeSeatAvailability$.subscribe((a) => emitted.push(a));

      actionsSubject.next(loadChangeSeatAvailability({ bookingId: 5 }));

      expect(emitted).toEqual([
        loadChangeSeatAvailabilityFailure({ error: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.SERVICE_UNAVAILABLE' }),
      ]);
    });

    it('maps a code-less 4xx failure to the ACTION_UNAVAILABLE key', () => {
      bookingService.getChangeSeatAvailability.and.returnValue(
        throwError(() => new HttpErrorResponse({ error: null, status: 403 }))
      );

      const emitted: Action[] = [];
      effect.loadChangeSeatAvailability$.subscribe((a) => emitted.push(a));

      actionsSubject.next(loadChangeSeatAvailability({ bookingId: 5 }));

      expect(emitted).toEqual([
        loadChangeSeatAvailabilityFailure({ error: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.ACTION_UNAVAILABLE' }),
      ]);
    });

    it('still prefers a recognized errorCode over the status-based fallback', () => {
      bookingService.getChangeSeatAvailability.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              error: { errorCode: 'CHANGE_SEAT_ERROR_WINDOW_CLOSED' },
              status: 400,
            })
        )
      );

      const emitted: Action[] = [];
      effect.loadChangeSeatAvailability$.subscribe((a) => emitted.push(a));

      actionsSubject.next(loadChangeSeatAvailability({ bookingId: 5 }));

      expect(emitted).toEqual([
        loadChangeSeatAvailabilityFailure({ error: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.WINDOW_CLOSED' }),
      ]);
    });
  });

  describe('confirmChangeSeat$', () => {
    it('sends the seatAssignments map to BookingService.confirmChangeSeat and emits success', () => {
      const result: ChangeSeatResult = {
        bookingId: 5,
        bookingNumber: 'B-5',
        status: 'CONFIRMED',
        paymentIntentId: null,
      };
      bookingService.confirmChangeSeat.and.returnValue(
        of({ code: 200, message: 'OK', data: result } as ResponseAPI<ChangeSeatResult>)
      );

      const emitted: Action[] = [];
      effect.confirmChangeSeat$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmChangeSeat(CONFIRM_PAYLOAD));

      expect(bookingService.confirmChangeSeat).toHaveBeenCalledWith(5, { 11: 'B4' });
      expect(emitted).toEqual([confirmChangeSeatSuccess({ result })]);
    });

    it('maps a failed call to confirmChangeSeatFailure with the extracted errorCode', () => {
      const httpError = new HttpErrorResponse({
        error: { errorCode: 'CHANGE_SEAT_ERROR_SEAT_UNAVAILABLE' },
        status: 409,
      });
      bookingService.confirmChangeSeat.and.returnValue(throwError(() => httpError));

      const emitted: Action[] = [];
      effect.confirmChangeSeat$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmChangeSeat(CONFIRM_PAYLOAD));

      expect(emitted).toEqual([
        confirmChangeSeatFailure({
          errorCode: 'CHANGE_SEAT_ERROR_SEAT_UNAVAILABLE',
          error: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.SEAT_UNAVAILABLE',
        }),
      ]);
    });

    it('maps a code-less 5xx confirm failure to the SERVICE_UNAVAILABLE key (OBRS-170)', () => {
      const httpError = new HttpErrorResponse({ error: null, status: 500 });
      bookingService.confirmChangeSeat.and.returnValue(throwError(() => httpError));

      const emitted: Action[] = [];
      effect.confirmChangeSeat$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmChangeSeat(CONFIRM_PAYLOAD));

      expect(emitted).toEqual([
        confirmChangeSeatFailure({
          errorCode: 'GENERIC',
          error: 'MY_BOOKINGS.CHANGE_SEAT.ERROR.SERVICE_UNAVAILABLE',
        }),
      ]);
    });
  });

  describe('CONFIRMED settles the dialog', () => {
    it('emits changeSeatSettled', () => {
      const emitted: Action[] = [];
      effect.confirmChangeSeatConfirmed$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        confirmChangeSeatSuccess({
          result: { bookingId: 5, bookingNumber: 'B-5', status: 'CONFIRMED', paymentIntentId: null },
        })
      );

      expect(emitted).toEqual([changeSeatSettled()]);
    });
  });

  describe('changeSeatSettled$', () => {
    it('toasts success, closes the dialog, and reloads the list with the active status filter — never gated behind the reload', () => {
      store.overrideSelector(selectMyBookings, { ...initialMyBookingsState, statusFilter: 'confirmed' });
      store.refreshState();

      const emitted: Action[] = [];
      effect.changeSeatSettled$.subscribe((a) => emitted.push(a));

      actionsSubject.next(changeSeatSettled());

      expect(alertService.success).toHaveBeenCalled();
      // OBRS-577 Decision A: preserveWindow:true so a multi-page list
      // doesn't snap back to page 1 after a settled change-seat.
      expect(emitted).toEqual([
        closeChangeSeatDialog(),
        invokeLoadMyBookingsApi({ status: 'confirmed', preserveWindow: true }),
      ]);
    });
  });

  describe('terminal vs. return-to-map errorCode branching', () => {
    it('a terminal errorCode (MAX_COUNT) toasts an error and closes the dialog', () => {
      const emitted: Action[] = [];
      effect.confirmChangeSeatTerminalFailure$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        confirmChangeSeatFailure({ errorCode: 'CHANGE_SEAT_ERROR_MAX_COUNT', error: 'nope' })
      );

      expect(alertService.error).toHaveBeenCalledWith('nope');
      expect(emitted).toEqual([closeChangeSeatDialog()]);
    });

    it('a non-terminal errorCode (SEAT_UNAVAILABLE) does NOT trigger the terminal-failure effect', () => {
      const emitted: Action[] = [];
      effect.confirmChangeSeatTerminalFailure$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        confirmChangeSeatFailure({ errorCode: 'CHANGE_SEAT_ERROR_SEAT_UNAVAILABLE', error: 'try again' })
      );

      expect(emitted).toEqual([]);
      expect(alertService.error).not.toHaveBeenCalled();
    });

    it('a non-terminal errorCode (NO_SEATS) re-dispatches loadChangeSeatAvailability for the open dialog\'s booking', () => {
      store.overrideSelector(selectMyBookings, {
        ...initialMyBookingsState,
        changeSeatDialogBookingId: 5,
      });
      store.refreshState();

      const emitted: Action[] = [];
      effect.confirmChangeSeatReturnToMap$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        confirmChangeSeatFailure({ errorCode: 'CHANGE_SEAT_ERROR_NO_SEATS', error: 'gone' })
      );

      expect(emitted).toEqual([loadChangeSeatAvailability({ bookingId: 5 })]);
    });

    it('a terminal errorCode does NOT also trigger the return-to-map re-fetch', () => {
      store.overrideSelector(selectMyBookings, {
        ...initialMyBookingsState,
        changeSeatDialogBookingId: 5,
      });
      store.refreshState();

      const emitted: Action[] = [];
      effect.confirmChangeSeatReturnToMap$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        confirmChangeSeatFailure({ errorCode: 'CHANGE_SEAT_ERROR_MAX_COUNT', error: 'nope' })
      );

      expect(emitted).toEqual([]);
    });
  });
});
