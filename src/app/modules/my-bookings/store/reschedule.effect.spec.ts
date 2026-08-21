import { TestBed } from '@angular/core/testing';
import { Actions } from '@ngrx/effects';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';
import { Action } from '@ngrx/store';

import { RescheduleEffect } from './reschedule.effect';
import { BookingService } from '../../../services/booking/booking.service';
import { StationService } from '../../../services/station/station.service';
import { AlertService } from '../../../shared/services/alert.service';
import { ResponseAPI } from '../../../shared/interfaces/response.interface';
import { StationApi } from '../../../shared/interfaces/station.interface';
import { RescheduleEstimate, RescheduleResult } from '../../../shared/interfaces/reschedule.interface';
import { BookingTicketsData } from '../../../shared/interfaces/booking-ticket.interface';
import {
  closeRescheduleDialog,
  confirmReschedule,
  confirmRescheduleFailure,
  confirmRescheduleSuccess,
  invokeLoadMyBookingsApi,
  loadRescheduleTicketsSuccess,
  openRescheduleDialog,
  rescheduleAbandoned,
  rescheduleRequiresPayment,
  rescheduleSettled,
} from './my-bookings.action';
import { initialMyBookingsState } from './my-bookings.model';
import { selectMyBookings } from './my-bookings.selector';

