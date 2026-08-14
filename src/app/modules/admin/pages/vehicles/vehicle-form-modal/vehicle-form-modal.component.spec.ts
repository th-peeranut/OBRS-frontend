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
  rawVehicleNumber: 'V1',
  rawPlate: 'ABC-123',
  vehicleType: 'Van',
  route: '-',
  status: 'Active',
};

// OBRS-842: the shape the table hands the modal for a RETIRED vehicle with no
// หมายเลขพาหนะ (16-8829 on SIT after V58) — display fields already carry the '-'
// placeholder, raw fields carry the truth. This row is the whole bug.
const RETIRED_ROW: VehicleRow = {
  id: 14,
  vehicleTypeSlug: 'minibus',
  statusCode: 'retired',
  vehicleNumber: '-',
  plate: '16-8829',
  rawVehicleNumber: null,
  rawPlate: '16-8829',
  vehicleType: 'Minibus',
  route: '-',
  status: 'RETIRED',
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
    // OBRS-1332: the assigned-driver picker's source.
    getDrivers: jasmine
      .createSpy('getDrivers')
      .and.returnValue(of({ code: 200, message: 'OK', data: [{ id: 55, name: 'สมชาย' }] })),
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
    // Per design-system.md §3.1 ("no pre-seeded default"), create mode opens
    // with every select BLANK (empty = placeholder), matching the
    // promotions/user form modals. OBRS-262 fixed the deviation OBRS-261 had
    // carried over verbatim (first-option pre-seed) from the pre-split modal.
    it('opens with vehicleType/status blank (design-system §3.1, no pre-seeded default)', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());

      openCreate(component);

      const form = (component as any).vehicleForm;
      expect(form.get('vehicleType').value).toBe('');
      expect(form.get('status').value).toBe('');
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

  // OBRS-316 Gap 1 R1 guard: PUT is a full-replace, so a save before the real
  // detail fetch resolves (or after it fails) would silently NULL all 7 new
  // attribute fields. isSaveBlocked backs both the disabled Save button and
  // the submitVehicle() short-circuit (Enter-in-text-field bypasses [disabled]).
  describe('isSaveBlocked / submitVehicle R1 guard', () => {
    it('is blocked while the edit detail fetch is in flight', () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component } = makeComponent(getVehicleById$);

      openEdit(component, { ...VAN_ROW });

      expect((component as any).isEditDetailLoading).toBeTrue();
      expect((component as any).isSaveBlocked).toBeTrue();
    });

    it('is blocked after the edit detail fetch fails, and stays blocked (not silently swallowed)', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.error(new Error('network down'));
      await promise;

      expect((component as any).isEditDetailError).toBeTrue();
      expect((component as any).isEditDetailLoading).toBeFalse();
      expect((component as any).isSaveBlocked).toBeTrue();
    });

    it('is not blocked once the edit detail fetch succeeds', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.next(detailResponse());
      getVehicleById$.complete();
      await promise;

      expect((component as any).isSaveBlocked).toBeFalse();
    });

    it('is never blocked in create mode', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());
      openCreate(component);

      expect((component as any).isSaveBlocked).toBeFalse();
    });

    it('submitVehicle() short-circuits (no API call) while blocked, even with a valid form', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());
      openEdit(component, { ...VAN_ROW }); // fetch still in flight -> blocked
      fillValidForm(component);

      await (component as any).submitVehicle();

      expect(adminApi.updateVehicle).not.toHaveBeenCalled();
    });

    it('resets isEditDetailError to false on close', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.error(new Error('network down'));
      await promise;
      expect((component as any).isEditDetailError).toBeTrue();

      (component as any).isOpen = false;
      component.ngOnChanges({ isOpen: new SimpleChange(true, false, false) });

      expect((component as any).isEditDetailError).toBeFalse();
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
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component, adminApi } = makeComponent(getVehicleById$);
      // OBRS-316 Gap 1 R1 guard: submit is blocked until the detail fetch
      // resolves, so this must await it first (matching the real edit flow) —
      // see the "isSaveBlocked / submitVehicle R1 guard" describe block below
      // for the blocked-while-loading/failed cases.
      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.next(detailResponse());
      getVehicleById$.complete();
      await promise;
      fillValidForm(component);

      await (component as any).submitVehicle();

      expect(adminApi.updateVehicle).toHaveBeenCalledWith(1, jasmine.any(Object));
      expect(component.reloadStructure).toHaveBeenCalled();
    });

    // OBRS-316 Gap 1: PUT is a full-replace, so create MUST serialize all 7
    // vehicle-attribute keys (blank -> null) even though the admin never
    // touched them.
    it('sends all 7 vehicle-attribute keys (null when blank) on create', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());
      openCreate(component);
      fillValidForm(component);

      await (component as any).submitVehicle();

      expect(adminApi.createVehicle).toHaveBeenCalledWith({
        vehicleType: 'van',
        numberPlate: 'NEW-PLATE',
        vehicleNumber: 'NEW-NUM',
        status: 'active',
        brand: null,
        model: null,
        manufactureYear: null,
        colour: null,
        engineCc: null,
        chassisNumber: null,
        note: null,
        // OBRS-835: present-and-null, not absent. Being a whole-object assertion, this
        // is also what stops a future field being added to the payload without someone
        // deciding what create should send for it.
        gpsImei: null,
        // OBRS-1332: present-and-null too — a new vehicle has no regular driver until
        // somebody picks one, and the key has to be there to say so.
        assignedDriverId: null,
      });
    });

    // Edit must echo the server-loaded attribute values back on the PUT — the
    // whole point of the R1 guard is that these are never silently dropped.
    it('echoes the loaded vehicle-attribute values (no null-drop) on edit', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component, adminApi } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.next(
        detailResponse({
          brand: 'Toyota',
          model: 'Commuter',
          manufactureYear: 2019,
          colour: 'White',
          engineCc: 2982,
          chassisNumber: 'CH-000123',
          note: 'Rear AC unit replaced.',
        })
      );
      getVehicleById$.complete();
      await promise;

      await (component as any).submitVehicle();

      expect(adminApi.updateVehicle).toHaveBeenCalledWith(1, jasmine.objectContaining({
        brand: 'Toyota',
        model: 'Commuter',
        manufactureYear: 2019,
        colour: 'White',
        engineCc: 2982,
        chassisNumber: 'CH-000123',
        note: 'Rear AC unit replaced.',
      }));
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

  // ── OBRS-842 ────────────────────────────────────────────────────────────────
  // The reachable defect: after OBRS-837 a real vehicle_number = NULL row exists
  // (16-8829). The table renders it as '-', the modal used to seed the form from
  // that display string, Validators.required accepted it, and the full-replace PUT
  // made '-' the vehicle's permanent หมายเลขพาหนะ — with the admin having typed
  // nothing and seen no error. These specs walk the whole path end to end.
  describe('a vehicle with no หมายเลขพาหนะ (OBRS-842)', () => {
    // The server's own answer for such a row: numberPlate present, vehicleNumber
    // absent, status retired.
    function retiredDetail(): ResponseAPI<AdminVehicleDto> {
      return detailResponse({
        id: 14,
        numberPlate: '16-8829',
        vehicleNumber: undefined,
        status: 'retired',
        vehicleType: { id: 3, slug: 'minibus' },
      });
    }

    async function openRetired() {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const made = makeComponent(getVehicleById$);
      const promise = openEditAwait(made.component, { ...RETIRED_ROW });
      getVehicleById$.next(retiredDetail());
      getVehicleById$.complete();
      await promise;
      return made;
    }

    it('opens with the vehicle-number field EMPTY, not the "-" the table shows', async () => {
      const { component } = await openRetired();
      expect((component as any).vehicleForm.get('vehicleNumber').value).toBe('');
    });

    // The synchronous open, BEFORE the detail fetch resolves — the row fallback is
    // the only data in hand there, and it is the one carrying the placeholder.
    it('is already empty on the synchronous open, before the detail fetch resolves', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());
      openEdit(component, { ...RETIRED_ROW });
      expect((component as any).vehicleForm.get('vehicleNumber').value).toBe('');
    });

    it('saves without the admin touching anything, and PUTs null — never "-"', async () => {
      const { component, adminApi } = await openRetired();

      await (component as any).submitVehicle();

      expect(adminApi.updateVehicle).toHaveBeenCalledWith(
        14,
        jasmine.objectContaining({ vehicleNumber: null, numberPlate: '16-8829' })
      );
    });

    it('keeps Save reachable so brand/model/note of a retired vehicle stay editable', async () => {
      const { component, adminApi } = await openRetired();
      (component as any).vehicleForm.patchValue({ brand: 'Hino', model: 'Minibus' });

      await (component as any).submitVehicle();

      expect(adminApi.updateVehicle).toHaveBeenCalledWith(
        14,
        jasmine.objectContaining({ brand: 'Hino', model: 'Minibus', vehicleNumber: null })
      );
    });

    it('drops the required asterisk only while the status is retired', async () => {
      const { component } = await openRetired();
      expect((component as any).isVehicleNumberOptional).toBeTrue();

      (component as any).vehicleForm.patchValue({ status: 'active' });
      expect((component as any).isVehicleNumberOptional).toBeFalse();
    });

    // The near-miss the backend pins in VehicleReqDtoValidationTest: `inactive`
    // is still IN the fleet, so it still holds its number. If the form let this
    // through, the admin would get a 400 with no field marked.
    it('blocks the save when the status moves off retired while the number is blank', async () => {
      const { component, adminApi } = await openRetired();

      (component as any).vehicleForm.patchValue({ status: 'inactive' });
      await (component as any).submitVehicle();

      expect((component as any).vehicleForm.get('vehicleNumber').valid).toBeFalse();
      expect(adminApi.updateVehicle).not.toHaveBeenCalled();
    });

    // Must-NOT-fire: relaxing the rule for retired must not relax it for anyone
    // else. Without this, "vehicleNumber is simply optional now" would pass every
    // spec above.
    it('still refuses to save an ORDINARY vehicle with the number cleared', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component, adminApi } = makeComponent(getVehicleById$);
      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.next(detailResponse());
      getVehicleById$.complete();
      await promise;

      (component as any).vehicleForm.patchValue({ vehicleNumber: '   ' });
      await (component as any).submitVehicle();

      expect(adminApi.updateVehicle).not.toHaveBeenCalled();
    });

    // And create mode, where nothing has been loaded at all, keeps the field
    // required by default — status starts blank, which is not 'retired'.
    it('keeps the field required in create mode', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());
      openCreate(component);
      expect((component as any).vehicleForm.get('vehicleNumber').valid).toBeFalse();
      expect((component as any).isVehicleNumberOptional).toBeFalse();
    });
  });

  // ── OBRS-1332: the regular driver — set it, change it, take it off ────────────
  describe('assigned driver (OBRS-1332)', () => {
    it('loads the current regular driver from the vehicle detail into the form', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.next(detailResponse({ assignedDriverId: 55 }));
      getVehicleById$.complete();
      await promise;

      expect((component as any).vehicleForm.get('assignedDriverId').value).toBe('55');
    });

    // Drives ngOnChanges rather than openEditAwait's direct initEditForm call — opening
    // the modal is what triggers the roster fetch, so a test that skips that boundary
    // would be green with the fetch wired to nothing.
    it('fills the picker from the driver roster when the modal opens', async () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminVehicleDto>>());

      openCreate(component);
      // The roster load is deliberately NOT awaited by the open path — the modal must
      // not wait on it to become usable — so flush the queue before reading it.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect((component as any).driverOptions).toEqual([{ code: '55', label: 'สมชาย' }]);
    });

    it('sends the chosen driver on save', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component, adminApi } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.next(detailResponse());
      getVehicleById$.complete();
      await promise;

      (component as any).vehicleForm.patchValue({ assignedDriverId: '55' });
      await (component as any).submitVehicle();

      expect(adminApi.updateVehicle.calls.mostRecent().args[1].assignedDriverId).toBe(55);
    });

    /**
     * Taking a driver off a van has to be expressible, or the column is write-once from
     * the UI and a driver who leaves stays attached to their van forever — still
     * receiving that van's maintenance reminders.
     */
    it('sends null when the owner clears the picker', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component, adminApi } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.next(detailResponse({ assignedDriverId: 55 }));
      getVehicleById$.complete();
      await promise;

      (component as any).vehicleForm.patchValue({ assignedDriverId: '' });
      await (component as any).submitVehicle();

      expect(adminApi.updateVehicle.calls.mostRecent().args[1].assignedDriverId).toBeNull();
    });

    /**
     * A failed driver-roster fetch must NOT behave like a failed detail fetch. The value
     * being saved comes from the detail-loaded control, not from this list, so an empty
     * picker cannot wipe an assignment — and blocking Save over it would make an
     * unrelated outage stop every vehicle edit.
     */
    it('keeps the loaded assignment when the driver roster fails to load', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component, adminApi } = makeComponent(getVehicleById$);
      adminApi.getDrivers.and.returnValue(throwError(() => new Error('boom')));

      openEdit(component, { ...VAN_ROW });
      getVehicleById$.next(detailResponse({ assignedDriverId: 55 }));
      getVehicleById$.complete();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(adminApi.getDrivers).toHaveBeenCalled();
      expect((component as any).driverOptions).toEqual([]);
      expect((component as any).isEditDetailError).toBeFalse();

      await (component as any).submitVehicle();
      expect(adminApi.updateVehicle.calls.mostRecent().args[1].assignedDriverId).toBe(55);
    });
  });

  // ── OBRS-835: the GPS IMEI, the first write path this column has ever had ──────
  describe('GPS IMEI (OBRS-835)', () => {
    it('loads the current IMEI from the vehicle detail into the form', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.next(detailResponse({ gpsImei: '860470062518406' }));
      getVehicleById$.complete();
      await promise;

      expect((component as any).vehicleForm.get('gpsImei').value).toBe('860470062518406');
    });

    /**
     * AC1: the whole point of the card. Editing a vehicle must actually send the IMEI,
     * or gps_imei stays NULL and every GPS batch keeps reporting skipped_unknown_imei.
     */
    it('sends the edited IMEI on save', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component, adminApi } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.next(detailResponse());
      getVehicleById$.complete();
      await promise;

      (component as any).vehicleForm.patchValue({ gpsImei: '862608080309567' });
      await (component as any).submitVehicle();

      const payload = adminApi.updateVehicle.calls.mostRecent().args[1];
      expect(payload.gpsImei).toBe('862608080309567');
    });

    /**
     * Detaching a box has to be expressible from the UI, or the column becomes
     * write-once and the next swap goes back to a developer with a SQL client. The
     * assertion is `null`, not `''` - gps_imei is UNIQUE, so an empty string is a real
     * value that the SECOND vehicle cleared this way would collide with.
     */
    it('sends null - not an empty string - when the admin clears the field', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component, adminApi } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.next(detailResponse({ gpsImei: '860470062518406' }));
      getVehicleById$.complete();
      await promise;

      (component as any).vehicleForm.patchValue({ gpsImei: '   ' });
      await (component as any).submitVehicle();

      const payload = adminApi.updateVehicle.calls.mostRecent().args[1];
      expect(payload.gpsImei).toBeNull();
    });

    /** A malformed IMEI must not leave the browser - it would be a 400 with no field marked. */
    it('blocks the save on a 14-digit IMEI instead of letting the backend reject it', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component, adminApi } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.next(detailResponse());
      getVehicleById$.complete();
      await promise;

      (component as any).vehicleForm.patchValue({ gpsImei: '86047006251840' });
      await (component as any).submitVehicle();

      expect(adminApi.updateVehicle).not.toHaveBeenCalled();
    });

    /** ...and the must-NOT-fire half: a blank field is a legitimate "no box fitted". */
    it('still saves when the IMEI field is left empty', async () => {
      const getVehicleById$ = new Subject<ResponseAPI<AdminVehicleDto>>();
      const { component, adminApi } = makeComponent(getVehicleById$);

      const promise = openEditAwait(component, { ...VAN_ROW });
      getVehicleById$.next(detailResponse());
      getVehicleById$.complete();
      await promise;

      (component as any).vehicleForm.patchValue({ gpsImei: '' });
      await (component as any).submitVehicle();

      expect(adminApi.updateVehicle).toHaveBeenCalled();
    });
  });
});
