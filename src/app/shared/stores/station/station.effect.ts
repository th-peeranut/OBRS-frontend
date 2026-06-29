import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import { EMPTY, Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import {
  invokeGetAllProvinceWithStationApi,
  invokeGetAllProvinceWithStationApiSuccess,
} from './station.action';
import { StationService } from '../../../services/station/station.service';
import { StationApi } from '../../interfaces/station.interface';
import { ResponseAPI } from '../../interfaces/response.interface';
import { STATION_CACHE_KEY } from './station.reducer';

/**
 * Tracks whether a background revalidation has already completed during the
 * current browser session.
 *
 * This is intentionally MODULE-SCOPED, not an instance field: `ProvinceEffect`
 * is registered via `EffectsModule.forFeature` in several lazy feature modules
 * (home, schedule-booking, review-schedule-booking, passenger-info, payment,
 * staff). Each lazy module owns its own injector, so NgRx instantiates a
 * SEPARATE `ProvinceEffect` per module. A per-instance flag would therefore
 * reset every time a new booking module is first entered, causing a redundant
 * revalidation per module. Sharing the flag at module scope guarantees exactly
 * one revalidation per browser session across all instances.
 *
 * It resets to false on every hard refresh (module re-evaluation), which is
 * what makes the first `invokeGetAllProvinceWithStationApi` fire a network
 * request even when the store was pre-populated from the localStorage cache.
 */
let sessionRevalidated = false;

/** Test-only: resets the module-scoped session guard between specs. */
export function resetStationSessionRevalidated(): void {
  sessionRevalidated = false;
}

@Injectable()
export class ProvinceEffect {
  /**
   * Declared without an initialiser so the assignment can live in the
   * constructor body — this guarantees the constructor-injected `actions$`
   * is available when `createEffect` eagerly calls the factory.
   */
  readonly loadStations$: Observable<Action>;

  constructor(
    private actions$: Actions,
    private service: StationService
  ) {
    this.loadStations$ = createEffect(() =>
      this.actions$.pipe(
        ofType(invokeGetAllProvinceWithStationApi),
        mergeMap(() => {
          if (sessionRevalidated) return EMPTY;

          return this.service.getAll().pipe(
            map((response) => this.extractStations(response)),
            tap((stations) => this.persistToCache(stations)),
            map((stations) => invokeGetAllProvinceWithStationApiSuccess({ stations }))
          );
        })
      )
    );
  }

  private persistToCache(stations: StationApi[]): void {
    sessionRevalidated = true;
    try {
      localStorage.setItem(
        STATION_CACHE_KEY,
        JSON.stringify({
          version: 'v1',
          fetchedAt: new Date().toISOString(),
          stations,
        })
      );
    } catch {
      // localStorage write failure (e.g., storage full in private mode) — ignored.
    }
  }

  private extractStations(
    response: ResponseAPI<StationApi[]> | null | undefined
  ): StationApi[] {
    if (response && Array.isArray(response.data)) return response.data;
    return [];
  }
}
