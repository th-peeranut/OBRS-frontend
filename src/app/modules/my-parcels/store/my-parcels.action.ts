import { createAction, props } from '@ngrx/store';
import { ParcelMeDto } from '../../../shared/interfaces/parcel.interface';

/**
 * `page`/`size` mirror `my-bookings`' own load action shape. `append: true`
 * is the "load more" case (adds to the existing list) — UX-OBRS-415 §12.4.
 *
 * No `status` filter: `ParcelController#getMyParcels(Pageable)` takes ONLY
 * page/size/sort on the backend, and the UX spec's filter-pill row never
 * defined any status beyond "All" — a param/filter that goes nowhere was
 * removed rather than shipped (Scrutinize finding, 2026-07-16).
 */
export const invokeLoadMyParcelsApi = createAction(
  '[MyParcels API] Invoke to load my parcels',
  props<{ page: number; append: boolean }>()
);

export const invokeLoadMyParcelsApiSuccess = createAction(
  '[MyParcels API] Load my parcels success',
  props<{ items: ParcelMeDto[]; page: number; hasMore: boolean; append: boolean }>()
);

export const invokeLoadMyParcelsApiFailure = createAction(
  '[MyParcels API] Load my parcels failure',
  props<{ error: string }>()
);
