import { myParcelsReducer } from './my-parcels.reducer';
import { initialMyParcelsState } from './my-parcels.model';
import {
  invokeLoadMyParcelsApi,
  invokeLoadMyParcelsApiFailure,
  invokeLoadMyParcelsApiSuccess,
} from './my-parcels.action';
import { ParcelMeDto } from '../../../shared/interfaces/parcel.interface';

const item = (id: number): ParcelMeDto => ({
  parcelId: id,
  trackingNumber: `PCL${id}`,
  bookingId: id,
  bookingNumber: `BK${id}`,
  amount: 100,
  deliveryStatus: 'created',
  bookingStatus: 'confirmed',
  collectionCode: null,
  recipientName: 'Somchai',
  pickupStop: 'a',
  dropoffStop: 'b',
  departureDateTime: '2026-08-01T08:00:00+07:00',
  weightKg: 5,
});

describe('myParcelsReducer', () => {
  it('returns the initial state for an unknown action', () => {
    expect(myParcelsReducer(undefined, { type: '@@init' } as any)).toEqual(initialMyParcelsState);
  });

  it('sets loading and clears items on a NON-append load', () => {
    const seeded = { ...initialMyParcelsState, items: [item(1)] };
    const state = myParcelsReducer(seeded, invokeLoadMyParcelsApi({ page: 0, append: false }));
    expect(state.loading).toBeTrue();
    expect(state.items).toEqual([]);
  });

  it('keeps existing items on an APPEND (load more) load', () => {
    const seeded = { ...initialMyParcelsState, items: [item(1)] };
    const state = myParcelsReducer(seeded, invokeLoadMyParcelsApi({ page: 1, append: true }));
    expect(state.items).toEqual([item(1)]);
  });

  it('replaces items on a non-append success', () => {
    const state = myParcelsReducer(
      initialMyParcelsState,
      invokeLoadMyParcelsApiSuccess({ items: [item(1)], page: 0, hasMore: true, append: false })
    );
    expect(state.items).toEqual([item(1)]);
    expect(state.page).toBe(0);
    expect(state.hasMore).toBeTrue();
    expect(state.loaded).toBeTrue();
  });

  it('appends items on an append success', () => {
    const seeded = { ...initialMyParcelsState, items: [item(1)] };
    const state = myParcelsReducer(
      seeded,
      invokeLoadMyParcelsApiSuccess({ items: [item(2)], page: 1, hasMore: false, append: true })
    );
    expect(state.items).toEqual([item(1), item(2)]);
    expect(state.hasMore).toBeFalse();
  });

  it('sets the error on failure', () => {
    const state = myParcelsReducer(
      initialMyParcelsState,
      invokeLoadMyParcelsApiFailure({ error: 'boom' })
    );
    expect(state.error).toBe('boom');
    expect(state.loading).toBeFalse();
    expect(state.loaded).toBeTrue();
  });
});
