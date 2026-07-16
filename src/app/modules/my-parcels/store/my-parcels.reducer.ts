import { createReducer, on } from '@ngrx/store';
import { initialMyParcelsState } from './my-parcels.model';
import {
  invokeLoadMyParcelsApi,
  invokeLoadMyParcelsApiFailure,
  invokeLoadMyParcelsApiSuccess,
} from './my-parcels.action';

export const myParcelsReducer = createReducer(
  initialMyParcelsState,
  on(invokeLoadMyParcelsApi, (state, { status, append }) => ({
    ...state,
    loading: true,
    error: null,
    statusFilter: status,
    // A filter change (append: false) clears the list immediately so a
    // stale page from the PREVIOUS filter never flashes before the new
    // page arrives.
    items: append ? state.items : [],
  })),
  on(invokeLoadMyParcelsApiSuccess, (state, { items, page, hasMore, append }) => ({
    ...state,
    items: append ? [...state.items, ...items] : items,
    page,
    hasMore,
    loading: false,
    loaded: true,
    error: null,
  })),
  on(invokeLoadMyParcelsApiFailure, (state, { error }) => ({
    ...state,
    loading: false,
    loaded: true,
    error,
  }))
);