describe('RescheduleEffect', () => {
  let actionsSubject: Subject<Action>;
  let effect: RescheduleEffect;
  let bookingService: jasmine.SpyObj<BookingService>;
  let store: MockStore;

  const ESTIMATE: RescheduleEstimate = {
    oldFare: '100.00',
    newFare: '120.00',
    fareDiff: '20.00',
    rescheduleFee: '30.00',
    netAmount: '50.00',
    paymentDirection: 'TOP_UP',
  };

  const CONFIRM_PAYLOAD = {
    bookingId: 5,
    newScheduleId: 999,
    newFromStopId: 10,
    newToStopId: 20,
    seatAssignments: { 11: '1' },
    clientNetAmount: 50,
  };

  beforeEach(async () => {
    actionsSubject = new Subject<Action>();
    bookingService = jasmine.createSpyObj<BookingService>('BookingService', [
      'getRescheduleEstimate',
      'confirmReschedule',
      'setActiveBookingId',
      'getBookingTickets',
    ]);

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        RescheduleEffect,
        provideMockStore({ initialState: { myBookings: initialMyBookingsState } }),
        { provide: Actions, useValue: new Actions(actionsSubject) },
        { provide: BookingService, useValue: bookingService },
        { provide: StationService, useValue: jasmine.createSpyObj('StationService', ['getAll']) },
        { provide: AlertService, useValue: jasmine.createSpyObj('AlertService', ['success', 'error', 'info']) },
      ],
    }).compileComponents();

    effect = TestBed.inject(RescheduleEffect);
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectMyBookings, initialMyBookingsState);
  });

  afterEach(() => {
    // See the matching comment in my-bookings.component.reschedule-dom.spec.ts —
    // `overrideSelector` pins the shared selector singleton's memoized result
    // and leaks into other spec files in the same Karma bundle unless released.
    store.resetSelectors();
  });

  // OBRS-1056: pins the ARGUMENT at this call site. StationService's own spec
  // proves `{ skipLoadingAlert: true }` sets SKIP_GLOBAL_LOADING_ALERT; only this
  // assertion catches someone dropping it here and bringing back the blocking
  // popup that covered this dialog and swallowed its Escape key. Its sibling
  // `getBookingTickets(bookingId, true)` has always been silent — this is the
  // half of the pair that was not.
  //
  // OBRS-1222 AC4: and it now pins the ABSENCE of `skipErrorAlert` just as hard —
  // see the twin assertion in change-stop.effect.spec.ts for why this lane must
  // keep the global error modal that `ProvinceEffect` gave up.
  it('loadStopsLookup$ loads the stops lookup without the global loading popup, but KEEPS the error alert', () => {
    const stationService = TestBed.inject(StationService) as jasmine.SpyObj<StationService>;
    stationService.getAll.and.returnValue(of({ code: 200, message: 'OK', data: [] } as ResponseAPI<StationApi[]>));

    effect.loadStopsLookup$.subscribe();

    actionsSubject.next(openRescheduleDialog({ bookingId: 5 }));

    expect(stationService.getAll).toHaveBeenCalledWith({ skipLoadingAlert: true });
    const options = stationService.getAll.calls.mostRecent().args[0] ?? {};
    expect(options.skipErrorAlert).toBeUndefined();
  });

  describe('loadRescheduleTickets$ (OBRS-483: OPEN-seating no longer silently no-ops)', () => {
    it('includes a CONFIRMED ticket with a null seatNumber (OPEN seating) instead of dropping it', () => {
      // Before OBRS-483, `.filter((ticket) => !!ticket.seatNumber)` dropped
      // EVERY ticket on an OPEN-seating schedule (seatNumber is null by
      // backend invariant, OBRS-321) — reschedule looked like it did
      // nothing at all: no request, no error, `tickets.length === 0`
      // forever.
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
      effect.loadRescheduleTickets$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openRescheduleDialog({ bookingId: 4 }));

      expect(emitted).toEqual([
        loadRescheduleTicketsSuccess({ tickets: [{ ticketId: 31, seatNumber: null }] }),
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
      effect.loadRescheduleTickets$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openRescheduleDialog({ bookingId: 4 }));

      expect(emitted).toEqual([
        loadRescheduleTicketsSuccess({ tickets: [{ ticketId: 15, seatNumber: '4' }] }),
      ]);
    });

    it('still includes a normal ASSIGNED-mode confirmed ticket with its real seatNumber (byte-identical to pre-483 behavior)', () => {
      bookingService.getBookingTickets.and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: {
            bookingId: 9,
            bookingNumber: 'B-9',
            journeys: [
              {
                tickets: [
                  { id: 40, ticketNumber: 'T-40', seatNumber: '12', status: { code: 'confirmed', label: 'Confirmed' } },
                ],
              },
            ],
          },
        } as ResponseAPI<BookingTicketsData>)
      );

      const emitted: Action[] = [];
      effect.loadRescheduleTickets$.subscribe((a) => emitted.push(a));

      actionsSubject.next(openRescheduleDialog({ bookingId: 9 }));

      expect(emitted).toEqual([
        loadRescheduleTicketsSuccess({ tickets: [{ ticketId: 40, seatNumber: '12' }] }),
      ]);
    });
  });

  describe('confirmReschedule$', () => {
    it('re-fetches the estimate and sends clientNetAmount equal to the FRESH netAmount to confirmReschedule (never the stale client value)', () => {
      bookingService.getRescheduleEstimate.and.returnValue(
        of({ code: 200, message: 'OK', data: ESTIMATE } as ResponseAPI<RescheduleEstimate>)
      );
      const result: RescheduleResult = { bookingId: 5, bookingNumber: 'B-5', status: 'CONFIRMED' };
      bookingService.confirmReschedule.and.returnValue(
        of({ code: 200, message: 'OK', data: result } as ResponseAPI<RescheduleResult>)
      );

      const emitted: Action[] = [];
      effect.confirmReschedule$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmReschedule(CONFIRM_PAYLOAD));

      expect(bookingService.getRescheduleEstimate).toHaveBeenCalledWith(5, {
        newScheduleId: 999,
        newFromStopId: 10,
        newToStopId: 20,
        seats: ['1'],
      });
      expect(bookingService.confirmReschedule).toHaveBeenCalledWith(
        5,
        jasmine.objectContaining({ clientNetAmount: 50 })
      );
      expect(emitted).toEqual([confirmRescheduleSuccess({ result })]);
    });

    it('OBRS-483: maps a null seatNumber (OPEN seating) to an empty-string placeholder for the seats query param, and preserves the null in seatAssignments to confirmReschedule', () => {
      bookingService.getRescheduleEstimate.and.returnValue(
        of({ code: 200, message: 'OK', data: ESTIMATE } as ResponseAPI<RescheduleEstimate>)
      );
      const result: RescheduleResult = { bookingId: 5, bookingNumber: 'B-5', status: 'CONFIRMED' };
      bookingService.confirmReschedule.and.returnValue(
        of({ code: 200, message: 'OK', data: result } as ResponseAPI<RescheduleResult>)
      );

      effect.confirmReschedule$.subscribe();

      actionsSubject.next(
        confirmReschedule({ ...CONFIRM_PAYLOAD, seatAssignments: { 11: null } })
      );

      expect(bookingService.getRescheduleEstimate).toHaveBeenCalledWith(5, {
        newScheduleId: 999,
        newFromStopId: 10,
        newToStopId: 20,
        seats: [''],
      });
      expect(bookingService.confirmReschedule).toHaveBeenCalledWith(
        5,
        jasmine.objectContaining({ seatAssignments: { 11: null } })
      );
    });

    it('refuses to submit and emits a client-side PRICE_CHANGED failure when the re-fetched netAmount differs from what was submitted', () => {
      bookingService.getRescheduleEstimate.and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: { ...ESTIMATE, netAmount: '999.00' },
        } as ResponseAPI<RescheduleEstimate>)
      );

      const emitted: Action[] = [];
      effect.confirmReschedule$.subscribe((a) => emitted.push(a));

      actionsSubject.next(confirmReschedule(CONFIRM_PAYLOAD));

      expect(bookingService.confirmReschedule).not.toHaveBeenCalled();
      expect(emitted.length).toBe(1);
      expect((emitted[0] as ReturnType<typeof confirmRescheduleFailure>).errorCode).toBe(
        'RESCHEDULE_PRICE_CHANGED'
      );
    });
  });

  describe('CONFIRMED vs PENDING_PAYMENT branching', () => {
    it('CONFIRMED settles the dialog (rescheduleSettled)', () => {
      const emitted: Action[] = [];
      effect.confirmRescheduleConfirmed$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        confirmRescheduleSuccess({ result: { bookingId: 5, bookingNumber: 'B-5', status: 'CONFIRMED' } })
      );

      expect(emitted).toEqual([rescheduleSettled()]);
    });

    it('PENDING_PAYMENT hands off to the embedded payment step (rescheduleRequiresPayment) and marks the active booking id', () => {
      const emitted: Action[] = [];
      effect.confirmReschedulePending$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        confirmRescheduleSuccess({
          result: { bookingId: 5, bookingNumber: 'B-5', status: 'PENDING_PAYMENT', paymentIntentId: 42 },
        })
      );

      // OBRS-1204: the booking NUMBER travels with the id, so the QR card the
      // top-up payment renders can print a reference the customer can quote.
      expect(bookingService.setActiveBookingId).toHaveBeenCalledWith(5, 'B-5');
      expect(emitted).toEqual([rescheduleRequiresPayment({ bookingId: 5, paymentIntentId: 42 })]);
    });

    it('CONFIRMED does NOT also trigger the pending-payment handoff', () => {
      const emitted: Action[] = [];
      effect.confirmReschedulePending$.subscribe((a) => emitted.push(a));

      actionsSubject.next(
        confirmRescheduleSuccess({ result: { bookingId: 5, bookingNumber: 'B-5', status: 'CONFIRMED' } })
      );

      expect(emitted).toEqual([]);
    });
  });

  /**
   * Scrutinize finding 3 — the 6-site preserveWindow sweep (OBRS-577 Decision
   * A) listed `reschedule.effect.ts:276,288` as changed, but this file never
   * pinned the reload PAYLOAD, only that `rescheduleSettled`/`abandoned` map
   * to `rescheduleSettled()`/pending-payment actions above — a regression
   * dropping `preserveWindow` from these 2 of the 6 sites would ship
   * silently. `change-seat.effect.spec.ts`/`change-stop.effect.spec.ts`
   * already pin the other 4; this closes the same gap here.
   */
  describe('rescheduleSettled$ / rescheduleAbandoned$ (OBRS-577 Decision A: preserveWindow)', () => {
    it('rescheduleSettled$ toasts success, closes the dialog, and reloads with preserveWindow:true so a multi-page list does not snap back to page 1', () => {
      store.overrideSelector(selectMyBookings, { ...initialMyBookingsState, statusFilter: 'confirmed' });
      store.refreshState();

      const emitted: Action[] = [];
      effect.rescheduleSettled$.subscribe((a) => emitted.push(a));

      actionsSubject.next(rescheduleSettled());

      expect(emitted).toEqual([
        closeRescheduleDialog(),
        invokeLoadMyBookingsApi({ status: 'confirmed', preserveWindow: true }),
      ]);
    });

    it('rescheduleAbandoned$ toasts an info notice, closes the dialog, and reloads with preserveWindow:true', () => {
      store.overrideSelector(selectMyBookings, { ...initialMyBookingsState, statusFilter: null });
      store.refreshState();

      const emitted: Action[] = [];
      effect.rescheduleAbandoned$.subscribe((a) => emitted.push(a));

      actionsSubject.next(rescheduleAbandoned());

      expect(emitted).toEqual([
        closeRescheduleDialog(),
        invokeLoadMyBookingsApi({ status: null, preserveWindow: true }),
      ]);
    });
  });
});
