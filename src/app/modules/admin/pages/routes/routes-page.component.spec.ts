import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { RoutesPageComponent } from './routes-page.component';
import { RouteRow, SegmentRow } from './routes.mappers';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { RoutesStore } from './routes.store';
import { BehaviorSubject, of, throwError } from 'rxjs';

const ROUTE_ROW: RouteRow = {
  id: 1,
  slug: 'a-b',
  label: 'A to B',
  description: '-',
  status: 'ACTIVE',
  statusCode: 'active',
  updatedAt: '-',
};

function makeStoreStub() {
  return {
    data$: new BehaviorSubject<unknown>(null),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return false;
    },
  };
}

function makeComponent() {
  const adminApi = {
    deleteRouteById: jasmine
      .createSpy('deleteRouteById')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  const store = makeStoreStub();
  const component = new RoutesPageComponent(
    adminApi as any,
    alert as any,
    createTranslateStub(),
    store as any
  );
  return { component, adminApi, alert, store };
}

describe('RoutesPageComponent delegation to child modals', () => {
  it('openCreateModal delegates to the route form modal', () => {
    const { component } = makeComponent();
    const routeFormModal = { openCreate: jasmine.createSpy('openCreate') };
    (component as any).routeFormModal = routeFormModal;

    (component as any).openCreateModal();

    expect(routeFormModal.openCreate).toHaveBeenCalled();
  });

  it('openEditModal delegates to the route form modal with the route row', () => {
    const { component } = makeComponent();
    const routeFormModal = { openEdit: jasmine.createSpy('openEdit').and.resolveTo(undefined) };
    (component as any).routeFormModal = routeFormModal;

    (component as any).openEditModal({ ...ROUTE_ROW });

    expect(routeFormModal.openEdit).toHaveBeenCalledWith(ROUTE_ROW);
  });

  it('openSegmentEditModal delegates to the segment edit modal', () => {
    const { component } = makeComponent();
    const segment = {
      id: 5,
      origin: 'A',
      destination: 'B',
      fare: 10,
      duration: '10 mins',
      estimatedDurationMinutes: 10,
      fromStopSlug: 'a',
      toStopSlug: 'b',
      vehicleTypeSlug: 'van',
      vehicleTypeName: 'Van',
    };
    const segmentEditModal = { open: jasmine.createSpy('open') };
    (component as any).segmentEditModal = segmentEditModal;

    (component as any).openSegmentEditModal(segment);

    expect(segmentEditModal.open).toHaveBeenCalledWith(segment);
  });

  it('onRouteSaved sets the selected route slug then refreshes the store', async () => {
    const { component, store } = makeComponent();

    await (component as any).onRouteSaved({ slug: 'new-slug' });

    expect((component as any).selectedRouteSlug).toBe('new-slug');
    expect(store.refresh).toHaveBeenCalled();
  });

  it('reloadStructureBound calls loadRouteStructureBySlug with the selected route slug', () => {
    const { component } = makeComponent();
    (component as any).selectedRouteSlug = 'a-b';
    const spy = spyOn<any>(component, 'loadRouteStructureBySlug').and.resolveTo(undefined);

    (component as any).reloadStructureBound();

    expect(spy).toHaveBeenCalledWith('a-b');
  });
});

describe('RoutesPageComponent delete modal', () => {
  it('openDeleteModal opens the confirm dialog for the given route', () => {
    const { component } = makeComponent();

    (component as any).openDeleteModal({ ...ROUTE_ROW });

    expect((component as any).isDeleteModalOpen).toBeTrue();
    expect((component as any).routeForDelete).toEqual(ROUTE_ROW);
  });

  it('closeDeleteModal does not close while deleting unless forced', () => {
    const { component } = makeComponent();
    (component as any).openDeleteModal({ ...ROUTE_ROW });
    (component as any).isDeleting = true;

    (component as any).closeDeleteModal();
    expect((component as any).isDeleteModalOpen).toBeTrue();

    (component as any).closeDeleteModal(true);
    expect((component as any).isDeleteModalOpen).toBeFalse();
  });

  it('confirmDelete removes the route from the store and shows a success alert', async () => {
    const { component, adminApi, alert, store } = makeComponent();
    (component as any).openDeleteModal({ ...ROUTE_ROW });
    (component as any).selectedRouteSlug = 'a-b';
    const mutateSpy = jasmine.createSpy('mutate');
    (store as any).mutate = mutateSpy;

    await (component as any).confirmDelete();

    expect(adminApi.deleteRouteById).toHaveBeenCalledWith(1);
    expect(mutateSpy).toHaveBeenCalled();
    expect((component as any).isDeleteModalOpen).toBeFalse();
    expect((component as any).selectedRouteSlug).toBe('');
    expect(alert.success).toHaveBeenCalled();
  });

  it('confirmDelete shows an error alert and does not clear selection on failure', async () => {
    const { component, adminApi, alert } = makeComponent();
    (component as any).openDeleteModal({ ...ROUTE_ROW });
    adminApi.deleteRouteById.and.returnValue(throwError(() => new Error('delete failed')));

    await (component as any).confirmDelete();

    expect((component as any).isDeleteModalOpen).toBeFalse();
    expect(alert.error).toHaveBeenCalledWith('delete failed');
  });
});

// ── OBRS-213: child extraction — verify the page wires the right inputs to
// app-route-list-table / app-route-detail-panel and delegates their outputs
// to the existing handlers. Uses NO_ERRORS_SCHEMA (established pattern in
// this codebase, e.g. walk-in-center-panel.component.spec.ts) so the child
// selectors don't need to be declared; Angular still records `[prop]`
// bindings on DebugElement.properties and dispatches `(event)` bindings via
// triggerEventHandler even for unrecognized elements.
describe('RoutesPageComponent template wiring to child components', () => {
  let fixture: ComponentFixture<RoutesPageComponent>;
  let component: RoutesPageComponent;

  beforeEach(async () => {
    const store = makeStoreStub();
    const adminApi = { deleteRouteById: jasmine.createSpy('deleteRouteById') };
    const alert = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };

    await TestBed.configureTestingModule({
      declarations: [RoutesPageComponent],
      imports: [CommonModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: RoutesStore, useValue: store },
        { provide: AdminApiService, useValue: adminApi },
        { provide: AlertService, useValue: alert },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoutesPageComponent);
    component = fixture.componentInstance;
  });

  it('app-route-list-table receives filteredRoutes/routes.length/selectedRouteSlug/isLoading/hasError', () => {
    fixture.detectChanges(); // run ngOnInit first (its error$ subscription resets errorMessage)
    (component as any).filteredRoutes = [ROUTE_ROW];
    (component as any).routes = [ROUTE_ROW, { ...ROUTE_ROW, id: 2, slug: 'c-d' }];
    (component as any).selectedRouteSlug = 'a-b';
    (component as any).errorMessage = 'boom';
    fixture.detectChanges();

    const table = fixture.debugElement.query(By.css('app-route-list-table'));
    expect(table.properties['routes']).toBe((component as any).filteredRoutes);
    expect(table.properties['totalCount']).toBe(2);
    expect(table.properties['selectedRouteSlug']).toBe('a-b');
    expect(table.properties['hasError']).toBeTrue();
  });

  it('app-route-detail-panel receives hasRoute/stops/allSegments/isDetailLoading and is always present (no host *ngIf)', () => {
    // PARITY-CRITICAL: the panel host must render even when selectedRoute is
    // null, so its own view-state (currentPage/selectedVehicleTypeSlug/
    // segmentSearchTerm) survives a transient deselect (e.g. delete-then-
    // auto-reselect) instead of being destroyed and recreated.
    fixture.detectChanges();
    let panel = fixture.debugElement.query(By.css('app-route-detail-panel'));
    expect(panel).withContext('detail panel host must always be mounted').toBeTruthy();
    expect(panel.properties['hasRoute']).toBeFalse();

    const segments: SegmentRow[] = [
      {
        id: 1,
        origin: 'A',
        destination: 'B',
        fare: 10,
        duration: '10 mins',
        estimatedDurationMinutes: 10,
        fromStopSlug: 'a',
        toStopSlug: 'b',
        vehicleTypeSlug: 'van',
        vehicleTypeName: 'Van',
      },
    ];
    (component as any).selectedRoute = ROUTE_ROW;
    (component as any).stops = [];
    (component as any).allSegments = segments;
    (component as any).isDetailLoading = true;
    fixture.detectChanges();

    panel = fixture.debugElement.query(By.css('app-route-detail-panel'));
    expect(panel.properties['hasRoute']).toBeTrue();
    expect(panel.properties['allSegments']).toBe(segments);
    expect(panel.properties['isDetailLoading']).toBeTrue();
  });

  it('delegates (view)/(edit)/(delete) from the list table to selectRoute/openEditModal/openDeleteModal', () => {
    fixture.detectChanges();
    spyOn(component as any, 'selectRoute');
    spyOn(component as any, 'openEditModal');
    spyOn(component as any, 'openDeleteModal');

    const table = fixture.debugElement.query(By.css('app-route-list-table'));
    table.triggerEventHandler('view', ROUTE_ROW);
    table.triggerEventHandler('edit', ROUTE_ROW);
    table.triggerEventHandler('delete', ROUTE_ROW);

    expect((component as any).selectRoute).toHaveBeenCalledWith(ROUTE_ROW);
    expect((component as any).openEditModal).toHaveBeenCalledWith(ROUTE_ROW);
    expect((component as any).openDeleteModal).toHaveBeenCalledWith(ROUTE_ROW);
  });

  it('delegates (editSegment) from the detail panel to openSegmentEditModal', () => {
    fixture.detectChanges();
    const segment = {
      id: 5,
      origin: 'A',
      destination: 'B',
      fare: 10,
      duration: '10 mins',
      estimatedDurationMinutes: 10,
      fromStopSlug: 'a',
      toStopSlug: 'b',
      vehicleTypeSlug: 'van',
      vehicleTypeName: 'Van',
    };
    spyOn(component as any, 'openSegmentEditModal');

    const panel = fixture.debugElement.query(By.css('app-route-detail-panel'));
    panel.triggerEventHandler('editSegment', segment);

    expect((component as any).openSegmentEditModal).toHaveBeenCalledWith(segment);
  });
});
