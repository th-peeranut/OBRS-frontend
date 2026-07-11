import { SimpleChange } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { VehicleFormModalComponent } from './vehicle-form-modal.component';
import { AdminVehicleDto } from '../../../../../services/admin/admin-api.service';
import { VehicleRow } from '../vehicles-page.mappers';
import { ResponseAPI } from '../../../../../shared/interfaces/response.interface';
import { createTranslateStub } from '../../../../../testing/test-stubs';

const VAN_ROW: VehicleRow = {
  id: 1,
  vehicleTypeSlug: 'van',
  statusCode: 'active',
  vehicleNumber: 'V1',
  plate: 'ABC-123',
  vehicleType: 'Van',
  route: '-',
  status: 'Active',
};

function detailResponse(overrides: Partial<AdminVehicleDto> = {}): ResponseAPI<AdminVehicleDto> {
  return {
    code: 200,
    message: 'OK',
    data: {
      id: 1,
      numberPlate: 'SERVER-PLATE',
      vehicleNumber: 'V9',
      status: 'active',
      vehicleType: { id: 2, slug: 'bus' },
      ...overrides,
    },
  };
}

function makeComponent(getVehicleById$: Subject<ResponseAPI<AdminVehicleDto>>) {
  const adminApi = {
    getVehicleById: jasmine
      .createSpy('getVehicleById')
      .and.returnValue(getVehicleById$.asObservable()),
    createVehicle: jasmine
      .createSpy('createVehicle')
      .and.returnValue(of({ code: 201, message: 'Created', data: null })),
    updateVehicle: jasmine
      .createSpy('updateVehicle')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  const component = new VehicleFormModalComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  component.vehicleTypeOptions = [
    { code: 'van', label: 'Van' },
    { code: 'bus', label: 'Bus' },
  ];
  component.statusOptions = [
    { code: 'active', label: 'Active' },
    { code: 'pending', label: 'Pending' },
  ];
  component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
  return { component, adminApi, alert };
}

function openCreate(component: VehicleFormModalComponent): void {
  (component as any).isOpen = true;
  (component as any).mode = 'create';
  (component as any).selectedVehicle = null;
  component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
}

function openEdit(component: VehicleFormModalComponent, row: VehicleRow): void {
  (component as any).isOpen = true;
  (component as any).mode = 'edit';
  (component as any).selectedVehicle = row;
  component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
}

// initEditForm is the private async method ngOnChanges fires (without
// awaiting, like a template-driven callback would). Tests that need to await
// the detail fetch call it directly — same idiom as
// PromotionFormModalComponent's spec.
function openEditAwait(component: VehicleFormModalComponent, row: VehicleRow): Promise<void> {
  (component as any).isOpen = true;
  (component as any).mode = 'edit';
  (component as any).selectedVehicle = row;
  return (component as any).initEditForm(row);
}

function fillValidForm(component: VehicleFormModalComponent): void {
  const form = (component as any).vehicleForm;
  form.patchValue({
    vehicleType: 'van',
    numberPlate: 'NEW-PLATE',
    vehicleNumber: 'NEW-NUM',
    status: 'active',
  });
}

describe('VehicleFormModalComponent', () => {
  describe('create mode', () => {
    // NOTE: this is the flagged discrepancy vs. the promotions/user form
    // modals and vs. design-system.md §3.1 — the pre-split
    // VehiclesPageComponent.openCreateModal actually pre-seeded
    // vehicleType/status with the FIRST option's code (not an empty
    // placeholder). Reproduced verbatim; see the split report.
    it('opens with vehicleType/status pre-seeded to the first option (pre-existing behavior, not design-system §3.1 compliant)', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());

      openCreate(component);

      const form = (component as any).vehicleForm;
      expect(form.get('vehicleType').value).toBe('van');
      expect(form.get('status').value).toBe('active');
      expect(form.get('numberPlate').value).toBe('');
      expect(form.get('vehicleNumber').value).toBe('');
    });

    it('ignores unrelated input changes (e.g. option-list refresh) while the modal stays closed', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());

      component.vehicleTypeOptions = [{ code: 'bus', label: 'Bus' }];
      component.ngOnChanges({
        vehicleTypeOptions: new SimpleChange([], component.vehicleTypeOptions, false),
      });

      expect((component as any).isOpen).toBeFalse();
    });
  });

  describe('edit mode', () => {
    it('opens immediately with the row data, before the detail fetch resolves', () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component } = makeComponent(getVehicleById$);

      openEdit(component, { ...VAN_ROW });

      expect((component as any).isEditDetailLoading).toBeTrue();
      const form = (component as any).vehicleForm;
      expect(form.get('numberPlate').value).toBe('ABC-123');
    });

    it('patches server detail into untouched fields without clobbering user input', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      const form = (component as any).vehicleForm;

      // The admin starts editing before the detail arrives.
      form.get('numberPlate').setValue('USER-TYPED');
      form.get('numberPlate').markAsDirty();

      getVehicleById$.next(detailResponse());
      getVehicleById$.complete();
      await promise;

      // Untouched field is filled from the server detail...
      expect(form.get('vehicleNumber').value).toBe('V9');
      // ...but the field the user was editing is preserved.
      expect(form.get('numberPlate').value).toBe('USER-TYPED');
      expect((component as any).isEditDetailLoading).toBeFalse();
    });

    it('ignores a stale detail response once the modal has been closed', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      (component as any).isOpen = false;
      component.ngOnChanges({ isOpen: new SimpleChange(true, false, false) });

      getVehicleById$.next(detailResponse());
      getVehicleById$.complete();
      await promise;

      expect((component as any).isOpen).toBeFalse();
      expect((component as any).isEditDetailLoading).toBeFalse();
    });
  });

  describe('isFieldInvalid', () => {
    it('is false until the field is touched/dirty', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());
      openCreate(component);

      expect((component as any).isFieldInvalid('numberPlate')).toBeFalse();

      (component as any).vehicleForm.get('numberPlate').markAsTouched();
      expect((component as any).isFieldInvalid('numberPlate')).toBeTrue();
    });
  });

  describe('requestClose', () => {
    it('does not emit closed while submitting', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());
      openCreate(component);
      (component as any).isSubmitting = true;

      const closedSpy = jasmine.createSpy('closed');
      component.closed.subscribe(closedSpy);

      (component as any).requestClose();
      expect(closedSpy).not.toHaveBeenCalled();

      (component as any).isSubmitting = false;
      (component as any).requestClose();
      expect(closedSpy).toHaveBeenCalled();
    });
  });

  describe('submitVehicle', () => {
    // Byte-for-byte parity with the pre-split
    // VehiclesPageComponent.submitVehicle: API call -> close -> await
    // success alert -> THEN reloadStructure()/refresh LAST. The modal does
    // not stay open during the refresh.
    it('creates a vehicle, closes immediately, awaits the success alert, then reloadStructure() last', async () => {
      const order: string[] = [];
      const { component, adminApi, alert } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());
      adminApi.createVehicle.and.callFake(() => {
        order.push('create');
        return of({ code: 201, message: 'Created', data: null });
      });
      (component.reloadStructure as jasmine.Spy).and.callFake(async () => {
        order.push('reload');
      });
      alert.success.and.callFake(async () => {
        order.push('alert');
      });
      openCreate(component);
      fillValidForm(component);

      const closedSpy = jasmine.createSpy('closed');
      component.closed.subscribe(() => {
        order.push('closed');
        closedSpy();
      });

      await (component as any).submitVehicle();

      expect(order).toEqual(['create', 'closed', 'alert', 'reload']);
      expect(closedSpy).toHaveBeenCalled();
    });

    it('updates a vehicle by id when in edit mode', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());
      openEdit(component, { ...VAN_ROW });
      fillValidForm(component);

      await (component as any).submitVehicle();

      expect(adminApi.updateVehicle).toHaveBeenCalledWith(1, jasmine.any(Object));
      expect(component.reloadStructure).toHaveBeenCalled();
    });

    // NOTE (flagged discrepancy vs. PromotionFormModalComponent): the
    // pre-split VehiclesPageComponent.submitVehicle invalid guard only calls
    // markAllAsTouched() and returns — it never shows a warning alert. That
    // is reproduced verbatim here (no alertService.warning call exists on
    // this component at all).
    it('marks all fields touched and does not submit or alert when the form is invalid', async () => {
      const { component, adminApi, alert } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());
      openCreate(component);
      (component as any).vehicleForm.patchValue({ numberPlate: '', vehicleNumber: '' });

      await (component as any).submitVehicle();

      expect(adminApi.createVehicle).not.toHaveBeenCalled();
      expect(alert.error).not.toHaveBeenCalled();
      expect(alert.success).not.toHaveBeenCalled();
      expect((component as any).vehicleForm.get('numberPlate').touched).toBeTrue();
    });

    it('alerts an error and emits closed, without calling reloadStructure, on API failure', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const adminApi = {
        getVehicleById: jasmine.createSpy('getVehicleById').and.returnValue(getVehicleById$.asObservable()),
        createVehicle: jasmine.createSpy('createVehicle').and.returnValue(throwError(() => new Error('boom'))),
        updateVehicle: jasmine.createSpy('updateVehicle'),
      };
      const alert = {
        success: jasmine.createSpy('success').and.resolveTo(undefined),
        error: jasmine.createSpy('error').and.resolveTo(undefined),
      };
      const component = new VehicleFormModalComponent(
        adminApi as any,
        new FormBuilder(),
        alert as any,
        createTranslateStub()
      );
      component.vehicleTypeOptions = [{ code: 'van', label: 'Van' }];
      component.statusOptions = [{ code: 'active', label: 'Active' }];
      component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
      openCreate(component);
      fillValidForm(component);

      const closedSpy = jasmine.createSpy('closed');
      component.closed.subscribe(closedSpy);

      await (component as any).submitVehicle();

      expect(alert.error).toHaveBeenCalledWith('boom');
      expect(closedSpy).toHaveBeenCalled();
      expect(component.reloadStructure).not.toHaveBeenCalled();
    });
  });
});
