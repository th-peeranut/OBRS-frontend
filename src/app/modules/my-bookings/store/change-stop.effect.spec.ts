import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Actions } from '@ngrx/effects';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { Action } from '@ngrx/store';

import { ChangeStopEffect } from './change-stop.effect';
import { BookingService } from '../../../services/booking/booking.service';
import { StationService } from '../../../services/station/station.service';
import { RouteMapService } from '../../../services/route-map/route-map.service';
import { AlertService } from '../../../shared/services/alert.service';
import { ResponseAPI } from '../../../shared/interfaces/response.interface';
import { ChangeStopResult } from '../../../shared/interfaces/change-stop.interface';
import { MyBookingDto } from '../../../shared/interfaces/my-booking.interface';
import { BookingTicketsData } from '../../../shared/interfaces/booking-ticket.interface';
import {
  changeStopAbandoned,
  changeStopRequiresPayment,
  changeStopSettled,
  closeChangeStopDialog,
  confirmChangeStop,
  confirmChangeStopFailure,
  confirmChangeStopSuccess,
  invokeLoadMyBookingsApi,
  loadChangeStopEstimate,
  loadChangeStopEstimateFailure,
  loadChangeStopRouteStops,
  loadChangeStopRouteStopsFailure,
  loadChangeStopTicketsSuccess,
  loadStopsLookupFailure,
  openChangeStopDialog,
} from './my-bookings.action';
import { initialMyBookingsState } from './my-bookings.model';
import { selectMyBookings } from './my-bookings.selector';

