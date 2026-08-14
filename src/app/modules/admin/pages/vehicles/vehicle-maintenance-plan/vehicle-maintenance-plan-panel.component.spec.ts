import { FormBuilder } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AppVehicleMaintenancePlanPanelComponent } from './vehicle-maintenance-plan-panel.component';
import { AdminVehicleMaintenancePlanDto } from '../../../../../services/admin/admin-api.service';
import { createTranslateStub } from '../../../../../testing/test-stubs';
import { Option, toPartOptions } from './vehicle-maintenance-plan.mappers';

function createAlertServiceStub(): any {
  return {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
    confirm: jasmine.createSpy('confirm').and.resolveTo(true),
  };
}

function createStoreStub(initial: AdminVehicleMaintenancePlanDto[] | null = []): any {
  const dataSubject = new BehaviorSubject<AdminVehicleMaintenancePlanDto[] | null>(initial);
  return {
    data$: dataSubject.asObservable(),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    get hasValue() {
      return dataSubject.value !== null;
    },
    setVehicleId: jasmine.createSpy('setVehicleId'),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    next: (value: AdminVehicleMaintenancePlanDto[]) => dataSubject.next(value),
  };
}

const PART_OPTIONS: Option[] = toPartOptions({
  engineOil: 'Engine oil',
  oilFilter: 'Oil filter',
  airFilter: 'Air filter',
  cabinAirFilter: 'Cabin air filter',
  fuelFilter: 'Fuel filter',
  sparkPlugs: 'Spark plugs',
  brakePads: 'Brake pads',
  brakeFluid: 'Brake fluid',
  tires: 'Tires',
  battery: 'Battery',
  coolant: 'Coolant',
  transmissionFluid: 'Transmission fluid',
  timingBelt: 'Timing belt',
});

function buildRecord(overrides: Partial<AdminVehicleMaintenancePlanDto> = {}): AdminVehicleMaintenancePlanDto {
  return {
    id: 1,
    vehicleId: 42,
    part: 'BRAKE_PADS',
    intervalKm: 20000,
    intervalDays: null,
    lastDoneKm: 15000,
    lastDoneDate: '2026-06-01',
    active: true,
    nextDueKm: 35000,
    nextDueDate: null,
    ...overrides,
  };
}

function createComponent(
  adminApiServiceStub: any = {},
  storeStub: any = createStoreStub([]),
  alertServiceStub: any = createAlertServiceStub(),
  canWrite = true
): AppVehicleMaintenancePlanPanelComponent {
  const component = new AppVehicleMaintenancePlanPanelComponent(
    adminApiServiceStub,
    new FormBuilder(),
    alertServiceStub,
    createTranslateStub(),
    storeStub
  );
  component.vehicleId = 42;
  component.vehicleLabel = 'V-001';
  component.canWrite = canWrite;
  component.partOptions = PART_OPTIONS;
  component.ngOnChanges({ vehicleId: {} as any, partOptions: {} as any });
  component.ngOnInit();
  return component;
}

describe('AppVehicleMaintenancePlanPanelComponent — single-owner re-bind (OBRS-1333)', () => {
  it('ngOnChanges on vehicleId calls store.setVehicleId() and refreshes', () => {
    const store = createStoreStub([]);
    createComponent({}, store);

    expect(store.setVehicleId).toHaveBeenCalledWith(42);
    expect(store.refresh).toHaveBeenCalled();
  });
});

describe('AppVehicleMaintenancePlanPanelComponent — loading/empty/error states', () => {
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

  it('surfaces LOAD_MAINTENANCE_PLANS_FAILED only when there is no cached data', () => {
    const store = createStoreStub(null);
    const component = createComponent({}, store);

    store.error$.next(true);

    expect((component as any).errorMessage).toBe('ADMIN.MESSAGES.LOAD_MAINTENANCE_PLANS_FAILED');
  });

  it('maps the raw DTOs to localized rows on data arrival', () => {
    const store = createStoreStub([buildRecord()]);
    const component = createComponent({}, store);

    expect((component as any).rows.length).toBe(1);
    expect((component as any).rows[0].partLabel).toBe('Brake pads');
  });
});

