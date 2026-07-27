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

// OBRS-758: `inspectedAt` MUST stay derived from "now", never a literal date.
// The panel filters through `filterInspectionRowsByWindow(rows, showAll)`, whose
// `now` parameter defaults to `new Date()` — the real wall clock — so a literal is
// inside the default window (current + previous Bangkok ISO week) only until the
// calendar rolls past it. The literal that used to sit here, '2026-07-14', fell out
// of that window at midnight on Monday 2026-07-27 and took `dev` CI red: with the
// row filtered away, `filteredRows` was empty, so the detail-modal test below handed
// `filteredRows[0]` === undefined to `openDetail()`.
// Bumping a literal forward only re-arms the bomb for the next boundary; a relative
// date cannot expire. A literal is correct ONLY when the intent is "far outside any
// window" — that is why the deliberate '2020-01-01' rows below stay literal.
function buildRow(overrides: Partial<VehicleInspectionListItemDto> = {}): VehicleInspectionListItemDto {
  return {
    id: 1,
    inspectedAt: new Date().toISOString(),
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

  // OBRS-758 regression guard. The bug was not "one wrong assertion" but a fixture
  // that expires: the suite passed for 13 days and then failed for a whole calendar
  // day. So pin the property that must hold on ANY date — the default fixture row is
  // visible in the default window — and check it on BOTH sides of the boundary that
  // detonated. With the old '2026-07-14' literal, the Monday case fails exactly the
  // way `dev` CI did (empty `filteredRows`) while the Sunday case still passes, which
  // is what made this invisible until it was already red.
  //
  // The clock is mocked per-test rather than in a beforeEach: a top-level clock
  // install in a karma bundle leaks into every other spec file in the run.
  const WEEK_BOUNDARY_CASES: ReadonlyArray<readonly [string, string]> = [
    ['Monday, the day the old literal detonated', '2026-07-27T09:00:00+07:00'],
    ['Sunday, the last day it still passed', '2026-07-26T23:00:00+07:00'],
  ];

  WEEK_BOUNDARY_CASES.forEach(([label, isoNow]) => {
    it(`keeps the default fixture row inside the default window on ${label}`, () => {
      jasmine.clock().install();
      try {
        jasmine.clock().mockDate(new Date(isoNow));
        const component = createComponent({}, createStoreStub([buildRow({ id: 7 })]));

        expect((component as any).filteredRows.map((r: any) => r.id)).toEqual([7]);
      } finally {
        jasmine.clock().uninstall();
      }
    });
  });
});

describe('AppVehicleInspectionPanelComponent — read-only detail modal', () => {
  it('openDetail() opens optimistically with the row already in hand, then resolves the item list', async () => {
    const row = buildRow({ id: 7 });
    const detailItems = [
      {
        itemId: 1,
        itemLabelSnapshot: 'Tires',
        verdict: 'ok',
        note: '',
        categorySnapshot: 'TIRES',
        categoryOrder: 2,
      },
    ];
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
      data: {
        ...rowA,
        items: [
          {
            itemId: 99,
            itemLabelSnapshot: 'STALE',
            verdict: 'ok',
            note: '',
            categorySnapshot: 'TIRES',
            categoryOrder: 2,
          },
        ],
      },
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

describe('AppVehicleInspectionPanelComponent — OBRS-553 category-snapshot grouping', () => {
  it('openDetail() groups detailRows by categorySnapshot into contiguous runs, running flatIndex across groups', async () => {
    const row = buildRow({ id: 7 });
    const detailItems = [
      { itemId: 15, itemLabelSnapshot: 'A', verdict: 'ok', note: '', categorySnapshot: 'CABIN', categoryOrder: 5 },
      { itemId: 17, itemLabelSnapshot: 'B', verdict: 'ok', note: '', categorySnapshot: 'CABIN', categoryOrder: 5 },
      {
        itemId: 16,
        itemLabelSnapshot: 'C',
        verdict: 'ok',
        note: '',
        categorySnapshot: 'SAFETY_DOCS',
        categoryOrder: 6,
      },
    ];
    const adminApi = {
      getVehicleInspectionById: jasmine
        .createSpy('getVehicleInspectionById')
        .and.returnValue(of({ code: 200, message: 'OK', data: { ...row, items: detailItems } })),
    };
    const component = createComponent(adminApi, createStoreStub([row]));

    (component as any).openDetail(row);
    await Promise.resolve();
    await Promise.resolve();

    const groups = (component as any).detailGroups;
    expect(groups.map((g: any) => g.category)).toEqual(['CABIN', 'SAFETY_DOCS']);
    const flattened = groups.flatMap((g: any) => g.rows);
    // The tell for a filter()-per-category rewrite: it would reset flatIndex
    // to 0 at the start of the SAFETY_DOCS group, producing [0, 1, 0] instead
    // of the running count [0, 1, 2].
    expect(flattened.map((r: any) => r.flatIndex)).toEqual([0, 1, 2]);
    expect(flattened.map((r: any) => r.row.itemId)).toEqual([15, 17, 16]);
  });

  it('closeDetailModal() clears detailGroups along with detailRows', async () => {
    const row = buildRow({ id: 1 });
    const adminApi = {
      getVehicleInspectionById: jasmine
        .createSpy('getVehicleInspectionById')
        .and.returnValue(
          of({
            code: 200,
            message: 'OK',
            data: {
              ...row,
              items: [
                {
                  itemId: 1,
                  itemLabelSnapshot: 'Tires',
                  verdict: 'ok',
                  note: '',
                  categorySnapshot: 'TIRES',
                  categoryOrder: 2,
                },
              ],
            },
          })
        ),
    };
    const component = createComponent(adminApi, createStoreStub([row]));

    (component as any).openDetail(row);
    await Promise.resolve();
    await Promise.resolve();
    expect((component as any).detailGroups.length).toBe(1);

    (component as any).closeDetailModal();

    expect((component as any).detailGroups).toEqual([]);
  });
});
