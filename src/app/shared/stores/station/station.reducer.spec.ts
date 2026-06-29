import { invokeGetAllProvinceWithStationApiSuccess } from './station.action';
import {
  loadFromLocalStorage,
  ProvinceReducer,
  STATION_CACHE_KEY,
} from './station.reducer';
import { StationApi } from '../../interfaces/station.interface';

const MOCK_STATION: StationApi = {
  id: 1,
  slug: 'bangkok',
  status: 'active',
  stopType: 'station',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

function writeCache(overrides: Partial<{ version: string; stations: unknown; fetchedAt: string }>): void {
  localStorage.setItem(
    STATION_CACHE_KEY,
    JSON.stringify({
      version: 'v1',
      fetchedAt: '2024-01-01T00:00:00Z',
      stations: [MOCK_STATION],
      ...overrides,
    })
  );
}

describe('loadFromLocalStorage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('returns an empty array when localStorage has no cached entry', () => {
    expect(loadFromLocalStorage()).toEqual([]);
  });

  it('hydrates stations from a valid v1 localStorage entry', () => {
    writeCache({});
    const result = loadFromLocalStorage();
    expect(result).toEqual([MOCK_STATION]);
  });

  it('returns [] and removes the cache key when the stored JSON is corrupt', () => {
    localStorage.setItem(STATION_CACHE_KEY, 'not-valid-json{{{');
    expect(loadFromLocalStorage()).toEqual([]);
    expect(localStorage.getItem(STATION_CACHE_KEY)).toBeNull();
  });

  it('returns [] and removes the cache key on a version mismatch', () => {
    writeCache({ version: 'v0' });
    expect(loadFromLocalStorage()).toEqual([]);
    expect(localStorage.getItem(STATION_CACHE_KEY)).toBeNull();
  });

  it('returns [] and removes the cache key when the stored stations field is not an array', () => {
    writeCache({ stations: null });
    expect(loadFromLocalStorage()).toEqual([]);
    expect(localStorage.getItem(STATION_CACHE_KEY)).toBeNull();
  });

  it('returns [] and removes the cache key when stations is an object instead of array', () => {
    writeCache({ stations: { id: 1 } });
    expect(loadFromLocalStorage()).toEqual([]);
    expect(localStorage.getItem(STATION_CACHE_KEY)).toBeNull();
  });
});

describe('ProvinceReducer', () => {
  it('replaces state with stations from the success action', () => {
    const stations: StationApi[] = [MOCK_STATION];
    const nextState = ProvinceReducer(
      [] as StationApi[],
      invokeGetAllProvinceWithStationApiSuccess({ stations })
    );
    expect(nextState).toEqual(stations);
  });

  it('replaces existing state with the new stations list', () => {
    const oldStation: StationApi = { ...MOCK_STATION, id: 99, slug: 'old' };
    const newStation: StationApi = { ...MOCK_STATION, id: 1, slug: 'new' };
    const nextState = ProvinceReducer(
      [oldStation],
      invokeGetAllProvinceWithStationApiSuccess({ stations: [newStation] })
    );
    expect(nextState).toEqual([newStation]);
  });
});
