import { FormBuilder } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AppVehicleMaintenancePanelComponent } from './vehicle-maintenance-panel.component';
import { AdminLookupDto, AdminVehicleMaintenanceDto } from '../../../../../services/admin/admin-api.service';
import { createTranslateStub } from '../../../../../testing/test-stubs';

function createAlertServiceStub(): any {
  return {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
  };
}

function createStoreStub(initial: AdminVehicleMaintenanceDto[] | null = []): any {
  const dataSubject = new BehaviorSubject<AdminVehicleMaintenanceDto[] | null>(initial);
  return {
    data$: dataSubject.asObservable(),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    get hasValue() {
      return dataSubject.value !== null;
    },
    setVehicleId: jasmine.createSpy('setVehicleId'),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    next: (value: AdminVehicleMaintenanceDto[]) => dataSubject.next(value),
  };
}

const STATUS_OPTIONS: AdminLookupDto[] = [
  { id: 5, category: 'maintenance_status', slug: 'scheduled', translations: [{ locale: 'en', label: 'Scheduled' }] },
  { id: 6, category: 'maintenance_status', slug: 'completed', translations: [{ locale: 'en', label: 'Completed' }] },
];

function buildRecord(overrides: Partial<AdminVehicleMaintenanceDto> = {}): AdminVehicleMaintenanceDto {
  return {
    id: 1,
    vehicleId: 42,
    reason: 'Brake inspection',
    startDate: '2026-07-01',
    endDate: null,
    nextDueDate: null,
    // Flat slug string — matches the live backend VehicleMaintenanceRespDto,
    // NOT a Lookup object.
    maintenanceStatus: 'scheduled',
    notes: null,
    ...overrides,
  };
}

function createComponent(
  adminApiServiceStub: any = {},
  storeStub: any = createStoreStub([]),
  alertServiceStub: any = createAlertServiceStub(),
  canWrite = true
): AppVehicleMaintenancePanelComponent {
  const component = new AppVehicleMaintenancePanelComponent(
    adminApiServiceStub,
    new FormBuilder(),
    alertServiceStub,
    createTranslateStub(),
    storeStub
  );
  component.vehicleId = 42;
  component.vehicleLabel = 'V-001';
  component.canWrite = canWrite;
  component.statusOptions = STATUS_OPTIONS;
  component.ngOnChanges({ vehicleId: {} as any, statusOptions: {} as any });
  component.ngOnInit();
  return component;
}

describe('AppVehicleMaintenancePanelComponent — single-owner re-bind (OBRS-209)', () => {
  it('ngOnChanges on vehicleId calls store.setVehicleId() and refreshes', () => {
    const store = createStoreStub([]);
    createComponent({}, store);

    expect(store.setVehicleId).toHaveBeenCalledWith(42);
    expect(store.refresh).toHaveBeenCalled();
  });
});

describe('AppVehicleMaintenancePanelComponent — loading/empty/error states', () => {
  it('shows the loading skeleton on first visit (no cache, fetch in flight)', () => {
    const store = createStoreStub(null);
    const component = createComponent({}, store);

    store.refreshing$.next(true);

    expect((component as any).isLoading).toBeTrue();
  });

  it('is empty when the store resolves to [] (replaces the table, not a zero-row table)', () => {
    const store = createStoreStub([]);
    const component = createComponent({}, store);

    expect((component as any).isEmpty).toBeTrue();
    expect((component as any).rows.length).toBe(0);
  });

  it('surfaces LOAD_MAINTENANCE_FAILED only when there is no cached data', () => {
    const store = createStoreStub(null);
    const component = createComponent({}, store);

    store.error$.next(true);

    expect((component as any).errorMessage).toBe('ADMIN.MESSAGES.LOAD_MAINTENANCE_FAILED');
  });

  it('maps the raw DTOs to localized rows on data arrival', () => {
    const store = createStoreStub([buildRecord()]);
    const component = createComponent({}, store);

    expect((component as any).rows.length).toBe(1);
    expect((component as any).rows[0].status).toBe('Scheduled');
    expect((component as any).statusDropdownOptions).toEqual([
      { code: 'scheduled', label: 'Scheduled' },
      { code: 'completed', label: 'Completed' },
    ]);
  });
});

describe('AppVehicleMaintenancePanelComponent — write gating', () => {
  it('openCreateModal() / openEditModal() are no-ops when canWrite is false', () => {
    const component = createComponent({}, createStoreStub([buildRecord()]), createAlertServiceStub(), false);

    component['openCreateModal']();
    expect((component as any).isFormModalOpen).toBeFalse();

    component['openEditModal']((component as any).rows[0]);
    expect((component as any).isFormModalOpen).toBeFalse();
  });
});

