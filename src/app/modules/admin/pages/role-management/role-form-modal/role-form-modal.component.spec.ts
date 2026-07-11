import { SimpleChange } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { RoleFormModalComponent } from './role-form-modal.component';
import { AdminRoleDto } from '../../../../../services/admin/admin-api.service';
import { RoleRow } from '../role-management.mappers';
import { ResponseAPI } from '../../../../../shared/interfaces/response.interface';
import { createTranslateStub } from '../../../../../testing/test-stubs';

const OWNER_ROW: RoleRow = {
  id: 7,
  slug: 'owner',
  label: 'Owner',
  description: '-',
  enLabel: 'Owner',
  enDescription: '-',
  thLabel: 'เจ้าของ',
  thDescription: '-',
  status: 'Active',
  statusCode: 'active',
  updatedAt: '-',
};

function detailResponse(overrides: Partial<AdminRoleDto> = {}): ResponseAPI<AdminRoleDto> {
  return {
    code: 200,
    message: 'OK',
    data: {
      id: 7,
      slug: 'owner',
      status: 'active',
      translations: [
        { locale: 'en', label: 'Owner EN', description: 'Owner EN desc' },
        { locale: 'th', label: 'เจ้าของ TH', description: 'TH desc' },
      ],
      ...overrides,
    },
  };
}

function makeComponent(getRoleById$: Subject<ResponseAPI<AdminRoleDto>>) {
  const adminApi = {
    getRoleById: jasmine.createSpy('getRoleById').and.returnValue(getRoleById$.asObservable()),
    createRole: jasmine.createSpy('createRole').and.returnValue(of({ code: 201, message: 'Created', data: null })),
    updateRoleById: jasmine.createSpy('updateRoleById').and.returnValue(of({ code: 200, message: 'OK', data: null })),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
  };
  const component = new RoleFormModalComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  component.statusOptions = [
    { code: 'active', label: 'Active' },
    { code: 'pending', label: 'Pending' },
  ];
  component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
  return { component, adminApi, alert };
}

function openCreate(component: RoleFormModalComponent): void {
  (component as any).isOpen = true;
  (component as any).mode = 'create';
  (component as any).selectedRole = null;
  component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
}

function openEdit(component: RoleFormModalComponent, row: RoleRow): void {
  (component as any).isOpen = true;
  (component as any).mode = 'edit';
  (component as any).selectedRole = row;
  component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
}

// initEditForm is the private async method ngOnChanges fires (without
// awaiting, like a template-driven callback would). Tests that need to await
// the detail fetch call it directly — same idiom as the vehicle/promotion
// form-modal specs.
function openEditAwait(component: RoleFormModalComponent, row: RoleRow): Promise<void> {
  (component as any).isOpen = true;
  (component as any).mode = 'edit';
  (component as any).selectedRole = row;
  return (component as any).initEditForm(row);
}

function fillValidForm(component: RoleFormModalComponent): void {
  const form = (component as any).roleForm;
  form.patchValue({
    slug: 'bus-operator',
    enLabel: 'Bus Operator',
    thLabel: 'พนักงานรถ',
    status: 'active',
  });
}