describe('AppVehicleMaintenancePlanPanelComponent — write gating', () => {
  it('openCreateModal() / openEditModal() are no-ops when canWrite is false', () => {
    const component = createComponent({}, createStoreStub([buildRecord()]), createAlertServiceStub(), false);

    component['openCreateModal']();
    expect((component as any).isFormModalOpen).toBeFalse();

    component['openEditModal']((component as any).rows[0]);
    expect((component as any).isFormModalOpen).toBeFalse();
  });

  it('toggleActive() is a no-op when canWrite is false', async () => {
    const adminApiServiceStub = { setVehicleMaintenancePlanActive: jasmine.createSpy('setVehicleMaintenancePlanActive') };
    const component = createComponent(adminApiServiceStub, createStoreStub([buildRecord()]), createAlertServiceStub(), false);

    await component['toggleActive']((component as any).rows[0]);

    expect(adminApiServiceStub.setVehicleMaintenancePlanActive).not.toHaveBeenCalled();
  });
});

describe('AppVehicleMaintenancePlanPanelComponent — create/edit modal', () => {
  it('openCreateModal() resets the form with no pre-seeded part (design-system §3.1)', () => {
    const component = createComponent();

    component['openCreateModal']();

    expect((component as any).isFormModalOpen).toBeTrue();
    expect((component as any).isEditMode).toBeFalse();
    expect((component as any).planForm.get('part').value).toBe('');
  });

  it('openEditModal() seeds the form synchronously from the row in hand (no second fetch)', () => {
    const store = createStoreStub([buildRecord({ intervalKm: null, intervalDays: 180 })]);
    const component = createComponent({}, store);

    component['openEditModal']((component as any).rows[0]);

    expect((component as any).isFormModalOpen).toBeTrue();
    expect((component as any).isEditMode).toBeTrue();
    expect((component as any).planForm.get('part').value).toBe('BRAKE_PADS');
    expect((component as any).planForm.get('intervalDays').value).toBe(180);
  });
});

describe('AppVehicleMaintenancePlanPanelComponent — submitPlan() (invalid-form feedback)', () => {
  it('on invalid submit (no part chosen): marks all touched and warns via AlertService (no silent no-op)', async () => {
    const alertServiceStub = createAlertServiceStub();
    const component = createComponent({}, createStoreStub([]), alertServiceStub);
    component['openCreateModal']();

    await component['submitPlan']();

    expect(alertServiceStub.warning).toHaveBeenCalledWith('ADMIN.VALIDATION.FORM_INVALID');
    expect((component as any).planForm.get('part').touched).toBeTrue();
  });

  it('blocks submit when both intervalKm and intervalDays are empty (cross-field hasIntervalError)', async () => {
    const adminApiServiceStub = { createVehicleMaintenancePlan: jasmine.createSpy('createVehicleMaintenancePlan') };
    const alertServiceStub = createAlertServiceStub();
    const component = createComponent(adminApiServiceStub, createStoreStub([]), alertServiceStub);
    component['openCreateModal']();
    (component as any).planForm.patchValue({ part: 'BRAKE_PADS' });

    await component['submitPlan']();

    expect(adminApiServiceStub.createVehicleMaintenancePlan).not.toHaveBeenCalled();
    expect(alertServiceStub.warning).toHaveBeenCalled();
    expect((component as any).hasIntervalError()).toBeTrue();
  });

  it('create: calls createVehicleMaintenancePlan with the built payload, then refreshes (no optimistic splice)', async () => {
    const adminApiServiceStub = {
      createVehicleMaintenancePlan: jasmine
        .createSpy('createVehicleMaintenancePlan')
        .and.returnValue(of({ code: 200, message: 'OK', data: { planId: 99 } })),
    };
    const store = createStoreStub([]);
    const alertServiceStub = createAlertServiceStub();
    const component = createComponent(adminApiServiceStub, store, alertServiceStub);
    component['openCreateModal']();
    (component as any).planForm.patchValue({ part: 'BRAKE_PADS', intervalKm: 20000 });

    await component['submitPlan']();

    expect(adminApiServiceStub.createVehicleMaintenancePlan).toHaveBeenCalledWith(
      42,
      jasmine.objectContaining({ part: 'BRAKE_PADS', intervalKm: 20000 })
    );
    expect(store.refresh).toHaveBeenCalled();
    expect(alertServiceStub.success).toHaveBeenCalledWith('ADMIN.MESSAGES.CREATED');
    expect((component as any).isFormModalOpen).toBeFalse();
  });

  it('edit: calls updateVehicleMaintenancePlan with the selected record id', async () => {
    const adminApiServiceStub = {
      updateVehicleMaintenancePlan: jasmine
        .createSpy('updateVehicleMaintenancePlan')
        .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    };
    const store = createStoreStub([buildRecord({ id: 9 })]);
    const component = createComponent(adminApiServiceStub, store);
    component['openEditModal']((component as any).rows[0]);

    await component['submitPlan']();

    expect(adminApiServiceStub.updateVehicleMaintenancePlan).toHaveBeenCalledWith(
      42,
      9,
      jasmine.objectContaining({ part: 'BRAKE_PADS' })
    );
    expect(store.refresh).toHaveBeenCalled();
  });

  it('on failure: closes the modal and surfaces the backend message via AlertService.error() (defense-in-depth for the interval.at-least-one 400)', async () => {
    const adminApiServiceStub = {
      createVehicleMaintenancePlan: jasmine
        .createSpy('createVehicleMaintenancePlan')
        .and.returnValue(
          throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Bad request' } }))
        ),
    };
    const alertServiceStub = createAlertServiceStub();
    const component = createComponent(adminApiServiceStub, createStoreStub([]), alertServiceStub);
    component['openCreateModal']();
    (component as any).planForm.patchValue({ part: 'BRAKE_PADS', intervalKm: 20000 });

    await component['submitPlan']();

    expect(alertServiceStub.error).toHaveBeenCalledWith('Bad request');
    expect((component as any).isFormModalOpen).toBeFalse();
  });
});

