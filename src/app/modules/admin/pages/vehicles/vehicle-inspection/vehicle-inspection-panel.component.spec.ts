import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { AppVehicleInspectionPanelComponent } from './vehicle-inspection-panel.component';
import { VehicleInspectionListItemDto } from '../../../../../services/admin/admin-api.service';
import { createTranslateStub } from '../../../../../testing/test-stubs';

function createStoreStub(initial: VehicleInspectionListItemDto[] | null = []): any {
  const dataSubject = new BehaviorSubject<VehicleInspectionListItemDto[] | null>(initial);
  return {
    data$: dataSubject.asObservable(),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    get hasValue() {
      return dataSubject.value !== null;
    },
    setVehicleId: jasmine.createSpy('setVehicleId'),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    next: (value: VehicleInspectionListItemDto[]) => dataSubject.next(value),
  };
}

function buildRow(overrides: Partial<VehicleInspectionListItemDto> = {}): VehicleInspectionListItemDto {
  return {
    id: 1,
    inspectedAt: '2026-07-14T09:00:00+07:00',
    inspectedByName: 'Somchai',
    odometerKm: 1000,
    defectCount: 0,
    pendingMaintenance: false,
    ...overrides,
  };
}

function createComponent(
  adminApiServiceStub: any = {},
  storeStub: any = createStoreStub([])
): AppVehicleInspectionPanelComponent {
  const component = new AppVehicleInspectionPanelComponent(
    adminApiServiceStub,
    createTranslateStub(),
    storeStub
  );
  component.vehicleId = 42;
  component.vehicleLabel = 'V-001';
  component.ngOnChanges({ vehicleId: {} as any });
  component.ngOnInit();
  return component;
}

describe('AppVehicleInspectionPanelComponent — single-owner re-bind (OBRS-312, mirrors OBRS-209)', () => {
  it('ngOnChanges on vehicleId calls store.setVehicleId() and refreshes', () => {
    const store = createStoreStub([]);
    createComponent({}, store);

    expect(store.setVehicleId).toHaveBeenCalledWith(42);
    expect(store.refresh).toHaveBeenCalled();
  });
});

describe('AppVehicleInspectionPanelComponent — loading/empty/error states', () => {
  it('isLoading is true only while refreshing with no cached value', () => {
    const store = createStoreStub(null);
    const component = createComponent({}, store);

    store.refreshing$.next(true);

    expect((component as any).isLoading).toBeTrue();
  });

  it('isEmpty is true for a 200 + [] response', () => {
    const component = createComponent({}, createStoreStub([]));
    expect((component as any).isEmpty).toBeTrue();
  });

  it('surfaces the load-failed message only when there is no cached data', () => {
    const store = createStoreStub(null);
    const component = createComponent({}, store);

    store.error$.next(true);

    expect((component as any).errorMessage).toBe('ADMIN.MESSAGES.LOAD_INSPECTIONS_FAILED');
  });
});

describe('AppVehicleInspectionPanelComponent — pending filter (switchable, not a hard bound)', () => {
  it('defaults to the current + previous ISO week window', () => {
    const now = new Date();
    const oldRow = buildRow({ id: 2, inspectedAt: '2020-01-01T00:00:00+07:00' });
    const recentRow = buildRow({ id: 1, inspectedAt: now.toISOString() });
    const store = createStoreStub([recentRow, oldRow]);
    const component = createComponent({}, store);

    expect((component as any).filteredRows.map((r: any) => r.id)).toEqual([1]);
  });

  it('toggleShowAll() reveals every row, including one outside the default window', () => {
    const oldRow = buildRow({ id: 2, inspectedAt: '2020-01-01T00:00:00+07:00' });
    const store = createStoreStub([oldRow]);
    const component = createComponent({}, store);
    expect((component as any).filteredRows.length).toBe(0);

    (component as any).toggleShowAll();

    expect((component as any).showAll).toBeTrue();
    expect((component as any).filteredRows.map((r: any) => r.id)).toEqual([2]);
  });
});

