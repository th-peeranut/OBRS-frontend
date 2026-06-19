import { FormBuilder } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { VehiclesPageComponent } from './vehicles-page.component';
import { VehiclesData } from './vehicles.store';
import { createTranslateStub } from '../../../../testing/test-stubs';

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
