import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { CargoCapacityStore } from './cargo-capacity.store';
import { AdminVehicleTypeDto } from '../../../../services/admin/admin-api.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function vehicleType(overrides: Partial<AdminVehicleTypeDto> = {}): AdminVehicleTypeDto {
  return {
    id: 1,
    slug: 'minibus',
    totalSeats: 21,
    status: 'active',
    cargoCapacityKg: 200,
    ...overrides,
  };
}

interface FakeApi {
  getVehicleTypes: jasmine.Spy<() => Observable<ResponseAPI<AdminVehicleTypeDto[]>>>;
}

function makeStore(
  api: Partial<FakeApi>,
  authStatus$ = new BehaviorSubject<boolean>(true)
): CargoCapacityStore {
  const full: FakeApi = {
    getVehicleTypes: jasmine
      .createSpy('getVehicleTypes')
      .and.returnValue(of(ok([vehicleType()]))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new CargoCapacityStore(full as any, { authStatus$ } as any);
}

describe('CargoCapacityStore', () => {
  it('fetches vehicle types on refresh()', async () => {
    const getVehicleTypes = jasmine
      .createSpy('getVehicleTypes')
      .and.returnValue(of(ok([vehicleType()])));
    const store = makeStore({ getVehicleTypes });

    await store.refresh();

    expect(getVehicleTypes).toHaveBeenCalledTimes(1);
    expect(store.value?.vehicleTypes).toEqual([vehicleType()]);
  });

  it('defaults to an empty list when the response has no data', async () => {
    const store = makeStore({
      getVehicleTypes: jasmine
        .createSpy('getVehicleTypes')
        .and.returnValue(of({ code: 200, message: 'OK', data: null } as unknown as ResponseAPI<AdminVehicleTypeDto[]>)),
    });

    await store.refresh();

    expect(store.value?.vehicleTypes).toEqual([]);
  });

  it('replays the last-fetched list synchronously to a new subscriber on re-entry', async () => {
    const store = makeStore({});
    await store.refresh();

    let received: { vehicleTypes: AdminVehicleTypeDto[] } | null | undefined;
    store.data$.subscribe((value) => (received = value));

    expect(received?.vehicleTypes).toEqual([vehicleType()]);
  });

  it('keeps the cached value and flags error$ when a background refresh fails', async () => {
    const getVehicleTypes = jasmine
      .createSpy('getVehicleTypes')
      .and.returnValue(of(ok([vehicleType()])));
    const store = makeStore({ getVehicleTypes });
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    let errored = false;
    store.error$.subscribe((value) => (errored = value));

    getVehicleTypes.and.returnValue(throwError(() => new Error('network')));
    await store.refresh();

    expect(store.value?.vehicleTypes).toEqual([vehicleType()]); // stale value retained
    expect(errored).toBeTrue();
  });

  it('clears the cached vehicle types on logout', async () => {
    const authStatus$ = new BehaviorSubject<boolean>(true);
    const store = makeStore({}, authStatus$);
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    authStatus$.next(false);

    expect(store.value).toBeNull();
  });
});
