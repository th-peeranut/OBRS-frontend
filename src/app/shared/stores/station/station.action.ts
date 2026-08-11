import { createAction, props } from '@ngrx/store';
import { StationApi } from '../../interfaces/station.interface';

export const invokeGetAllProvinceWithStationApi = createAction(
  '[Province With Station API] Invoke Province With Station Fetch API'
);

export const invokeGetAllProvinceWithStationApiSuccess = createAction(
  '[Province With Station API] Fetch API Success',
  props<{ stations: StationApi[] }>()
);

/**
 * OBRS-1222. Carries no payload on purpose: the only question a consumer asks
 * is "is the station roster unavailable AND empty right now", and the emptiness
 * half already lives in `provinceWithStationList`. Putting a backend error
 * string here would invite a second, contradictory rendering of the same
 * failure — the one surface is `app-station-load-error`, which is translated.
 */
export const invokeGetAllProvinceWithStationApiFailure = createAction(
  '[Province With Station API] Fetch API Failure'
);