describe('AppVehicleInspectionPanelComponent — read-only detail modal', () => {
  it('openDetail() opens optimistically with the row already in hand, then resolves the item list', async () => {
    const row = buildRow({ id: 7 });
    const detailItems = [{ itemId: 1, itemLabelSnapshot: 'Tires', verdict: 'ok', note: '' }];
    const adminApi = {
      getVehicleInspectionById: jasmine
        .createSpy('getVehicleInspectionById')
        .and.returnValue(of({ code: 200, message: 'OK', data: { ...row, items: detailItems } })),
    };
    const component = createComponent(adminApi, createStoreStub([row]));

    (component as any).openDetail((component as any).filteredRows[0]);

    // Optimistic: open + header seeded synchronously, before the fetch resolves.
    expect((component as any).isDetailModalOpen).toBeTrue();
    expect((component as any).selectedRow.id).toBe(7);
    expect((component as any).isDetailLoading).toBeTrue();

    await Promise.resolve();
    await Promise.resolve();

    expect(adminApi.getVehicleInspectionById).toHaveBeenCalledWith(42, 7);
    expect((component as any).isDetailLoading).toBeFalse();
    expect((component as any).detailRows.length).toBe(1);
    expect((component as any).detailRows[0].verdictChipToken).toBe('is-success');
  });

  it('discards a stale detail response if a different row was opened meanwhile', async () => {
    const rowA = buildRow({ id: 1 });
    const rowB = buildRow({ id: 2 });
    let resolveA!: (value: unknown) => void;
    const adminApi = {
      getVehicleInspectionById: jasmine
        .createSpy('getVehicleInspectionById')
        .and.callFake((_vehicleId: number, inspectionId: number) => {
          if (inspectionId === 1) {
            return new Observable((subscriber) => {
              resolveA = (value: unknown) => {
                subscriber.next(value as never);
                subscriber.complete();
              };
            });
          }
          return of({ code: 200, message: 'OK', data: { ...rowB, items: [] } });
        }),
    };
    const component = createComponent(adminApi, createStoreStub([rowA, rowB]));

    (component as any).openDetail(rowA); // slow request, not yet resolved
    (component as any).openDetail(rowB); // opens a different row before A resolves
    await Promise.resolve();
    await Promise.resolve();

    // Resolve the stale A request AFTER B has already opened.
    resolveA({
      code: 200,
      message: 'OK',
      data: { ...rowA, items: [{ itemId: 99, itemLabelSnapshot: 'STALE', verdict: 'ok', note: '' }] },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect((component as any).selectedRow.id).toBe(2);
    expect((component as any).detailRows.some((r: any) => r.itemLabelSnapshot === 'STALE')).toBeFalse();
  });

  it('closeDetailModal() resets modal state and invalidates any in-flight fetch', async () => {
    const row = buildRow({ id: 1 });
    const adminApi = {
      getVehicleInspectionById: jasmine
        .createSpy('getVehicleInspectionById')
        .and.returnValue(of({ code: 200, message: 'OK', data: { ...row, items: [] } })),
    };
    const component = createComponent(adminApi, createStoreStub([row]));

    (component as any).openDetail(row);
    (component as any).closeDetailModal();

    expect((component as any).isDetailModalOpen).toBeFalse();
    expect((component as any).selectedRow).toBeNull();
  });

  it('sets a detail error message on a rejected fetch (guarded by the same request token)', async () => {
    const row = buildRow({ id: 1 });
    const adminApi = {
      getVehicleInspectionById: jasmine
        .createSpy('getVehicleInspectionById')
        .and.returnValue(throwError(() => new Error('network'))),
    };
    const component = createComponent(adminApi, createStoreStub([row]));

    (component as any).openDetail(row);
    await Promise.resolve();
    await Promise.resolve();

    expect((component as any).detailErrorMessage).toBe('ADMIN.VEHICLES.INSPECTION.DETAIL_LOAD_FAILED');
    expect((component as any).isDetailLoading).toBeFalse();
  });
});
