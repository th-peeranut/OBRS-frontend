import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Actions } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';

import { ScheduleBookingEffect } from './schedule-booking.effect';
import {
  invokeSetScheduleBookingApi,
  revalidateRestoredScheduleBooking,
} from './schedule-booking.action';
import { invokeSetScheduleListApi } from '../schedule-list/schedule-list.action';
import { ScheduleService } from '../../../services/schedule/schedule.service';
import { AlertService } from '../../services/alert.service';
import { ResponseAPI } from '../../interfaces/response.interface';
import {
  Schedule,
  ScheduleFilterPayload,
  ScheduleList,
} from '../../interfaces/schedule.interface';
import {
  clearBookingContext,
  isBookingSelectionRestored,
  readBookingContext,
  rememberBookingSearchPayload,
  rememberBookingSelection,
  resetBookingContextRestoreFlag,
  restoreBookingSelection,
} from '../../lib/booking-context-storage';

const CHOSEN: Schedule = {
  id: 42,
  vehicleType: 'van',
  departureDateTime: '2026-08-01T08:00:00+07:00',
  arrivalDateTime: '2026-08-01T11:00:00+07:00',
  pricePerSeat: '250',
  availableSeats: 9,
  // The stale half: this snapshot is what draws the seat map on
  // /passenger-info, so a restored copy must never reach it unchecked.
  availableSeatNumbers: ['1', '2', '3'],
};

const PAYLOAD: ScheduleFilterPayload = {
  bookingType: 'one_way',
  numberOfPassengers: 2,
  fromStop: 'bangkok',
  toStop: 'phuket',
  departureDate: '2026-08-01',
};

function searchResponse(departureSchedules: Schedule[]): ResponseAPI<ScheduleList> {
  return {
    code: 200,
    message: 'OK',
    data: { departureSchedules, arrivalSchedules: null },
  };
}

/** Puts the world in the state a NEW TAB wakes up in: the context is in
 *  storage, and the reducer has just seeded itself from it. */
function simulateRestoredTab(): void {
  rememberBookingSearchPayload(PAYLOAD);
  rememberBookingSelection([CHOSEN]);
  resetBookingContextRestoreFlag();
  restoreBookingSelection();
}

