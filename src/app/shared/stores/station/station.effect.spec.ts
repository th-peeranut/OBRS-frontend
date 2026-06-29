import { of, Subject } from 'rxjs';
import { Action } from '@ngrx/store';
import { Actions } from '@ngrx/effects';
import { ProvinceEffect, resetStationSessionRevalidated } from './station.effect';
import { StationService } from '../../../services/station/station.service';
import {
  invokeGetAllProvinceWithStationApi,
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
      expect(results.length).toBe(1);
      expect(results[0]).toEqual(
        invokeGetAllProvinceWithStationApiSuccess({ stations: [MOCK_STATION] })
      );
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
