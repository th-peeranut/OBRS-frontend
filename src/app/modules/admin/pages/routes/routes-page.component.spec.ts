import { RoutesPageComponent } from './routes-page.component';
import { RouteRow } from './routes.mappers';
import { createTranslateStub } from '../../../../testing/test-stubs';
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