/** Resolve after all pending microtasks have flushed. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('RoleFormModalComponent', () => {
  describe('create mode', () => {
    // Flagged discrepancy vs. design-system.md §3.1 ("form selects ... do not
    // pre-seed a default"): the pre-split RoleManagementPageComponent's
    // openCreateModal actually pre-seeded `status` with the FIRST status
    // option's code (not an empty placeholder). Reproduced verbatim here —
    // same documented precedent as VehicleFormModalComponent (OBRS-261).
    it('opens with status pre-seeded to the first option (pre-existing behavior, not design-system §3.1 compliant)', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminRoleDto>>());

      openCreate(component);

      const form = (component as any).roleForm;
      expect(form.get('status').value).toBe('active');
      expect(form.get('slug').value).toBe('');
      expect(form.get('enLabel').value).toBe('');
      expect(form.get('slug').enabled).toBeTrue();
    });

    it('ignores unrelated input changes (e.g. option-list refresh) while the modal stays closed', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminRoleDto>>());

      component.statusOptions = [{ code: 'pending', label: 'Pending' }];
      component.ngOnChanges({
        statusOptions: new SimpleChange([], component.statusOptions, false),
      });

      expect((component as any).isOpen).toBeFalse();
    });
  });

  describe('edit mode', () => {
    it('opens immediately with the row data, before the detail fetch resolves, and disables slug', () => {
      const getRoleById$ = new Subject<ResponseAPI<AdminRoleDto>>();
      const { component } = makeComponent(getRoleById$);

      openEdit(component, { ...OWNER_ROW });

      expect((component as any).isEditDetailLoading).toBeTrue();
      const form = (component as any).roleForm;
      expect(form.get('enLabel').value).toBe('Owner');
      expect(form.get('slug').value).toBe('owner');
      expect(form.get('slug').disabled).toBeTrue();
    });

    it('patches server detail into untouched fields without clobbering user input', async () => {
      const getRoleById$ = new Subject<ResponseAPI<AdminRoleDto>>();
      const { component } = makeComponent(getRoleById$);

      const promise = openEditAwait(component, { ...OWNER_ROW });
      const form = (component as any).roleForm;
      form.get('enLabel').setValue('User typed');
      form.get('enLabel').markAsDirty();

      getRoleById$.next(detailResponse());
      getRoleById$.complete();
      await promise;

      expect(form.get('enDescription').value).toBe('Owner EN desc');
      expect(form.get('enLabel').value).toBe('User typed');
      expect((component as any).isEditDetailLoading).toBeFalse();
    });

    it('ignores a stale detail response once the modal has been closed', async () => {
      const getRoleById$ = new Subject<ResponseAPI<AdminRoleDto>>();
      const { component } = makeComponent(getRoleById$);

      const promise = openEditAwait(component, { ...OWNER_ROW });
      (component as any).isOpen = false;
      component.ngOnChanges({ isOpen: new SimpleChange(true, false, false) });

      getRoleById$.next(detailResponse());
      getRoleById$.complete();
      await promise;

      expect((component as any).isOpen).toBeFalse();
      expect((component as any).isEditDetailLoading).toBeFalse();
    });
  });

  describe('isFieldInvalid', () => {
    it('is false until the field is touched/dirty', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminRoleDto>>());
      openCreate(component);

      expect((component as any).isFieldInvalid('slug')).toBeFalse();

      (component as any).roleForm.get('slug').markAsTouched();
      expect((component as any).isFieldInvalid('slug')).toBeTrue();
    });
  });

  describe('requestClose', () => {
    it('does not emit closed while submitting', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminRoleDto>>());
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

  // Resets the child's own state (isEditDetailLoading/roleForm) once the
  // parent flips isOpen back to false — the split's replacement for the
  // pre-split page's closeFormModal() doing `roleForm.reset()` synchronously.
  describe('isOpen -> false transition', () => {
    it('resets isEditDetailLoading and the form when isOpen flips to false', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminRoleDto>>());
      openEdit(component, { ...OWNER_ROW });
      expect((component as any).isEditDetailLoading).toBeTrue();

      (component as any).isOpen = false;
      component.ngOnChanges({ isOpen: new SimpleChange(true, false, false) });

      expect((component as any).isEditDetailLoading).toBeFalse();
      expect((component as any).roleForm.get('slug').value).toBeFalsy();
    });
  });

  describe('submitRole', () => {
    it('warns and does not call the API when the form is invalid', async () => {
      const { component, adminApi, alert } = makeComponent(new Subject<ResponseAPI<AdminRoleDto>>());
      openCreate(component);
      // Leave the required labels blank -> form invalid.

      await (component as any).submitRole();

      expect(alert.warning).toHaveBeenCalled();
      expect(adminApi.createRole).not.toHaveBeenCalled();
    });

    it('accepts a hyphenated slug (matches the documented slug format) and creates the role', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminRoleDto>>());
      openCreate(component);
      fillValidForm(component);

      expect((component as any).roleForm.valid).toBeTrue();

      await (component as any).submitRole();
      expect(adminApi.createRole).toHaveBeenCalled();
    });

    it('updates a role by id when in edit mode', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminRoleDto>>());
      openEdit(component, { ...OWNER_ROW });
      fillValidForm(component);

      await (component as any).submitRole();

      expect(adminApi.updateRoleById).toHaveBeenCalledWith(7, jasmine.any(Object));
      expect(component.reloadStructure).toHaveBeenCalled();
    });

    // CRITICAL — byte-for-byte parity with the pre-split
    // RoleManagementPageComponent.submitRole: API call -> emit closed (==
    // the old closeFormModal(true)) -> reloadStructure() STARTED (not yet
    // awaited) -> await the success alert -> THEN await the refresh promise.
    // This is a documented perf optimization (SIT ~2s/request; serialising
    // refresh behind the hand-dismissed popup made "add role" feel ~8s) and
    // deliberately diverges from the sibling form-modals' sequential
    // ordering (they await reloadStructure() before the alert) — see the
    // class-level comment on RoleFormModalComponent.
    it('emits closed immediately, then starts reloadStructure while the success dialog is still open (concurrent, not sequential)', async () => {
      const order: string[] = [];
      const { component, adminApi, alert } = makeComponent(new Subject<ResponseAPI<AdminRoleDto>>());
      adminApi.createRole.and.callFake(() => {
        order.push('create');
        return of({ code: 201, message: 'Created', data: null });
      });
      // Both fakes hold their promise open until the test explicitly
      // resolves them, so the recorded order reflects only real `await`
      // suspension points in submitRole — not incidental microtask
      // scheduling from an auto-resolving Promise.resolve().then().
      let resolveReload!: () => void;
      (component.reloadStructure as jasmine.Spy).and.callFake(() => {
        order.push('reload-called');
        return new Promise<void>((resolve) => {
          resolveReload = () => {
            order.push('reload-resolved');
            resolve();
          };
        });
      });
      let resolveSuccess!: () => void;
      alert.success.and.callFake(() => {
        order.push('alert-called');
        return new Promise<void>((resolve) => {
          resolveSuccess = () => {
            order.push('alert-resolved');
            resolve();
          };
        });
      });
      openCreate(component);
      fillValidForm(component);

      const closedSpy = jasmine.createSpy('closed');
      component.closed.subscribe(() => {
        order.push('closed');
        closedSpy();
      });

      const done = (component as any).submitRole();
      await flush();

      // reloadStructure() must already have been CALLED (not just queued)
      // while the success alert is still open/unresolved — proving the
      // refresh is started concurrently with the dialog, not sequenced
      // strictly after it.
      expect(order).toEqual(['create', 'closed', 'reload-called', 'alert-called']);
      expect(closedSpy).toHaveBeenCalled();

      // Dismiss the alert first (as the admin would); submitRole must then
      // block on `await refresh` until reloadStructure's promise settles too.
      resolveSuccess();
      await flush();
      expect(order).toEqual(['create', 'closed', 'reload-called', 'alert-called', 'alert-resolved']);

      resolveReload();
      await done;

      expect(order).toEqual([
        'create',
        'closed',
        'reload-called',
        'alert-called',
        'alert-resolved',
        'reload-resolved',
      ]);
    });

    it('marks all fields touched and does not submit when the form is invalid', async () => {
      const { component, adminApi, alert } = makeComponent(new Subject<ResponseAPI<AdminRoleDto>>());
      openCreate(component);

      await (component as any).submitRole();

      expect(adminApi.createRole).not.toHaveBeenCalled();
      expect(alert.error).not.toHaveBeenCalled();
      expect(alert.success).not.toHaveBeenCalled();
      expect((component as any).roleForm.get('enLabel').touched).toBeTrue();
    });

    it('alerts an error and emits closed, without calling reloadStructure, on API failure', async () => {
      const getRoleById$ = new Subject<ResponseAPI<AdminRoleDto>>();
      const adminApi = {
        getRoleById: jasmine.createSpy('getRoleById').and.returnValue(getRoleById$.asObservable()),
        createRole: jasmine.createSpy('createRole').and.returnValue(throwError(() => new Error('boom'))),
        updateRoleById: jasmine.createSpy('updateRoleById'),
      };
      const alert = {
        success: jasmine.createSpy('success').and.resolveTo(undefined),
        error: jasmine.createSpy('error').and.resolveTo(undefined),
        warning: jasmine.createSpy('warning').and.resolveTo(undefined),
      };
      const component = new RoleFormModalComponent(
        adminApi as any,
        new FormBuilder(),
        alert as any,
        createTranslateStub()
      );
      component.statusOptions = [{ code: 'active', label: 'Active' }];
      component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
      openCreate(component);
      fillValidForm(component);

      const closedSpy = jasmine.createSpy('closed');
      component.closed.subscribe(closedSpy);

      await (component as any).submitRole();

      expect(alert.error).toHaveBeenCalledWith('boom');
      expect(closedSpy).toHaveBeenCalled();
      expect(component.reloadStructure).not.toHaveBeenCalled();
    });
  });
});
