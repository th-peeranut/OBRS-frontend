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
import { RescheduleEstimate, RescheduleResult } from '../../../shared/interfaces/reschedule.interface';
import {
  confirmReschedule,
  confirmRescheduleFailure,
  confirmRescheduleSuccess,
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

      expect(bookingService.setActiveBookingId).toHaveBeenCalledWith(5);
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
});
