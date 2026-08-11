import { of, Subject, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Action } from '@ngrx/store';
import { Actions } from '@ngrx/effects';
import { ProvinceEffect, resetStationSessionRevalidated } from './station.effect';
import { StationService } from '../../../services/station/station.service';
import {
  invokeGetAllProvinceWithStationApi,
  invokeGetAllProvinceWithStationApiFailure,
  invokeGetAllProvinceWithStationApiSuccess,
} from './station.action';
import { StationApi } from '../../interfaces/station.interface';
import { ResponseAPI } from '../../interfaces/response.interface';
import { STATION_CACHE_KEY } from './station.reducer';

const MOCK_STATION: StationApi = {
  id: 1,
  slug: 'bangkok',
  status: 'active',
  stopType: 'station',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const MOCK_RESPONSE: ResponseAPI<StationApi[]> = {
  code: 200,
  message: 'OK',
  data: [MOCK_STATION],
};

function makeEffect(
  actionsSubject: Subject<Action>
): { effect: ProvinceEffect; service: jasmine.SpyObj<StationService> } {
  const service = jasmine.createSpyObj<StationService>('StationService', ['getAll']);
  service.getAll.and.returnValue(of(MOCK_RESPONSE));
  const effect = new ProvinceEffect(new Actions(actionsSubject), service);
  return { effect, service };
}

describe('ProvinceEffect', () => {
  let actionsSubject: Subject<Action>;

  beforeEach(() => {
    actionsSubject = new Subject<Action>();
    localStorage.clear();
    resetStationSessionRevalidated();
  });

  afterEach(() => {
    localStorage.clear();
    actionsSubject.complete();
  });

  describe('first invoke — revalidation', () => {
    it('(a) dispatches invokeGetAllProvinceWithStationApiSuccess with fetched stations', () => {
      const { effect } = makeEffect(actionsSubject);
      const results: Action[] = [];
      effect.loadStations$.subscribe((a) => results.push(a));

      actionsSubject.next(invokeGetAllProvinceWithStationApi());

      expect(results).toEqual([
        invokeGetAllProvinceWithStationApiSuccess({ stations: [MOCK_STATION] }),
      ]);
    });

    it('(a) writes the versioned cache entry to localStorage after a successful fetch', () => {
      const { effect } = makeEffect(actionsSubject);
      effect.loadStations$.subscribe();

      actionsSubject.next(invokeGetAllProvinceWithStationApi());

      const raw = localStorage.getItem(STATION_CACHE_KEY);
      expect(raw).not.toBeNull();
      const cached = JSON.parse(raw as string) as { version: string; stations: StationApi[]; fetchedAt: string };
      expect(cached.version).toBe('v1');
      expect(cached.stations).toEqual([MOCK_STATION]);
      expect(cached.fetchedAt).toBeTruthy();
    });

    it('(c) revalidates on first invoke even when localStorage already contains cached data', () => {
      // Simulates a hard-refresh: store was hydrated from localStorage, but
      // the session flag starts false so the effect must still fetch once.
      localStorage.setItem(
        STATION_CACHE_KEY,
        JSON.stringify({
          version: 'v1',
          fetchedAt: '2024-01-01T00:00:00Z',
          stations: [{ ...MOCK_STATION, id: 99, slug: 'stale' }],
        })
      );
      const { effect, service } = makeEffect(actionsSubject);
      const results: Action[] = [];
      effect.loadStations$.subscribe((a) => results.push(a));

      actionsSubject.next(invokeGetAllProvinceWithStationApi());

      expect(service.getAll).toHaveBeenCalledTimes(1);
      // OBRS-642: `skipLoadingAlert` = skip the global blocking loading overlay. This
      // is the customer's first screen and the overlay covered the booking form it
      // exists to fill, with no way off it while the request was in flight — measured
      // on prod 2026-08-10 at over a minute.
      //
      // OBRS-1222: `skipErrorAlert` joins it, and the two are a PAIR with the inline
      // surface `app-station-load-error`. Dropping the flag brings back a modal that
      // now has an inline message underneath it; dropping the surface (see that
      // component's spec) makes the failure silent for a first-time visitor whose
      // dropdowns are empty. Asserted on the argument, because either half is a
      // one-line regression nothing else in this suite would notice.
      expect(service.getAll).toHaveBeenCalledWith({
        skipLoadingAlert: true,
        skipErrorAlert: true,
      });
      expect(results.length).toBe(1);
      expect(results[0]).toEqual(
        invokeGetAllProvinceWithStationApiSuccess({ stations: [MOCK_STATION] })
      );
    });
  });

  describe('failed fetch (OBRS-1222)', () => {
    function makeFailingEffect(): {
      effect: ProvinceEffect;
      service: jasmine.SpyObj<StationService>;
    } {
      const service = jasmine.createSpyObj<StationService>('StationService', ['getAll']);
      service.getAll.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Request timed out' }))
      );
      return { effect: new ProvinceEffect(new Actions(actionsSubject), service), service };
    }

    it('dispatches the failure action instead of letting the error escape the effect', () => {
      const { effect } = makeFailingEffect();
      const results: Action[] = [];
      let errored: unknown = null;
      effect.loadStations$.subscribe({
        next: (a) => results.push(a),
        error: (e) => (errored = e),
      });

      actionsSubject.next(invokeGetAllProvinceWithStationApi());

      expect(results).toEqual([invokeGetAllProvinceWithStationApiFailure()]);
      // An effect stream that ERRORS is an effect stream that is dead: NgRx
      // unsubscribes it, so the retry button would dispatch into nothing and the
      // page would need a reload — the exact thing OBRS-642 was opened about.
      expect(errored).toBeNull();
    });

    it('writes NOTHING to the localStorage cache on failure — a stale roster beats an empty one', () => {
      localStorage.setItem(
        STATION_CACHE_KEY,
        JSON.stringify({
          version: 'v1',
          fetchedAt: '2024-01-01T00:00:00Z',
          stations: [MOCK_STATION],
        })
      );
      const { effect } = makeFailingEffect();
      effect.loadStations$.subscribe();

      actionsSubject.next(invokeGetAllProvinceWithStationApi());

      const cached = JSON.parse(localStorage.getItem(STATION_CACHE_KEY) as string);
      expect(cached.stations).toEqual([MOCK_STATION]);
    });

    it('leaves the session guard DOWN so a retry actually refetches (AC3)', () => {
      // The guard is set inside persistToCache, i.e. on success only. If a
      // failure ever set it, the retry button would be a no-op that clears the
      // error message and changes nothing else — worse than no button at all.
      const failing = makeFailingEffect();
      failing.effect.loadStations$.subscribe();
      actionsSubject.next(invokeGetAllProvinceWithStationApi());
      expect(failing.service.getAll).toHaveBeenCalledTimes(1);

      // Subscribed exactly ONCE: the session guard is module-scoped, so a second
      // subscription to the same effect would see the flag the first one just
      // set and return EMPTY — an artefact of the test, not of the code.
      const retry = makeEffect(actionsSubject);
      const results: Action[] = [];
      retry.effect.loadStations$.subscribe((a) => results.push(a));

      actionsSubject.next(invokeGetAllProvinceWithStationApi());

      expect(retry.service.getAll).toHaveBeenCalledTimes(1);
      expect(results).toEqual([
        invokeGetAllProvinceWithStationApiSuccess({ stations: [MOCK_STATION] }),
      ]);
    });
  });

  describe('second invoke within the same session', () => {
    it('(b) does NOT refetch — returns EMPTY and leaves the store unchanged', () => {
      const { effect, service } = makeEffect(actionsSubject);
      const results: Action[] = [];
      effect.loadStations$.subscribe((a) => results.push(a));

      actionsSubject.next(invokeGetAllProvinceWithStationApi()); // first — revalidates
      actionsSubject.next(invokeGetAllProvinceWithStationApi()); // second — must be a no-op

      expect(service.getAll).toHaveBeenCalledTimes(1);
      expect(results.length).toBe(1);
    });

    it('(b) never calls getAll on any further invoke after the session flag is set', () => {
      const { effect, service } = makeEffect(actionsSubject);
      effect.loadStations$.subscribe();

      actionsSubject.next(invokeGetAllProvinceWithStationApi());
      actionsSubject.next(invokeGetAllProvinceWithStationApi());
      actionsSubject.next(invokeGetAllProvinceWithStationApi());

      expect(service.getAll).toHaveBeenCalledTimes(1);
    });

    it('(b) does NOT refetch from a second effect instance — guard is shared across lazy-module instances', () => {
      // ProvinceEffect is registered via forFeature in several lazy modules, so
      // NgRx creates a separate instance per module injector. The session guard
      // must be shared so entering a new booking module does not re-revalidate.
      const first = makeEffect(actionsSubject);
      first.effect.loadStations$.subscribe();
      actionsSubject.next(invokeGetAllProvinceWithStationApi());
      expect(first.service.getAll).toHaveBeenCalledTimes(1);

      const second = makeEffect(actionsSubject);
      second.effect.loadStations$.subscribe();
      actionsSubject.next(invokeGetAllProvinceWithStationApi());

      expect(second.service.getAll).not.toHaveBeenCalled();
    });
  });
});
