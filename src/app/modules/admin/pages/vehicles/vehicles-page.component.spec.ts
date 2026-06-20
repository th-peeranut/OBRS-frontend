import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
import { VehiclesPageComponent } from './vehicles-page.component';
import { VehiclesData } from './vehicles.store';
import { AdminVehicleDto } from '../../../../services/admin/admin-api.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

const VEHICLE_ROW = {
  id: 1,
  vehicleTypeSlug: 'van',
  statusCode: 'active',
  vehicleNumber: 'V1',
  plate: 'ABC-123',
  vehicleType: 'Van',
  route: '-',
  status: 'Active',
};

function makeData(overrides: Partial<VehiclesData> = {}): VehiclesData {
  return {
    vehicles: [{ id: 1, status: 'active', vehicleType: { id: 1, slug: 'van' } } as any],
    vehicleTypes: [{ id: 1, slug: 'van', translations: [] } as any],
    lookups: [],
    ...overrides,
  };
}

function makeStoreStub(data: VehiclesData | null) {
  const data$ = new BehaviorSubject<VehiclesData | null>(data);
  const refreshing$ = new BehaviorSubject<boolean>(false);
  const error$ = new BehaviorSubject<boolean>(false);
  return {
    data$,
    refreshing$,
    error$,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeComponent(store: ReturnType<typeof makeStoreStub>) {
  const alert = { success: () => Promise.resolve(), error: () => Promise.resolve() };
  return new VehiclesPageComponent(
    {} as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub(),
    store as any
  );
}

describe('VehiclesPageComponent', () => {
  it('should create', () => {
    expect(makeComponent(makeStoreStub(null))).toBeTruthy();
  });

  it('renders cached vehicles immediately and shows no skeleton on re-entry', () => {
    const store = makeStoreStub(makeData());
    const component = makeComponent(store);

    component.ngOnInit();

    expect((component as any).isLoading).toBeFalse();
    expect((component as any).vehicles.length).toBe(1);
    expect(store.refresh).toHaveBeenCalled(); // still revalidates in the background
  });

  it('shows the loading skeleton on first visit (no cache, fetch in flight)', () => {
    const store = makeStoreStub(null);
    const component = makeComponent(store);

    component.ngOnInit();
    store.refreshing$.next(true); // fetch started

    expect((component as any).isLoading).toBeTrue();
  });

  it('surfaces the load-failed message only when there is no cached data', () => {
    const store = makeStoreStub(null);
    const component = makeComponent(store);
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).errorMessage).toBe('ADMIN.MESSAGES.LOAD_VEHICLES_FAILED');
    expect((component as any).refreshFailed).toBeFalse(); // full error, not the stale hint
  });

  it('flags refreshFailed (stale hint) when a revalidate fails with cached data shown', () => {
    const store = makeStoreStub(makeData());
    const component = makeComponent(store);
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).refreshFailed).toBeTrue();
    expect((component as any).errorMessage).toBe(''); // cache kept, no blocking error
  });
});

describe('VehiclesPageComponent edit modal', () => {
  function makeEditComponent(getVehicleById$: Subject<ResponseAPI<AdminVehicleDto>>) {
    const adminApi = {
      getVehicleById: jasmine
        .createSpy('getVehicleById')
        .and.returnValue(getVehicleById$.asObservable()),
    };
    const alert = { success: () => Promise.resolve(), error: () => Promise.resolve() };
    return new VehiclesPageComponent(
      adminApi as any,
      new FormBuilder(),
      alert as any,
      createTranslateStub(),
      makeStoreStub(null) as any
    );
  }

  // Regression: the modal must open immediately on Edit, not after the detail
  // fetch resolves — otherwise a slow SIT response leaves a blank wait.
  it('opens the edit modal before the vehicle detail fetch resolves', () => {
    const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
    const component = makeEditComponent(getVehicleById$);

    void (component as any).openEditModal({ ...VEHICLE_ROW });

    // Subject has not emitted yet — the fetch is still in flight.
    expect((component as any).isFormModalOpen).toBeTrue();
    expect((component as any).isEditMode).toBeTrue();
    expect((component as any).isEditDetailLoading).toBeTrue();
    // Form already usable with the row data we had in hand.
    expect((component as any).vehicleForm.get('numberPlate').value).toBe('ABC-123');
  });

  it('patches server detail into untouched fields without clobbering user input', async () => {
    const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
    const component = makeEditComponent(getVehicleById$);

    const promise = (component as any).openEditModal({ ...VEHICLE_ROW });

    // User edits the plate before the detail arrives.
    const form = (component as any).vehicleForm;
    form.get('numberPlate').setValue('USER-TYPED');
    form.get('numberPlate').markAsDirty();

    getVehicleById$.next({
      code: 200,
      message: 'OK',
      data: {
        id: 1,
        numberPlate: 'SERVER-PLATE',
        vehicleNumber: 'V9',
        status: 'active',
        vehicleType: { id: 2, slug: 'bus' },
      },
    });
    getVehicleById$.complete();
    await promise;

    // Untouched field is filled from the server detail...
    expect(form.get('vehicleNumber').value).toBe('V9');
    // ...but the field the user was editing is preserved.
    expect(form.get('numberPlate').value).toBe('USER-TYPED');
    expect((component as any).isEditDetailLoading).toBeFalse();
  });
});