describe('AppVehicleMaintenancePlanPanelComponent — toggleActive() (OBRS-509 pattern)', () => {
  it('active row: confirms before deactivating, then calls setVehicleMaintenancePlanActive(false)', async () => {
    const adminApiServiceStub = {
      setVehicleMaintenancePlanActive: jasmine
        .createSpy('setVehicleMaintenancePlanActive')
        .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    };
    const alertServiceStub = createAlertServiceStub();
    const store = createStoreStub([buildRecord({ id: 5, active: true })]);
    const component = createComponent(adminApiServiceStub, store, alertServiceStub);

    await component['toggleActive']((component as any).rows[0]);

    expect(alertServiceStub.confirm).toHaveBeenCalled();
    expect(adminApiServiceStub.setVehicleMaintenancePlanActive).toHaveBeenCalledWith(42, 5, false);
    expect(store.refresh).toHaveBeenCalled();
  });

  it('inactive row: restores WITHOUT a confirm prompt, calling setVehicleMaintenancePlanActive(true)', async () => {
    const adminApiServiceStub = {
      setVehicleMaintenancePlanActive: jasmine
        .createSpy('setVehicleMaintenancePlanActive')
        .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    };
    const alertServiceStub = createAlertServiceStub();
    const store = createStoreStub([buildRecord({ id: 5, active: false })]);
    const component = createComponent(adminApiServiceStub, store, alertServiceStub);

    await component['toggleActive']((component as any).rows[0]);

    expect(alertServiceStub.confirm).not.toHaveBeenCalled();
    expect(adminApiServiceStub.setVehicleMaintenancePlanActive).toHaveBeenCalledWith(42, 5, true);
  });

  it('does not call the API when the confirm dialog is cancelled', async () => {
    const adminApiServiceStub = { setVehicleMaintenancePlanActive: jasmine.createSpy('setVehicleMaintenancePlanActive') };
    const alertServiceStub = createAlertServiceStub();
    alertServiceStub.confirm.and.resolveTo(false);
    const store = createStoreStub([buildRecord({ id: 5, active: true })]);
    const component = createComponent(adminApiServiceStub, store, alertServiceStub);

    await component['toggleActive']((component as any).rows[0]);

    expect(adminApiServiceStub.setVehicleMaintenancePlanActive).not.toHaveBeenCalled();
  });
});