describe('ChangeStopEffect', () => {
  let actionsSubject: Subject<Action>;
  let effect: ChangeStopEffect;
  let bookingService: jasmine.SpyObj<BookingService>;
  let alertService: jasmine.SpyObj<AlertService>;
  let store: MockStore;

  const CONFIRM_PAYLOAD = {
    bookingId: 5,
    newFromStopId: 10,
    newToStopId: 30,
    seatAssignments: { 11: 'B4' },
    clientNetAmount: 50,
  };

  function buildBooking(overrides: Partial<MyBookingDto> = {}): MyBookingDto {
    return {
      id: 5,
      bookingNumber: 'B-5',
      status: 'confirmed',
      bookingType: 'one_way',
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

  beforeEach(async () => {
    actionsSubject = new Subject<Action>();
    bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getChangeStopEstimate',
      'confirmChangeStop',
      'getBookingTickets',
      'setActiveBookingId',
    ]);
    alertService = jasmine.createSpyObj<AlertService>('AlertService', ['success', 'error', 'info']);

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        ChangeStopEffect,
        provideMockStore({ initialState: { myBookings: initialMyBookingsState } }),
        { provide: Actions, useValue: new Actions(actionsSubject) },
        { provide: BookingService, useValue: bookingService },
        { provide: StationService, useValue: jasmine.createSpyObj('StationService', ['getAll']) },
        { provide: RouteMapService, useValue: jasmine.createSpyObj('RouteMapService', ['getPickupDropoff']) },
        { provide: AlertService, useValue: alertService },
      ],
    }).compileComponents();

    effect = TestBed.inject(ChangeStopEffect);
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

  describe('loadRouteStopsOnOpen$', () => {
    it('resolves routeSlug from the (already-loaded) bookings list and dispatches loadChangeStopRouteStops', () => {
      store.overrideSelector(selectMyBookings, { ...initialMyBookingsState, bookings: [buildBooking()] });
      store.refreshState();

      const emitted: Action[] = [];
      effect.loadRouteStopsOnOpen$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openChangeStopDialog({ bookingId: 5 }));

      expect(emitted).toEqual([loadChangeStopRouteStops({ bookingId: 5, routeSlug: 'bkk-cnx' })]);
    });

    it('fails immediately (no network call) when the booking has no routeSlug', () => {
      store.overrideSelector(selectMyBookings, {
        ...initialMyBookingsState,
        bookings: [buildBooking({ bookingSchedules: [{ id: 1, fromStop: { code: 'a' }, toStop: { code: 'c' } }] })],
      });
      store.refreshState();

      const emitted: Action[] = [];
      effect.loadRouteStopsOnOpen$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openChangeStopDialog({ bookingId: 5 }));

      expect(emitted).toEqual([
        loadChangeStopRouteStopsFailure({ error: 'MY_BOOKINGS.CHANGE_STOP.STOPS_LOAD_ERROR' }),
      ]);
    });
  });

  describe('loadChangeStopTickets$ (OBRS-483: OPEN-seating no longer silently no-ops)', () => {
    it('includes a CONFIRMED ticket with a null seatNumber (OPEN seating) instead of dropping it', () => {
      // Before OBRS-483, `.filter((ticket) => !!ticket.seatNumber)` dropped
      // EVERY ticket on an OPEN-seating schedule (seatNumber is null by
      // backend invariant) — change-stop looked like it did nothing at all.
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
      effect.loadChangeStopTickets$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openChangeStopDialog({ bookingId: 4 }));

      expect(emitted).toEqual([
        loadChangeStopTicketsSuccess({ tickets: [{ ticketId: 31, seatNumber: null }] }),
      ]);
    });

    it('excludes a CANCELLED leftover ticket that still carries a seatNumber (mirrors the OBRS-171 change-seat guard)', () => {
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
      effect.loadChangeStopTickets$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openChangeStopDialog({ bookingId: 4 }));

      expect(emitted).toEqual([
        loadChangeStopTicketsSuccess({ tickets: [{ ticketId: 15, seatNumber: '4' }] }),
      ]);
    });
  });

  describe('code-less failure branching (OBRS-170)', () => {
    it('loadStopsLookupOnOpen$ maps a 5xx/network failure with no backend message to the SERVICE_UNAVAILABLE key', () => {
      const stationService = TestBed.inject(StationService) as jasmine.SpyObj<StationService>;
      stationService.getAll.and.returnValue(
        throwError(() => new HttpErrorResponse({ error: null, status: 502 }))
      );

      const emitted: Action[] = [];
      effect.loadStopsLookupOnOpen$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openChangeStopDialog({ bookingId: 5 }));

      expect(emitted).toEqual([
        loadStopsLookupFailure({ error: 'MY_BOOKINGS.CHANGE_STOP.ERROR.SERVICE_UNAVAILABLE' }),
      ]);
    });

    it('loadStopsLookupOnOpen$ maps a code-less 4xx failure to the ACTION_UNAVAILABLE key', () => {
      const stationService = TestBed.inject(StationService) as jasmine.SpyObj<StationService>;
      stationService.getAll.and.returnValue(
        throwError(() => new HttpErrorResponse({ error: null, status: 403 }))
      );

      const emitted: Action[] = [];
      effect.loadStopsLookupOnOpen$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openChangeStopDialog({ bookingId: 5 }));

      expect(emitted).toEqual([
        loadStopsLookupFailure({ error: 'MY_BOOKINGS.CHANGE_STOP.ERROR.ACTION_UNAVAILABLE' }),
      ]);
    });

    it('loadChangeStopRouteStops$ maps a 5xx/network failure to the SERVICE_UNAVAILABLE key', () => {
      const routeMapService = TestBed.inject(RouteMapService) as jasmine.SpyObj<RouteMapService>;
      routeMapService.getPickupDropoff.and.returnValue(
        throwError(() => new HttpErrorResponse({ error: null, status: 0 }))
      );

      const emitted: Action[] = [];
      effect.loadChangeStopRouteStops$.subscribe((a) => emitted.push(a));

      actionsSubject.next(loadChangeStopRouteStops({ bookingId: 5, routeSlug: 'bkk-cnx' }));

      expect(emitted).toEqual([
        loadChangeStopRouteStopsFailure({ error: 'MY_BOOKINGS.CHANGE_STOP.ERROR.SERVICE_UNAVAILABLE' }),
      ]);
    });

    it('loadChangeStopEstimate$ maps a code-less 5xx failure to the SERVICE_UNAVAILABLE key', () => {
      bookingService.getChangeStopEstimate.and.returnValue(
        throwError(() => new HttpErrorResponse({ error: null, status: 500 }))
      );

      const emitted: Action[] = [];
      effect.loadChangeStopEstimate$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        loadChangeStopEstimate({ bookingId: 5, newFromStopId: 10, newToStopId: 30, seats: ['B4'] })
      );

      expect(emitted).toEqual([
        loadChangeStopEstimateFailure({ error: 'MY_BOOKINGS.CHANGE_STOP.ERROR.SERVICE_UNAVAILABLE' }),
      ]);
    });

    it('loadChangeStopEstimate$ still prefers a recognized errorCode over the status-based fallback', () => {
      bookingService.getChangeStopEstimate.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({ error: { errorCode: 'CHANGE_STOP_ERROR_ROUTE_MISMATCH' }, status: 400 })
        )
      );

      const emitted: Action[] = [];
      effect.loadChangeStopEstimate$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        loadChangeStopEstimate({ bookingId: 5, newFromStopId: 10, newToStopId: 30, seats: ['B4'] })
      );

      expect(emitted).toEqual([
        loadChangeStopEstimateFailure({ error: 'MY_BOOKINGS.CHANGE_STOP.ERROR.ROUTE_MISMATCH' }),
      ]);
    });

    it('confirmChangeStop$ maps a code-less 4xx failure to the ACTION_UNAVAILABLE key', () => {
      bookingService.confirmChangeStop.and.returnValue(
        throwError(() => new HttpErrorResponse({ error: null, status: 403 }))
      );

      const emitted: Action[] = [];
      effect.confirmChangeStop$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmChangeStop(CONFIRM_PAYLOAD));

      expect(emitted).toEqual([
        confirmChangeStopFailure({
          errorCode: 'GENERIC',
          error: 'MY_BOOKINGS.CHANGE_STOP.ERROR.ACTION_UNAVAILABLE',
        }),
      ]);
    });
  });

  describe('confirmChangeStop$', () => {
    it('sends the payload to BookingService.confirmChangeStop and emits success', () => {
      const result: ChangeStopResult = { bookingId: 5, bookingNumber: 'B-5', status: 'CONFIRMED' };
      bookingService.confirmChangeStop.and.returnValue(
        of({ code: 200, message: 'OK', data: result } as ResponseAPI<ChangeStopResult>)
      );

      const emitted: Action[] = [];
      effect.confirmChangeStop$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmChangeStop(CONFIRM_PAYLOAD));

      expect(bookingService.confirmChangeStop).toHaveBeenCalledWith(5, {
        newFromStopId: 10,
        newToStopId: 30,
        seatAssignments: { 11: 'B4' },
        clientNetAmount: 50,
      });
      expect(emitted).toEqual([confirmChangeStopSuccess({ result })]);
    });

    it('maps a failed call to confirmChangeStopFailure with the extracted errorCode', () => {
      const httpError = new HttpErrorResponse({
        error: { errorCode: 'CHANGE_STOP_ERROR_NO_SEATS' },
        status: 409,
      });
      bookingService.confirmChangeStop.and.returnValue(throwError(() => httpError));

      const emitted: Action[] = [];
      effect.confirmChangeStop$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmChangeStop(CONFIRM_PAYLOAD));

      expect(emitted).toEqual([
        confirmChangeStopFailure({
          errorCode: 'CHANGE_STOP_ERROR_NO_SEATS',
          error: 'MY_BOOKINGS.CHANGE_STOP.ERROR.NO_SEATS',
        }),
      ]);
    });
  });

  describe('OBRS-483: CHANGE_STOP_ERROR_OPEN_SEATING_NOT_SUPPORTED (backend hard-rejects change-stop confirm on an OPEN schedule)', () => {
    it('maps the errorCode to its localized message', () => {
      const httpError = new HttpErrorResponse({
        error: { errorCode: 'CHANGE_STOP_ERROR_OPEN_SEATING_NOT_SUPPORTED' },
        status: 400,
      });
      bookingService.confirmChangeStop.and.returnValue(throwError(() => httpError));

      const emitted: Action[] = [];
      effect.confirmChangeStop$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmChangeStop(CONFIRM_PAYLOAD));

      expect(emitted).toEqual([
        confirmChangeStopFailure({
          errorCode: 'CHANGE_STOP_ERROR_OPEN_SEATING_NOT_SUPPORTED',
          error: 'MY_BOOKINGS.CHANGE_STOP.ERROR.OPEN_SEATING_NOT_SUPPORTED',
        }),
      ]);
    });

    it('is terminal — closes the dialog and toasts, rather than staying inline', () => {
      const emitted: Action[] = [];
      effect.confirmChangeStopTerminalFailure$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        confirmChangeStopFailure({
          errorCode: 'CHANGE_STOP_ERROR_OPEN_SEATING_NOT_SUPPORTED',
          error: 'nope',
        })
      );

      expect(alertService.error).toHaveBeenCalledWith('nope');
      expect(emitted).toEqual([closeChangeStopDialog()]);
    });
  });

  describe('CONFIRMED vs PENDING_PAYMENT branching', () => {
    it('CONFIRMED settles the dialog (changeStopSettled)', () => {
      const emitted: Action[] = [];
      effect.confirmChangeStopConfirmed$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        confirmChangeStopSuccess({ result: { bookingId: 5, bookingNumber: 'B-5', status: 'CONFIRMED' } })
      );

      expect(emitted).toEqual([changeStopSettled()]);
    });

    it('PENDING_PAYMENT hands off to the embedded payment step and marks the active booking id', () => {
      const emitted: Action[] = [];
      effect.confirmChangeStopPending$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        confirmChangeStopSuccess({
          result: { bookingId: 5, bookingNumber: 'B-5', status: 'PENDING_PAYMENT', paymentIntentId: 42 },
        })
      );

      expect(bookingService.setActiveBookingId).toHaveBeenCalledWith(5);
      expect(emitted).toEqual([changeStopRequiresPayment({ bookingId: 5, paymentIntentId: 42 })]);
    });

    it('CONFIRMED does NOT also trigger the pending-payment handoff', () => {
      const emitted: Action[] = [];
      effect.confirmChangeStopPending$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        confirmChangeStopSuccess({ result: { bookingId: 5, bookingNumber: 'B-5', status: 'CONFIRMED' } })
      );

      expect(emitted).toEqual([]);
    });
  });

  describe('changeStopSettled$ / changeStopAbandoned$', () => {
    it('changeStopSettled$ toasts success, closes the dialog, and reloads the list — never gated behind the reload', () => {
      store.overrideSelector(selectMyBookings, { ...initialMyBookingsState, statusFilter: 'confirmed' });
      store.refreshState();

      const emitted: Action[] = [];
      effect.changeStopSettled$.subscribe((a) => emitted.push(a));

      actionsSubject.next(changeStopSettled());

      expect(alertService.success).toHaveBeenCalled();
      expect(emitted).toEqual([closeChangeStopDialog(), invokeLoadMyBookingsApi({ status: 'confirmed' })]);
    });

    it('changeStopAbandoned$ toasts an info notice (not success), closes the dialog, and reloads the list', () => {
      const emitted: Action[] = [];
      effect.changeStopAbandoned$.subscribe((a) => emitted.push(a));

      actionsSubject.next(changeStopAbandoned());

      expect(alertService.info).toHaveBeenCalled();
      expect(alertService.success).not.toHaveBeenCalled();
      expect(emitted).toEqual([closeChangeStopDialog(), invokeLoadMyBookingsApi({ status: null })]);
    });
  });

  describe('terminal errorCode branching', () => {
    it('a terminal errorCode (MAX_COUNT) toasts an error and closes the dialog', () => {
      const emitted: Action[] = [];
      effect.confirmChangeStopTerminalFailure$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmChangeStopFailure({ errorCode: 'CHANGE_STOP_ERROR_MAX_COUNT', error: 'nope' }));

      expect(alertService.error).toHaveBeenCalledWith('nope');
      expect(emitted).toEqual([closeChangeStopDialog()]);
    });

    it('a non-terminal errorCode (NO_SEATS) does NOT trigger the terminal-failure effect (stays inline)', () => {
      const emitted: Action[] = [];
      effect.confirmChangeStopTerminalFailure$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmChangeStopFailure({ errorCode: 'CHANGE_STOP_ERROR_NO_SEATS', error: 'try again' }));

      expect(emitted).toEqual([]);
      expect(alertService.error).not.toHaveBeenCalled();
    });
  });
});
