import { BehaviorSubject } from 'rxjs';
import { DashboardPageComponent } from './dashboard-page.component';
import { DashboardSnapshot } from './admin-dashboard.store';
import { createTranslateStub } from '../../../../testing/test-stubs';

function makeSnapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    totalBookings: 12,
    pendingPayments: 3,
    revenue: 'THB 1,000.00',
    activeVehicles: 4,
    recentBookings: [],
    partialFailure: false,
    ...overrides,
  };
}

function makeStoreStub(snapshot: DashboardSnapshot | null) {
  const snapshot$ = new BehaviorSubject<DashboardSnapshot | null>(snapshot);
  const refreshing$ = new BehaviorSubject<boolean>(false);
  return {
    snapshot$,
    refreshing$,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get snapshot() {
      return snapshot$.value;
    },
  };
}

describe('DashboardPageComponent', () => {
  it('should create', () => {
    const store = makeStoreStub(null);
    const component = new DashboardPageComponent(store as any, createTranslateStub());
    expect(component).toBeTruthy();
  });

  it('renders cached data immediately and shows no skeleton on re-entry', () => {
    const store = makeStoreStub(makeSnapshot({ totalBookings: 42 }));
    const component = new DashboardPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).isLoading).toBeFalse(); // cache present -> data, not skeleton
    expect((component as any).totalBookings).toBe(42);
    expect(store.refresh).toHaveBeenCalled(); // still revalidates in the background
  });

  it('shows the loading state on first ever visit (no cache yet)', () => {
    const store = makeStoreStub(null);
    const component = new DashboardPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).isLoading).toBeTrue();
    expect((component as any).recentBookings).toEqual([]);
  });

  it('surfaces a partial-failure message from the snapshot', () => {
    const store = makeStoreStub(makeSnapshot({ partialFailure: true }));
    const component = new DashboardPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    // translate stub echoes the key
    expect((component as any).errorMessage).toBe('ADMIN.DASHBOARD.PARTIAL_LOAD_FAILED');
  });

  it('unsubscribes on destroy', () => {
    const store = makeStoreStub(makeSnapshot());
    const component = new DashboardPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component.ngOnDestroy();

    // pushing after destroy must not update the component
    store.snapshot$.next(makeSnapshot({ totalBookings: 999 }));
    expect((component as any).totalBookings).not.toBe(999);
  });
});
