import { createAction, props } from '@ngrx/store';
import { ParcelMeDto } from '../../../shared/interfaces/parcel.interface';

/**
 * `page`/`size` mirror `my-bookings`' own load action shape.
 * `status: null` means "all". `append: true` is the "load more" case (adds
 * to the existing list); a filter change always loads with `append: false`
 * (replaces the list from page 0) — UX-OBRS-415 §12.4.
 */
export const invokeLoadMyParcelsApi = createAction(
  '[MyParcels API] Invoke to load my parcels',
  props<{ status: string | null; page: number; append: boolean }>()
);

export const invokeLoadMyParcelsApiSuccess = createAction(
  '[MyParcels API] Load my parcels success',
  props<{ items: ParcelMeDto[]; page: number; hasMore: boolean; append: boolean }>()
);

export const invokeLoadMyParcelsApiFailure = createAction(
  '[MyParcels API] Load my parcels failure',
  props<{ error: string }>()
);
