import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { VehiclesPageComponent } from './vehicles-page.component';
import { VehiclesData, VehiclesStore } from './vehicles.store';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { AuthService } from '../../../../auth/auth.service';
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
    mutate: jasmine
      .createSpy('mutate')
      .and.callFake((transform: (current: VehiclesData) => VehiclesData) => {
        if (data$.value !== null) {
          data$.next(transform(data$.value));
        }
      }),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeAuthServiceStub(canWrite = true) {
  return { hasAnyRole: jasmine.createSpy('hasAnyRole').and.returnValue(canWrite) };
}

// OBRS-357: the page subscribes to queryParamMap (not the snapshot - a
// param-only navigation reuses the component), so every construction needs a
// route. An empty param map is the ordinary entry.
function makeRouteStub(queryParams: Record<string, string> = {}) {
  return { queryParamMap: of(convertToParamMap(queryParams)) };
}

function makeComponent(
  store: ReturnType<typeof makeStoreStub>,
  adminApi: Record<string, unknown> = {},
  route: ReturnType<typeof makeRouteStub> = makeRouteStub(),
  alertOverride?: Record<string, unknown>
) {
  const alert = alertOverride ?? { success: () => Promise.resolve(), error: () => Promise.resolve() };
  return new VehiclesPageComponent(
    adminApi as any,
    alert as any,
    createTranslateStub(),
    store as any,
    makeAuthServiceStub() as any,
    route as any
  );
}

// OBRS-357: what GET /api/private/inspections/{id}/maintenance-draft answers.
function makeDraftApi(vehicleId = 1) {
  return {
    getInspectionMaintenanceDraft: jasmine
      .createSpy('getInspectionMaintenanceDraft')
      .and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: {
            inspectionId: 5,
            vehicleId,
            suggestedReason: 'Repair from the vehicle inspection on 21 Jul 2026 10:00 (2 defect(s))',
            suggestedNotes: '• Brakes: worn\n• Tyres: bald',
          },
        })
      ),
  };
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

  // OBRS-506: a null emission (clear(), e.g. on logout) must reset the
  // cached vehicles/options, not leave a previous session's rows on screen —
  // same shape as the already-fixed usability-reports-page.component.ts
  // (OBRS-467).
  it('clears vehicles when the store emits null (OBRS-506)', () => {
    const store = makeStoreStub(makeData());
    const component = makeComponent(store);
    component.ngOnInit();
    expect((component as any).vehicles.length).toBe(1);

    store.data$.next(null);

    expect((component as any).vehicles)
      .withContext('a null emission must not leave the previous session\'s rows on screen')
      .toEqual([]);
  });
});