describe('AppVehicleMaintenancePanelComponent — create/edit modal', () => {
  it('openCreateModal() resets the form with no pre-seeded status (design-system §3.1)', () => {
    const component = createComponent();

    component['openCreateModal']();

    expect((component as any).isFormModalOpen).toBeTrue();
    expect((component as any).isEditMode).toBeFalse();
    expect((component as any).maintenanceForm.get('maintenanceStatus').value).toBe('');
  });

  it('openEditModal() seeds the form synchronously from the row in hand (no second fetch), pre-filling the status slug', () => {
    const adminApiServiceStub = { getVehicleMaintenanceById: jasmine.createSpy('getVehicleMaintenanceById') };
    const store = createStoreStub([
      buildRecord({ reason: 'Oil change', endDate: '2026-07-05', maintenanceStatus: 'completed' }),
    ]);
    const component = createComponent(adminApiServiceStub, store);

    component['openEditModal']((component as any).rows[0]);

    expect((component as any).isFormModalOpen).toBeTrue();
    expect((component as any).isEditMode).toBeTrue();
    expect((component as any).maintenanceForm.get('reason').value).toBe('Oil change');
    expect((component as any).maintenanceForm.get('maintenanceStatus').value).toBe('completed');
    expect(adminApiServiceStub.getVehicleMaintenanceById).not.toHaveBeenCalled();
  });
});

describe('AppVehicleMaintenancePanelComponent — submitMaintenance() (AC8 invalid-form feedback)', () => {
  it('on invalid submit: marks all touched and warns via AlertService (no silent no-op)', async () => {
    const alertServiceStub = createAlertServiceStub();
    const component = createComponent({}, createStoreStub([]), alertServiceStub);
    component['openCreateModal'](); // form is empty/invalid: reason + startDate + status required

    await component['submitMaintenance']();

    expect(alertServiceStub.warning).toHaveBeenCalledWith('ADMIN.VALIDATION.FORM_INVALID');
    expect((component as any).maintenanceForm.get('reason').touched).toBeTrue();
  });

  it('blocks submit on a date-range error before making a request', async () => {
    const adminApiServiceStub = { createVehicleMaintenance: jasmine.createSpy('createVehicleMaintenance') };
    const alertServiceStub = createAlertServiceStub();
    const component = createComponent(adminApiServiceStub, createStoreStub([]), alertServiceStub);
    component['openCreateModal']();
    const form = (component as any).maintenanceForm;
    form.patchValue({
      reason: 'Brake inspection',
      startDate: new Date(2026, 6, 10),
      endDate: new Date(2026, 6, 1),
      maintenanceStatus: 'scheduled',
    });

    await component['submitMaintenance']();

    expect(adminApiServiceStub.createVehicleMaintenance).not.toHaveBeenCalled();
    expect(alertServiceStub.warning).toHaveBeenCalled();
  });

  it('create: calls createVehicleMaintenance with the built payload, then refreshes (no optimistic splice)', async () => {
    const adminApiServiceStub = {
      createVehicleMaintenance: jasmine
        .createSpy('createVehicleMaintenance')
        .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    };
    const store = createStoreStub([]);
    const alertServiceStub = createAlertServiceStub();
    const component = createComponent(adminApiServiceStub, store, alertServiceStub);
    component['openCreateModal']();
    (component as any).maintenanceForm.patchValue({
      reason: 'Brake inspection',
      startDate: new Date(2026, 6, 1),
      maintenanceStatus: 'scheduled',
    });

    await component['submitMaintenance']();

    expect(adminApiServiceStub.createVehicleMaintenance).toHaveBeenCalledWith(
      42,
      jasmine.objectContaining({ reason: 'Brake inspection', startDate: '2026-07-01', maintenanceStatus: 'scheduled' })
    );
    expect(store.refresh).toHaveBeenCalled();
    expect(alertServiceStub.success).toHaveBeenCalledWith('ADMIN.MESSAGES.CREATED');
    expect((component as any).isFormModalOpen).toBeFalse();
  });

  it('edit: calls updateVehicleMaintenance with the selected record id', async () => {
    const adminApiServiceStub = {
      updateVehicleMaintenance: jasmine
        .createSpy('updateVehicleMaintenance')
        .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    };
    const store = createStoreStub([buildRecord({ id: 9 })]);
    const component = createComponent(adminApiServiceStub, store);
    component['openEditModal']((component as any).rows[0]);

    await component['submitMaintenance']();

    expect(adminApiServiceStub.updateVehicleMaintenance).toHaveBeenCalledWith(
      42,
      9,
      jasmine.objectContaining({ reason: 'Brake inspection' })
    );
    expect(store.refresh).toHaveBeenCalled();
  });

  it('on failure: closes the modal and surfaces the backend message via AlertService.error()', async () => {
    const adminApiServiceStub = {
      createVehicleMaintenance: jasmine
        .createSpy('createVehicleMaintenance')
        .and.returnValue(
          throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Bad request' } }))
        ),
    };
    const alertServiceStub = createAlertServiceStub();
    const component = createComponent(adminApiServiceStub, createStoreStub([]), alertServiceStub);
    component['openCreateModal']();
    (component as any).maintenanceForm.patchValue({
      reason: 'Brake inspection',
      startDate: new Date(2026, 6, 1),
      maintenanceStatus: 'scheduled',
    });

    await component['submitMaintenance']();

    expect(alertServiceStub.error).toHaveBeenCalledWith('Bad request');
    expect((component as any).isFormModalOpen).toBeFalse();
  });
});
