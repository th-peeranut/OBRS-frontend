import { createReducer, on } from '@ngrx/store';
import { StationApi } from '../../interfaces/station.interface';
import { invokeGetAllProvinceWithStationApiSuccess } from './station.action';

export const STATION_CACHE_KEY = 'obrs.stations.v1';
const STATION_CACHE_VERSION = 'v1';

interface StationCache {
  version: string;
  fetchedAt: string;
  stations: StationApi[];
}

/**
 * Reads the station list from localStorage.
 * Exported for unit testing.
 * Returns an empty array on any parse error or version mismatch, and clears the stale key.
 */
export function loadFromLocalStorage(): ReadonlyArray<StationApi> {
  try {
    const raw = localStorage.getItem(STATION_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StationCache;
    if (parsed.version !== STATION_CACHE_VERSION || !Array.isArray(parsed.stations)) {
      localStorage.removeItem(STATION_CACHE_KEY);
      return [];
    }
    return parsed.stations;
  } catch {
    try {
      localStorage.removeItem(STATION_CACHE_KEY);
    } catch {
      // Secondary localStorage failure (e.g., private mode quota) — ignore.
    }
    return [];
  }
}

export const initialState: ReadonlyArray<StationApi> = loadFromLocalStorage();

export const ProvinceReducer = createReducer(
  initialState,
  on(invokeGetAllProvinceWithStationApiSuccess, (_state, { stations }) => stations)
);