describe('VehiclesPageComponent — Maintenance tab (OBRS-209)', () => {
  it('starts on the list tab with no focused vehicle', () => {
    const component = makeComponent(makeStoreStub(null));

    expect((component as any).activeTab).toBe('list');
    expect((component as any).focusedVehicle).toBeNull();
  });

  it('setActiveTab("maintenance") is a no-op until a vehicle is focused (tab stays disabled)', () => {
    const component = makeComponent(makeStoreStub(null));

    (component as any).setActiveTab('maintenance');

    expect((component as any).activeTab).toBe('list');
  });

  it('viewMaintenanceForVehicle() focuses the vehicle and switches to the maintenance tab', () => {
    const component = makeComponent(makeStoreStub(null));
    const vehicle = { ...VEHICLE_ROW };

    (component as any).viewMaintenanceForVehicle(vehicle);

    expect((component as any).focusedVehicle).toBe(vehicle);
    expect((component as any).activeTab).toBe('maintenance');
  });

  it('clearFocusedVehicle() clears the focus and returns to the list tab', () => {
    const component = makeComponent(makeStoreStub(null));
    (component as any).viewMaintenanceForVehicle({ ...VEHICLE_ROW });

    (component as any).clearFocusedVehicle();

    expect((component as any).focusedVehicle).toBeNull();
    expect((component as any).activeTab).toBe('list');
  });

  // OBRS-312: a third "Inspections" tab reusing the same focusedVehicle mechanic.
  it('setActiveTab("inspections") is a no-op until a vehicle is focused (tab stays disabled)', () => {
    const component = makeComponent(makeStoreStub(null));

    (component as any).setActiveTab('inspections');

    expect((component as any).activeTab).toBe('list');
  });

  it('viewInspectionsForVehicle() focuses the vehicle and switches to the inspections tab', () => {
    const component = makeComponent(makeStoreStub(null));
    const vehicle = { ...VEHICLE_ROW };

    (component as any).viewInspectionsForVehicle(vehicle);

    expect((component as any).focusedVehicle).toBe(vehicle);
    expect((component as any).activeTab).toBe('inspections');
  });

  // OBRS-1333: a fourth "Plans" tab reusing the same focusedVehicle mechanic.
  it('setActiveTab("plans") is a no-op until a vehicle is focused (tab stays disabled)', () => {
    const component = makeComponent(makeStoreStub(null));

    (component as any).setActiveTab('plans');

    expect((component as any).activeTab).toBe('list');
  });

  it('viewPlansForVehicle() focuses the vehicle and switches to the plans tab', () => {
    const component = makeComponent(makeStoreStub(null));
    const vehicle = { ...VEHICLE_ROW };

    (component as any).viewPlansForVehicle(vehicle);

    expect((component as any).focusedVehicle).toBe(vehicle);
    expect((component as any).activeTab).toBe('plans');
  });

  it('canWriteMaintenance reflects authService.hasAnyRole(["owner"]) (admin inherits via ROLE_GRANTS)', () => {
    const alert = { success: () => Promise.resolve(), error: () => Promise.resolve() };
    const authService = makeAuthServiceStub(true);
    const component = new VehiclesPageComponent(
      {} as any,
      alert as any,
      createTranslateStub(),
      makeStoreStub(null) as any,
      authService as any,
      makeRouteStub() as any
    );

    expect(authService.hasAnyRole).toHaveBeenCalledWith(['owner']);
    expect((component as any).canWriteMaintenance).toBeTrue();
  });
});

// OBRS-261: the form/table/confirm markup and their FormGroup/API calls
// moved into child components (VehicleFormModalComponent /
// VehicleListTableComponent / VehicleDeleteModalComponent) — the page now
// only sets the modal-orchestration state those children are bound to.
// Coverage for form validation/submit/edit-fetch lives in
// vehicle-form-modal.component.spec.ts.
describe('VehiclesPageComponent modal orchestration', () => {
  it('openCreateModal() opens the form modal in create mode with no selection', () => {
    const component = makeComponent(makeStoreStub(null));

    component.ngOnInit();
    (component as any).openCreateModal();

    expect((component as any).mode).toBe('create');
    expect((component as any).selectedVehicle).toBeNull();
    expect((component as any).isFormModalOpen).toBeTrue();
  });

  it('openEditModal() opens the form modal in edit mode with the given row, synchronously', () => {
    const component = makeComponent(makeStoreStub(null));
    const vehicle = { ...VEHICLE_ROW };

    (component as any).openEditModal(vehicle);

    expect((component as any).mode).toBe('edit');
    expect((component as any).selectedVehicle).toBe(vehicle);
    expect((component as any).isFormModalOpen).toBeTrue();
  });

  it('onFormModalClosed() closes the form modal and clears the selection', () => {
    const component = makeComponent(makeStoreStub(null));
    (component as any).openEditModal({ ...VEHICLE_ROW });

    (component as any).onFormModalClosed();

    expect((component as any).isFormModalOpen).toBeFalse();
    expect((component as any).selectedVehicle).toBeNull();
  });

  it('reloadStructureBound() delegates to store.refresh()', () => {
    const store = makeStoreStub(null);
    const component = makeComponent(store);

    (component as any).reloadStructureBound();

    expect(store.refresh).toHaveBeenCalled();
  });
});

