import { FormBuilder } from '@angular/forms';
import { of, throwError } from 'rxjs';

import { HomeBookingComponent } from './home-booking.component';
import {
  createAuthServiceStub,
  createBookingServiceStub,
  createRouterStub,
  createStoreStub,
} from '../../../../testing/test-stubs';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import { RECENT_ROUTES_CACHE_KEY, saveRecentRoute } from '../../../../shared/lib/recent-routes';

function station(id: number): StationApi {
  return {
    id,
    slug: `station-${id}`,
    status: 'active',
    stopType: 'station',
    createdAt: '',
    updatedAt: '',
  };
}

/** A Store stub whose `pipe()`/`select()` both resolve synchronously to
 *  `value` — matches `createStoreStub()`'s shape but lets a test control what
 *  the station-list selector (and, incidentally, `selectScheduleList` in
 *  `onSearch()`) emits. */
function createStoreStubWithValue(value: unknown): any {
  return {
    pipe: () => of(value),
    select: () => of(value),
    dispatch: () => {},
  };
}

const STATION_1 = station(1);
const STATION_2 = station(2);
const STATION_3 = station(3);

describe('HomeBookingComponent', () => {
  let component: HomeBookingComponent;

  afterEach(() => {
    localStorage.removeItem(RECENT_ROUTES_CACHE_KEY);
  });

  describe('smoke', () => {
    beforeEach(() => {
      component = new HomeBookingComponent(
        new FormBuilder(),
        createRouterStub(),
        createStoreStub(),
        createStoreStub(),
        createAuthServiceStub(false),
        createBookingServiceStub()
      );
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('defaults the passenger selection to 1 adult and 0 kids', () => {
      expect(component.bookingForm.get('passengerInfo')?.value).toEqual([
        { type: 'ADULT', count: 1 },
        { type: 'KIDS', count: 0 },
      ]);
    });
  });

  describe('recent-route quick pick (OBRS-575)', () => {
    it('anonymous visitor: derives candidates from localStorage, never calls getMyBookings', () => {
      saveRecentRoute(1, 2);
      const bookingServiceStub = createBookingServiceStub();
      spyOn(bookingServiceStub, 'getMyBookings').and.callThrough();

      component = new HomeBookingComponent(
        new FormBuilder(),
        createRouterStub(),
        createStoreStubWithValue([STATION_1, STATION_2]),
        createStoreStub(),
        createAuthServiceStub(false),
        bookingServiceStub
      );
      component.ngOnInit();

      expect(bookingServiceStub.getMyBookings).not.toHaveBeenCalled();
      expect(component.recentRouteCandidates.length).toBe(1);
      expect(component.recentRouteCandidates[0].originStation.id).toBe(1);
      expect(component.recentRouteCandidates[0].destinationStation.id).toBe(2);
    });

    it('logged-in user: calls getMyBookings with skipAuthLogout=true (AC#8 — must not force-logout on a background fetch)', () => {
      const bookingServiceStub = createBookingServiceStub();
      spyOn(bookingServiceStub, 'getMyBookings').and.callThrough();

      component = new HomeBookingComponent(
        new FormBuilder(),
        createRouterStub(),
        createStoreStubWithValue([STATION_1, STATION_2]),
        createStoreStub(),
        createAuthServiceStub(true),
        bookingServiceStub
      );
      component.ngOnInit();

      expect(bookingServiceStub.getMyBookings).toHaveBeenCalledWith(undefined, false, true);
    });

    it('logged-in user: derives candidates from bookingSchedules[0].fromStop/toStop.id', () => {
      const bookingServiceStub = createBookingServiceStub();
      bookingServiceStub.getMyBookings = () =>
        of({
          data: {
            content: [
              {
                id: 1,
                createdAt: '2026-06-01T00:00:00',
                bookingSchedules: [{ fromStop: { id: 1 }, toStop: { id: 2 } }],
              },
            ],
          },
        });

      component = new HomeBookingComponent(
        new FormBuilder(),
        createRouterStub(),
        createStoreStubWithValue([STATION_1, STATION_2]),
        createStoreStub(),
        createAuthServiceStub(true),
        bookingServiceStub
      );
      component.ngOnInit();

      expect(component.recentRouteCandidates.length).toBe(1);
      expect(component.recentRouteCandidates[0].originStation.id).toBe(1);
    });

    it('AC#8: a failing getMyBookings degrades to zero candidates without throwing (no AlertService call)', () => {
      const bookingServiceStub = createBookingServiceStub();
      bookingServiceStub.getMyBookings = () => throwError(() => new Error('500'));

      expect(() => {
        component = new HomeBookingComponent(
          new FormBuilder(),
          createRouterStub(),
          createStoreStubWithValue([STATION_1, STATION_2]),
          createStoreStub(),
          createAuthServiceStub(true),
          bookingServiceStub
        );
        component.ngOnInit();
      }).not.toThrow();

      expect(component.recentRouteCandidates).toEqual([]);
    });

    it('AC#6: drops a route whose station is missing from the current active roster', () => {
      saveRecentRoute(1, 99); // 99 never resolves against the seeded station list

      component = new HomeBookingComponent(
        new FormBuilder(),
        createRouterStub(),
        createStoreStubWithValue([STATION_1, STATION_2]),
        createStoreStub(),
        createAuthServiceStub(false),
        createBookingServiceStub()
      );
      component.ngOnInit();

      expect(component.recentRouteCandidates).toEqual([]);
    });

    it('clicking a route patches both form controls and runs the existing syncStationOptions behavior', () => {
      component = new HomeBookingComponent(
        new FormBuilder(),
        createRouterStub(),
        createStoreStubWithValue([STATION_1, STATION_2, STATION_3]),
        createStoreStub(),
        createAuthServiceStub(false),
        createBookingServiceStub()
      );
      component.ngOnInit();

      component.onRecentRouteSelected({ originStation: STATION_1, destinationStation: STATION_2 });

      expect(component.getFormValue('startStationId')).toBe(1);
      expect(component.getFormValue('stopStationId')).toBe(2);
      // syncStationOptions() ran: the chosen destination is excluded from the
      // origin picker's own options and vice versa.
      expect(component.startProvinceStationList.some((s) => s.id === 2)).toBeFalse();
      expect(component.endProvinceStationList.some((s) => s.id === 1)).toBeFalse();
    });

    it('onSearch(): writes the searched route to localStorage only when both stations resolve', () => {
      component = new HomeBookingComponent(
        new FormBuilder(),
        createRouterStub(),
        createStoreStubWithValue([STATION_1, STATION_2]),
        createStoreStub(),
        createAuthServiceStub(false),
        createBookingServiceStub()
      );
      component.ngOnInit();
      component.bookingForm.patchValue({ startStationId: 1, stopStationId: 2 });

      component.onSearch();

      const stored = JSON.parse(localStorage.getItem(RECENT_ROUTES_CACHE_KEY) as string);
      expect(stored.routes[0]).toEqual(
        jasmine.objectContaining({ originId: 1, destinationId: 2 })
      );
    });

    it('onSearch(): does NOT write when the form is empty/unresolved (no validation gate exists on this call)', () => {
      component = new HomeBookingComponent(
        new FormBuilder(),
        createRouterStub(),
        createStoreStubWithValue([STATION_1, STATION_2]),
        createStoreStub(),
        createAuthServiceStub(false),
        createBookingServiceStub()
      );
      component.ngOnInit();
      // startStationId/stopStationId default to '' per createForm().

      component.onSearch();

      expect(localStorage.getItem(RECENT_ROUTES_CACHE_KEY)).toBeNull();
    });
  });
});
