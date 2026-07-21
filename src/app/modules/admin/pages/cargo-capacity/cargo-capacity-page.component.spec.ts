import { BehaviorSubject, of, throwError } from 'rxjs';
import { CargoCapacityPageComponent } from './cargo-capacity-page.component';
import { AdminVehicleTypeDto } from '../../../../services/admin/admin-api.service';
import { createTranslateStub } from '../../../../testing/test-stubs';

function vehicleType(overrides: Partial<AdminVehicleTypeDto> = {}): AdminVehicleTypeDto {
  return {
    id: 1,
    slug: 'minibus',
    totalSeats: 21,
    status: { code: 'active' },
    translations: [{ locale: 'en', label: 'Minibus' }],
    cargoCapacityKg: 200,
    ...overrides,
  };
}

function makeStoreStub() {
  const data$ = new BehaviorSubject<{ vehicleTypes: AdminVehicleTypeDto[] } | null>(null);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    mutate: jasmine.createSpy('mutate').and.callFake(
      (transform: (current: { vehicleTypes: AdminVehicleTypeDto[] }) => { vehicleTypes: AdminVehicleTypeDto[] }) => {
        if (data$.value !== null) {
          data$.next(transform(data$.value));
        }
      }
    ),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeComponent(adminApi: Record<string, unknown>, store = makeStoreStub()) {
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  const component = new CargoCapacityPageComponent(
    adminApi as any,
    alert as any,
    createTranslateStub(),
    store as any
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, store, alert };
}

describe('CargoCapacityPageComponent', () => {
  it('subscribes to store.data$ and calls store.refresh() on init — no direct fetch', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('maps the store data into rows, pre-filling each input from cargoCapacityKg', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    store.data$.next({ vehicleTypes: [vehicleType()] });

    expect(component.rows.length).toBe(1);
    expect(component.rows[0].vehicleTypeLabel).toBe('Minibus');
    expect(component.inputValue(component.rows[0])).toBe('200');
  });

  it('renders an empty input, and flags "not configured", when cargoCapacityKg is null', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    store.data$.next({ vehicleTypes: [vehicleType({ cargoCapacityKg: null })] });

    const row = component.rows[0];
    expect(component.inputValue(row)).toBe('');
    expect(component.isRowUnconfigured(row)).toBeTrue();
  });

  // OBRS-506: a null emission (clear(), e.g. on logout) must reset the
  // cached rows, not leave a previous session's rows on screen — same shape
  // as the already-fixed usability-reports-page.component.ts (OBRS-467).
  it('clears rows when the store emits null (OBRS-506)', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    store.data$.next({ vehicleTypes: [vehicleType()] });
    expect(component.rows.length).toBe(1);

    store.data$.next(null);

    expect(component.rows)
      .withContext('a null emission must not leave the previous session\'s rows on screen')
      .toEqual([]);
  });

  it('a valid edit marks the row dirty; matching the original value keeps it clean', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    store.data$.next({ vehicleTypes: [vehicleType()] });
    const row = component.rows[0];

    component.onInputChange(row, '250');
    expect(component.isRowDirty(row)).toBeTrue();

    component.onInputChange(row, '200');
    expect(component.isRowDirty(row)).toBeFalse();
  });

  it('a background revalidate does not clobber a row the admin already started editing', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();
    store.data$.next({ vehicleTypes: [vehicleType()] });
    const row = component.rows[0];

    component.onInputChange(row, '999');
    // Background refresh lands with the OLD value still on the server.
    store.data$.next({ vehicleTypes: [vehicleType()] });

    expect(component.inputValue(component.rows[0])).toBe('999');
  });

  it('saveRow() rejects an invalid value without calling the API', async () => {
    const updateVehicleTypeCargoCapacity = jasmine.createSpy('updateVehicleTypeCargoCapacity');
    const { component, store } = makeComponent({ updateVehicleTypeCargoCapacity });
    component.ngOnInit();
    store.data$.next({ vehicleTypes: [vehicleType()] });
    const row = component.rows[0];

    component.onInputChange(row, 'abc');
    await component.saveRow(row);

    expect(updateVehicleTypeCargoCapacity).not.toHaveBeenCalled();
    expect(component.rowErrorKey(row)).toBe('ADMIN.VALIDATION.CARGO_CAPACITY_INVALID');
  });

  it('saveRow() sends ONLY cargoCapacityKg — no getVehicleTypeById pre-fetch, no other field in the body', async () => {
    const updated = vehicleType({
      cargoCapacityKg: 350,
      // Untouched fields the PATCH response echoes back — proves the save
      // path does not need/send them itself (the old full-replace PUT hazard
      // this endpoint replaces no longer applies).
      totalSeats: 21,
      translations: [{ locale: 'en', label: 'Minibus' }],
      seatMaps: [{ seatNumber: '1', rowIndex: 0, columnIndex: 0 }],
    });
    const getVehicleTypeById = jasmine.createSpy('getVehicleTypeById');
    const updateVehicleTypeCargoCapacity = jasmine
      .createSpy('updateVehicleTypeCargoCapacity')
      .and.returnValue(of({ code: 200, message: 'OK', data: updated }));
    const { component, store, alert } = makeComponent({
      getVehicleTypeById,
      updateVehicleTypeCargoCapacity,
    });
    component.ngOnInit();
    store.data$.next({ vehicleTypes: [vehicleType()] });
    const row = component.rows[0];

    component.onInputChange(row, '350');
    await component.saveRow(row);

    expect(getVehicleTypeById).not.toHaveBeenCalled();
    expect(updateVehicleTypeCargoCapacity).toHaveBeenCalledOnceWith(1, { cargoCapacityKg: 350 });
    expect(Object.keys(updateVehicleTypeCargoCapacity.calls.argsFor(0)[1])).toEqual([
      'cargoCapacityKg',
    ]);
    expect(alert.success).toHaveBeenCalledWith('ADMIN.MESSAGES.UPDATED');
    // No background store.refresh() needed — the response IS the fresh row.
    expect(store.refresh).toHaveBeenCalledTimes(1); // only the initial load
    expect(store.mutate).toHaveBeenCalledTimes(1);
    expect(component.inputValue(component.rows[0])).toBe('350');
  });

  it('saveRow() shows an error alert and keeps the draft value on failure', async () => {
    const updateVehicleTypeCargoCapacity = jasmine
      .createSpy('updateVehicleTypeCargoCapacity')
      .and.returnValue(throwError(() => new Error('boom')));
    const { component, store, alert } = makeComponent({ updateVehicleTypeCargoCapacity });
    component.ngOnInit();
    store.data$.next({ vehicleTypes: [vehicleType()] });
    const row = component.rows[0];

    component.onInputChange(row, '350');
    await component.saveRow(row);

    expect(alert.error).toHaveBeenCalled();
    expect(component.inputValue(component.rows[0])).toBe('350');
    expect(component.isRowSaving(row)).toBeFalse();
    expect(store.mutate).not.toHaveBeenCalled();
  });
});