describe('VehiclesPageComponent delete modal', () => {
  it('openDeleteModal opens the confirm dialog for the given vehicle', () => {
    const component = makeComponent(makeStoreStub(null));
    const vehicle = { ...VEHICLE_ROW };

    (component as any).openDeleteModal(vehicle);

    expect((component as any).isDeleteModalOpen).toBeTrue();
    expect((component as any).selectedVehicle).toBe(vehicle);
  });

  it('closeDeleteModal does not close while deleting unless forced', () => {
    const component = makeComponent(makeStoreStub(null));
    (component as any).openDeleteModal({ ...VEHICLE_ROW });
    (component as any).isDeleting = true;

    (component as any).closeDeleteModal();
    expect((component as any).isDeleteModalOpen).toBeTrue();

    (component as any).closeDeleteModal(true);
    expect((component as any).isDeleteModalOpen).toBeFalse();
  });

  it('confirmDelete() calls DELETE, optimistically removes the row, then refreshes', async () => {
    const store = makeStoreStub(makeData());
    const deleteSpy = jasmine
      .createSpy('deleteVehicle')
      .and.returnValue(of({ code: 200, message: 'OK', data: null }));
    const component = makeComponent(store, { deleteVehicle: deleteSpy });
    component.ngOnInit();

    (component as any).openDeleteModal({ ...VEHICLE_ROW, id: 1 });
    await (component as any).confirmDelete();

    expect(deleteSpy).toHaveBeenCalledWith(1);
    const updated = store.data$.value as VehiclesData;
    expect(updated.vehicles.length).toBe(0);
    expect((component as any).isDeleteModalOpen).toBeFalse();
  });
});

