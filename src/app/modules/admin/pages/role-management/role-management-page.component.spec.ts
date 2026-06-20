import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
import { RoleManagementPageComponent } from './role-management-page.component';
import { AdminRoleDto } from '../../../../services/admin/admin-api.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

const ROLE_ROW = {
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

function detailResponse(): ResponseAPI<AdminRoleDto> {
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
    },
  };
}

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

function makeComponent(getRoleById$?: Subject<ResponseAPI<AdminRoleDto>>) {
  const adminApi = {
    getRoleById: jasmine
      .createSpy('getRoleById')
      .and.returnValue((getRoleById$ ?? new Subject()).asObservable()),
    createRole: jasmine
      .createSpy('createRole')
      .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null })),
    updateRoleById: jasmine
      .createSpy('updateRoleById')
      .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null })),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
  };
  const store = makeStoreStub();
  const component = new RoleManagementPageComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub() as any,
    store as any
  );
  (component as any).statusOptions = [{ code: 'active', label: 'Active' }];
  return { component, adminApi, alert, store };
}

/** Resolve after all pending microtasks have flushed. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('RoleManagementPageComponent edit modal', () => {
  // Regression: the modal must open immediately on Edit, not after the detail
  // fetch resolves — a slow SIT response otherwise left a blank ~4s wait.
  it('opens the edit modal before the role detail fetch resolves', () => {
    const getRoleById$ = new Subject<ResponseAPI<AdminRoleDto>>();
    const { component } = makeComponent(getRoleById$);

    void (component as any).openEditModal({ ...ROLE_ROW });

    expect((component as any).isFormModalOpen).toBeTrue();
    expect((component as any).isEditMode).toBeTrue();
    expect((component as any).isEditDetailLoading).toBeTrue();
    // The form is already usable with the row data we had in hand.
    expect((component as any).roleForm.get('enLabel').value).toBe('Owner');
    expect((component as any).roleForm.get('slug').value).toBe('owner');
  });

  it('patches server detail into untouched fields without clobbering user input', async () => {
    const getRoleById$ = new Subject<ResponseAPI<AdminRoleDto>>();
    const { component } = makeComponent(getRoleById$);

    const promise = (component as any).openEditModal({ ...ROLE_ROW });
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
});

describe('RoleManagementPageComponent create submit', () => {
  it('warns and does not call the API when the form is invalid', async () => {
    const { component, adminApi, alert } = makeComponent();
    (component as any).openCreateModal();
    // Leave the required labels blank -> form invalid.

    await (component as any).submitRole();

    expect(alert.warning).toHaveBeenCalled();
    expect(adminApi.createRole).not.toHaveBeenCalled();
  });

  it('accepts a hyphenated slug (matches the documented slug format)', async () => {
    const { component, adminApi } = makeComponent();
    (component as any).openCreateModal();
    const form = (component as any).roleForm;
    form.get('slug').setValue('bus-operator');
    form.get('enLabel').setValue('Bus Operator');
    form.get('thLabel').setValue('พนักงานรถ');
    form.get('status').setValue('active');

    expect(form.valid).toBeTrue();

    await (component as any).submitRole();
    expect(adminApi.createRole).toHaveBeenCalled();
  });

  // Regression: the table revalidate must start concurrently with the success
  // dialog, not after the user dismisses it. On SIT each request is ~2s, so
  // serialising refresh behind the (hand-dismissed) popup was a big part of why
  // "add role" felt ~8s. With the success dialog held open, refresh must
  // already have been kicked off.
  it('starts the table refresh while the success dialog is still open', async () => {
    const { component, store, alert } = makeComponent();
    let resolveSuccess!: () => void;
    alert.success.and.returnValue(
      new Promise<void>((resolve) => {
        resolveSuccess = resolve;
      })
    );

    (component as any).openCreateModal();
    const form = (component as any).roleForm;
    form.get('slug').setValue('bus-operator');
    form.get('enLabel').setValue('Bus Operator');
    form.get('thLabel').setValue('พนักงานรถ');
    form.get('status').setValue('active');

    const done = (component as any).submitRole();
    await flush();

    // Success dialog is open (its promise is unresolved) yet refresh already ran.
    expect(alert.success).toHaveBeenCalled();
    expect(store.refresh).toHaveBeenCalledTimes(1);

    resolveSuccess();
    await done;
  });
});