describe('ScheduleBookingEffect — restored booking context (OBRS-903)', () => {
  let actionsSubject: Subject<Action>;
  let effect: ScheduleBookingEffect;
  let scheduleService: jasmine.SpyObj<ScheduleService>;
  let alertService: jasmine.SpyObj<AlertService>;
  let router: jasmine.SpyObj<Router>;
  let store: MockStore;

  beforeEach(async () => {
    localStorage.clear();
    resetBookingContextRestoreFlag();

    actionsSubject = new Subject<Action>();
    scheduleService = jasmine.createSpyObj<ScheduleService>('ScheduleService', [
      'getByFilter',
      'getSeatMap',
    ]);
    alertService = jasmine.createSpyObj<AlertService>('AlertService', [
      'success',
      'error',
      'warning',
      'info',
    ]);
    // `warning` returns SweetAlert2's dismissal promise, and the effect chains
    // the navigation onto it — a spy returning undefined would throw on `.then`.
    alertService.warning.and.returnValue(Promise.resolve({} as never));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        ScheduleBookingEffect,
        provideMockStore({ initialState: { scheduleBooking: null } }),
        { provide: Actions, useValue: new Actions(actionsSubject) },
        { provide: ScheduleService, useValue: scheduleService },
        { provide: AlertService, useValue: alertService },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    effect = TestBed.inject(ScheduleBookingEffect);
    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    store.resetSelectors();
    actionsSubject.complete();
    localStorage.clear();
    clearBookingContext();
  });

  describe('persistence — the write side', () => {
    it('every pick is mirrored to the cross-tab context', () => {
      const emitted: Action[] = [];
      effect.setScheduleBooking$.subscribe((action) => emitted.push(action));

      actionsSubject.next(
        invokeSetScheduleBookingApi({ schedule_booking: { schedule: [CHOSEN] } })
      );

      expect(readBookingContext()?.selection).toEqual([CHOSEN]);
      expect(emitted.length).toBe(1);
    });

    it('a deselect removes the stored selection — nothing resurrects it later', () => {
      effect.setScheduleBooking$.subscribe();

      actionsSubject.next(
        invokeSetScheduleBookingApi({ schedule_booking: { schedule: [CHOSEN] } })
      );
      actionsSubject.next(
        invokeSetScheduleBookingApi({ schedule_booking: { schedule: null } })
      );

      expect(readBookingContext()?.selection ?? null).toBeNull();
    });
  });

  describe('re-validation of a RESTORED selection (AC3)', () => {
    it('replaces the restored rows with FRESH ones when the trip is still bookable', () => {
      simulateRestoredTab();
      const fresh: Schedule = {
        ...CHOSEN,
        availableSeats: 4,
        availableSeatNumbers: ['7', '8'], // three of the restored seats are gone
      };
      scheduleService.getByFilter.and.returnValue(of(searchResponse([fresh])));

      const emitted: Action[] = [];
      effect.revalidateRestoredScheduleBooking$.subscribe((a) => emitted.push(a));
      actionsSubject.next(revalidateRestoredScheduleBooking());

      expect(scheduleService.getByFilter).toHaveBeenCalledWith(PAYLOAD);
      // OBRS-1343: the RESULT is restored alongside the selection. It carries
      // `returnBoardingStop`, which lives nowhere else — a tab that woke up here
      // would otherwise name the outbound drop-off on the review page and post
      // it as the return leg's boarding stop, which has no fare and 404s at
      // payment for the four Bangkok cross pairs.
      expect(emitted).toEqual([
        invokeSetScheduleListApi({ schedule_list: searchResponse([fresh]).data! }),
        invokeSetScheduleBookingApi({ schedule_booking: { schedule: [fresh] } }),
      ]);
      expect(alertService.warning).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('sends the customer back to pick again when the trip is GONE from the results', async () => {
      simulateRestoredTab();
      scheduleService.getByFilter.and.returnValue(of(searchResponse([])));

      const emitted: Action[] = [];
      effect.revalidateRestoredScheduleBooking$.subscribe((a) => emitted.push(a));
      actionsSubject.next(revalidateRestoredScheduleBooking());

      expect(alertService.warning).toHaveBeenCalled();
      // Dropped immediately — nothing may be built on an unsellable selection.
      expect(emitted).toEqual([
        invokeSetScheduleBookingApi({ schedule_booking: { schedule: null } }),
      ]);

      await alertService.warning.calls.mostRecent().returnValue;
      expect(router.navigate).toHaveBeenCalledWith(['/schedule-booking']);
    });

    it('must-NOT: navigate before the message has been dismissed', async () => {
      // Measured in the browser: navigating first re-runs the search on the
      // trip list, `error.interceptor.ts` opens its loading dialog for that
      // request, and SweetAlert2's single global instance means the spinner
      // REPLACES this warning — it was on screen for ~200 ms with no
      // `.swal2-container` left afterwards. The customer was moved with no idea
      // why. So the navigation hangs off the dialog's own promise.
      simulateRestoredTab();
      scheduleService.getByFilter.and.returnValue(of(searchResponse([])));

      effect.revalidateRestoredScheduleBooking$.subscribe();
      actionsSubject.next(revalidateRestoredScheduleBooking());

      expect(router.navigate).not.toHaveBeenCalled();

      await alertService.warning.calls.mostRecent().returnValue;
      expect(router.navigate).toHaveBeenCalledTimes(1);
    });

    it('sends them back when the trip survives but no longer seats the whole party', async () => {
      // The case the card names: seats sold while the customer was in their
      // inbox. Failing here is the point — failing at payment is the defect.
      simulateRestoredTab();
      scheduleService.getByFilter.and.returnValue(
        of(searchResponse([{ ...CHOSEN, availableSeats: 1 }]))
      );

      effect.revalidateRestoredScheduleBooking$.subscribe();
      actionsSubject.next(revalidateRestoredScheduleBooking());

      expect(alertService.warning).toHaveBeenCalled();
      await alertService.warning.calls.mostRecent().returnValue;
      expect(router.navigate).toHaveBeenCalledWith(['/schedule-booking']);
    });

    it('accepts a trip with exactly enough seats left — the boundary is not off by one', () => {
      simulateRestoredTab();
      const exact: Schedule = { ...CHOSEN, availableSeats: 2 };
      scheduleService.getByFilter.and.returnValue(of(searchResponse([exact])));

      const emitted: Action[] = [];
      effect.revalidateRestoredScheduleBooking$.subscribe((a) => emitted.push(a));
      actionsSubject.next(revalidateRestoredScheduleBooking());

      expect(router.navigate).not.toHaveBeenCalled();
      expect(emitted).toEqual([
        invokeSetScheduleListApi({ schedule_list: searchResponse([exact]).data! }),
        invokeSetScheduleBookingApi({ schedule_booking: { schedule: [exact] } }),
      ]);
    });

    it('must-NOT: a selection made in THIS tab is not re-validated — no request, no interruption', () => {
      rememberBookingSearchPayload(PAYLOAD);
      rememberBookingSelection([CHOSEN]); // chosen here, not restored
      expect(isBookingSelectionRestored()).toBeFalse();

      const emitted: Action[] = [];
      effect.revalidateRestoredScheduleBooking$.subscribe((a) => emitted.push(a));
      actionsSubject.next(revalidateRestoredScheduleBooking());

      expect(scheduleService.getByFilter).not.toHaveBeenCalled();
      expect(emitted).toEqual([]);
    });

    it('must-NOT: a network failure does not throw the selection away', () => {
      // Fail open. The alternative punishes a blip by deleting work the customer
      // did, and the backend still refuses a taken seat at booking time.
      simulateRestoredTab();
      scheduleService.getByFilter.and.returnValue(
        throwError(() => new Error('offline'))
      );

      const emitted: Action[] = [];
      effect.revalidateRestoredScheduleBooking$.subscribe((a) => emitted.push(a));
      actionsSubject.next(revalidateRestoredScheduleBooking());

      expect(emitted).toEqual([]);
      expect(router.navigate).not.toHaveBeenCalled();
      expect(readBookingContext()?.selection).toEqual([CHOSEN]);
    });

    it('must-NOT: a second effect instance does not send the search again', () => {
      // This effect is registered by five lazy modules, so NgRx builds one
      // instance per module injector — and the two pages that dispatch the
      // action are entered back to back. Reading the restore flag instead of
      // consuming it made every loaded instance fire its own search.
      simulateRestoredTab();
      scheduleService.getByFilter.and.returnValue(of(searchResponse([CHOSEN])));

      const second = TestBed.runInInjectionContext(
        () => new ScheduleBookingEffect()
      );
      effect.revalidateRestoredScheduleBooking$.subscribe();
      second.revalidateRestoredScheduleBooking$.subscribe();

      actionsSubject.next(revalidateRestoredScheduleBooking());

      expect(scheduleService.getByFilter).toHaveBeenCalledTimes(1);
    });

    it('must-NOT: an entry with no stored search body is left alone rather than guessed at', () => {
      rememberBookingSelection([CHOSEN]); // no searchPayload — a pre-903 entry
      resetBookingContextRestoreFlag();
      restoreBookingSelection();

      const emitted: Action[] = [];
      effect.revalidateRestoredScheduleBooking$.subscribe((a) => emitted.push(a));
      actionsSubject.next(revalidateRestoredScheduleBooking());

      expect(scheduleService.getByFilter).not.toHaveBeenCalled();
      expect(emitted).toEqual([]);
    });
  });
});
