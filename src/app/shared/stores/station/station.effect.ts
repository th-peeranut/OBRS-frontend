import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import { EMPTY, Observable, of } from 'rxjs';
import { catchError, map, mergeMap, tap } from 'rxjs/operators';
import {
  invokeGetAllProvinceWithStationApi,
  invokeGetAllProvinceWithStationApiFailure,
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

          // OBRS-642: `skipLoadingAlert` = no global blocking overlay. This is a
          // page-load lookup on the customer's first screen, and the overlay it used to
          // raise covered the booking form it exists to fill, with no way off it while
          // the request was in flight.
          //
          // OBRS-1222: `skipErrorAlert` too — but ONLY because this effect now ships a
          // replacement. `station.reducer.ts` hydrates the roster from localStorage
          // SYNCHRONOUSLY, so a returning visitor whose `/api/stops` dies still has a
          // fully working booking form from the first paint; a modal over that form
          // interrupts someone for whom nothing is wrong. A first-time visitor has an
          // empty roster and genuinely cannot book — for them the failure surfaces
          // inline, in the form, via `app-station-load-error` reading
          // `selectStationLoadFailed` below. Deleting either half of that pair
          // re-creates a lie: the flag without the surface is silence, the surface
          // without the flag is a modal on top of it.
          return this.service.getAll({ skipLoadingAlert: true, skipErrorAlert: true }).pipe(
            map((response) => this.extractStations(response)),
            tap((stations) => this.persistToCache(stations)),
            map((stations) => invokeGetAllProvinceWithStationApiSuccess({ stations })),
            // Swallowing the error here (rather than rethrowing) is deliberate and is
            // what keeps the retry alive: `sessionRevalidated` is set inside
            // `persistToCache`, i.e. on SUCCESS only, so a failed attempt leaves the
            // guard false and the next `invokeGetAllProvinceWithStationApi` — from the
            // retry button or from entering any other booking module — fetches again.
            catchError(() => of(invokeGetAllProvinceWithStationApiFailure()))
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