// ── OBRS-261: child extraction — verify the page wires the right inputs to
// app-vehicle-list-table / app-vehicle-form-modal / app-vehicle-delete-modal
// and delegates their outputs to the existing handlers. Uses NO_ERRORS_SCHEMA
// (established pattern in this codebase, e.g. promotions-page.component.spec.ts)
// so the child selectors don't need to be declared.
describe('VehiclesPageComponent template wiring to child components', () => {
  let fixture: ComponentFixture<VehiclesPageComponent>;
  let component: VehiclesPageComponent;

  beforeEach(async () => {
    const store = makeStoreStub(null);
    const adminApi = { deleteVehicle: jasmine.createSpy('deleteVehicle') };
    const alert = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };
    const authService = makeAuthServiceStub();

    await TestBed.configureTestingModule({
      declarations: [VehiclesPageComponent],
      imports: [CommonModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: VehiclesStore, useValue: store },
        { provide: AdminApiService, useValue: adminApi },
        { provide: AlertService, useValue: alert },
        { provide: AuthService, useValue: authService },
        // OBRS-357: the page subscribes to the route's queryParamMap.
        { provide: ActivatedRoute, useValue: makeRouteStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VehiclesPageComponent);
    component = fixture.componentInstance;
  });

  it('app-vehicle-list-table receives rows/isLoading/skeletonRows/hasError/totalCount', () => {
    fixture.detectChanges(); // run ngOnInit first
    (component as any).filteredVehicles = [{ id: 1, statusCode: 'active' }];
    (component as any).vehicles = [
      { id: 1, statusCode: 'active' },
      { id: 2, statusCode: 'pending' },
    ];
    (component as any).errorMessage = 'boom';
    fixture.detectChanges();

    const table = fixture.debugElement.query(By.css('app-vehicle-list-table'));
    expect(table.properties['rows']).toBe((component as any).filteredVehicles);
    expect(table.properties['skeletonRows']).toBe((component as any).skeletonRows);
    expect(table.properties['hasError']).toBeTrue();
    expect(table.properties['totalCount']).toBe(2);
  });

  it('app-vehicle-form-modal receives isOpen/mode/selectedVehicle/option lists/reloadStructure', () => {
    fixture.detectChanges();
    (component as any).openEditModal({ id: 2, vehicleNumber: 'V2' });
    fixture.detectChanges();

    const modal = fixture.debugElement.query(By.css('app-vehicle-form-modal'));
    expect(modal.properties['isOpen']).toBeTrue();
    expect(modal.properties['mode']).toBe('edit');
    expect(modal.properties['selectedVehicle']).toEqual({ id: 2, vehicleNumber: 'V2' });
    expect(modal.properties['reloadStructure']).toBe((component as any).reloadStructureBound);
  });

  it('delegates (edit)/(delete)/(manageMaintenance)/(viewInspections)/(managePlans) from the list table to the existing handlers', () => {
    fixture.detectChanges();
    spyOn(component as any, 'openEditModal');
    spyOn(component as any, 'openDeleteModal');
    spyOn(component as any, 'viewMaintenanceForVehicle');
    spyOn(component as any, 'viewInspectionsForVehicle');
    spyOn(component as any, 'viewPlansForVehicle');

    const table = fixture.debugElement.query(By.css('app-vehicle-list-table'));
    const row = { id: 2, vehicleNumber: 'V2' };
    table.triggerEventHandler('edit', row);
    table.triggerEventHandler('delete', row);
    table.triggerEventHandler('manageMaintenance', row);
    table.triggerEventHandler('viewInspections', row);
    table.triggerEventHandler('managePlans', row);

    expect((component as any).openEditModal).toHaveBeenCalledWith(row);
    expect((component as any).openDeleteModal).toHaveBeenCalledWith(row);
    expect((component as any).viewMaintenanceForVehicle).toHaveBeenCalledWith(row);
    expect((component as any).viewInspectionsForVehicle).toHaveBeenCalledWith(row);
    expect((component as any).viewPlansForVehicle).toHaveBeenCalledWith(row);
  });

  it('delegates (closed) from the form modal to onFormModalClosed', () => {
    fixture.detectChanges();
    spyOn(component as any, 'onFormModalClosed');

    const modal = fixture.debugElement.query(By.css('app-vehicle-form-modal'));
    modal.triggerEventHandler('closed', undefined);

    expect((component as any).onFormModalClosed).toHaveBeenCalled();
  });

  it('delegates (confirm)/(cancel) from the delete modal to confirmDelete/closeDeleteModal', () => {
    fixture.detectChanges();
    spyOn(component as any, 'confirmDelete');
    spyOn(component as any, 'closeDeleteModal');

    const modal = fixture.debugElement.query(By.css('app-vehicle-delete-modal'));
    modal.triggerEventHandler('confirm', undefined);
    modal.triggerEventHandler('cancel', undefined);

    expect((component as any).confirmDelete).toHaveBeenCalled();
    expect((component as any).closeDeleteModal).toHaveBeenCalled();
  });
});

// OBRS-357: the INSPECTION_DEFECT_REPORTED notification deep-link's landing.
describe('VehiclesPageComponent — inspection deep-link (?fromInspection, OBRS-357)', () => {
  it('does not call the resolver on an ordinary entry with no query param', () => {
    const adminApi = makeDraftApi();
    const component = makeComponent(makeStoreStub(makeData()), adminApi);

    component.ngOnInit();

    expect(adminApi.getInspectionMaintenanceDraft).not.toHaveBeenCalled();
    expect(component['activeTab']).toBe('list');
  });

  it('resolves the inspection id from the query param', () => {
    const adminApi = makeDraftApi();
    const component = makeComponent(
      makeStoreStub(makeData()),
      adminApi,
      makeRouteStub({ fromInspection: '5' })
    );

    component.ngOnInit();

    expect(adminApi.getInspectionMaintenanceDraft).toHaveBeenCalledWith(5);
  });

  // The likeliest real case: the bell is in the topbar of THIS page, so
  // clicking the notification here is a param-only navigation that reuses the
  // component - ngOnInit never runs a second time.
  it('reacts to a query-param-only navigation while already on the vehicles page', () => {
    const paramMap = new BehaviorSubject(convertToParamMap({}));
    const adminApi = makeDraftApi();
    const component = makeComponent(makeStoreStub(makeData()), adminApi, {
      queryParamMap: paramMap,
    });
    component.ngOnInit();
    expect(adminApi.getInspectionMaintenanceDraft).not.toHaveBeenCalled();

    paramMap.next(convertToParamMap({ fromInspection: '5' }));

    expect(adminApi.getInspectionMaintenanceDraft).toHaveBeenCalledWith(5);
  });

  it('ignores a non-numeric or non-positive fromInspection instead of calling the API', () => {
    const adminApi = makeDraftApi();
    const component = makeComponent(
      makeStoreStub(makeData()),
      adminApi,
      makeRouteStub({ fromInspection: 'not-a-number' })
    );

    component.ngOnInit();

    expect(adminApi.getInspectionMaintenanceDraft).not.toHaveBeenCalled();
  });

  it('focuses the vehicle, opens the maintenance tab and hands the panel the draft', async () => {
    const component = makeComponent(
      makeStoreStub(makeData()),
      makeDraftApi(1),
      makeRouteStub({ fromInspection: '5' })
    );
    component.ngOnInit();

    await component['resolveInspectionDraft'](5);

    expect(component['focusedVehicle']?.id).toBe(1);
    expect(component['activeTab']).toBe('maintenance');
    expect(component['maintenanceDraft']).toEqual({
      reason: 'Repair from the vehicle inspection on 21 Jul 2026 10:00 (2 defect(s))',
      notes: '• Brakes: worn\n• Tyres: bald',
      sourceInspectionId: 5,
    });
  });

  // The draft fetch and the vehicles list race. This is the order the other
  // test cannot cover: the draft wins, and there is no row to focus yet.
  it('waits for the vehicle rows when the draft resolves first, then focuses', async () => {
    const store = makeStoreStub(null);
    const component = makeComponent(store, makeDraftApi(1), makeRouteStub({ fromInspection: '5' }));
    component.ngOnInit();

    await component['resolveInspectionDraft'](5);

    expect(component['focusedVehicle']).toBeNull();
    expect(component['activeTab']).toBe('list');

    store.data$.next(makeData());

    expect(component['focusedVehicle']?.id).toBe(1);
    expect(component['activeTab']).toBe('maintenance');
  });

  it('surfaces an error instead of silently ignoring the link when the resolver fails', async () => {
    const error = jasmine.createSpy('error').and.resolveTo(undefined);
    const adminApi = {
      getInspectionMaintenanceDraft: jasmine
        .createSpy('getInspectionMaintenanceDraft')
        .and.returnValue(throwError(() => new Error('boom'))),
    };
    const component = makeComponent(
      makeStoreStub(makeData()),
      adminApi,
      makeRouteStub({ fromInspection: '5' }),
      { success: () => Promise.resolve(), error }
    );
    component.ngOnInit();

    await component['resolveInspectionDraft'](5);

    expect(error).toHaveBeenCalled();
    expect(component['maintenanceDraft']).toBeNull();
  });

  it('clearing the focused vehicle drops the draft, so a manual re-focus opens no modal', async () => {
    const component = makeComponent(
      makeStoreStub(makeData()),
      makeDraftApi(1),
      makeRouteStub({ fromInspection: '5' })
    );
    component.ngOnInit();
    await component['resolveInspectionDraft'](5);

    component['clearFocusedVehicle']();

    expect(component['maintenanceDraft']).toBeNull();
    expect(component['activeTab']).toBe('list');
  });
});
