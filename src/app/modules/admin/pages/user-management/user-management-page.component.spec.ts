import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
import { UserManagementPageComponent } from './user-management-page.component';
import { AdminUserDto } from '../../../../services/admin/admin-api.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

const USER_ROW = {
  id: 1,
  fullName: 'Mr John Doe',
  username: 'jdoe',
  email: 'john@example.com',
  phone: '0812345678',
  roleSlugs: ['admin'],
  roles: ['Admin'],
  status: 'Active',
  statusCode: 'active',
  lastActive: '-',
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

function makeComponent(getUserById$: Subject<ResponseAPI<AdminUserDto>>) {
  const adminApi = {
    getUserById: jasmine.createSpy('getUserById').and.returnValue(getUserById$.asObservable()),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  return new UserManagementPageComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub(),
    makeStoreStub() as any
  );
}

describe('UserManagementPageComponent', () => {
  // Regression: the backend removed the username field, so the create-user form
  // must not carry a username control (it was a no-op that blocked submission).
  it('has no username control on the create form', () => {
    const component = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
    (component as any).openCreateModal();

    expect((component as any).userForm.contains('username')).toBeFalse();
  });

  // Regression: the modal must open immediately on Edit, not after the detail
  // fetch resolves — otherwise a slow SIT response leaves a blank wait.
  it('opens the edit modal before the user detail fetch resolves', () => {
    const getUserById$ = new Subject<ResponseAPI<AdminUserDto>>();
    const component = makeComponent(getUserById$);

    void (component as any).openEditModal({ ...USER_ROW });

    expect((component as any).isFormModalOpen).toBeTrue();
    expect((component as any).isEditMode).toBeTrue();
    expect((component as any).isEditDetailLoading).toBeTrue();
    // Form already usable with the row data we had in hand.
    expect((component as any).userForm.get('firstName').value).toBe('John');
  });

  it('patches server detail into untouched fields without clobbering user input', async () => {
    const getUserById$ = new Subject<ResponseAPI<AdminUserDto>>();
    const component = makeComponent(getUserById$);

    const promise = (component as any).openEditModal({ ...USER_ROW });

    // User edits the first name before the detail arrives.
    const form = (component as any).userForm;
    form.get('firstName').setValue('Edited');
    form.get('firstName').markAsDirty();

    getUserById$.next({
      code: 200,
      message: 'OK',
      data: {
        id: 1,
        title: 'Mr',
        firstName: 'Jonathan',
        lastName: 'Smith',
        email: 'john@example.com',
        phoneNumber: '0812345678',
        status: 'active',
        roles: ['admin'],
      },
    });
    getUserById$.complete();
    await promise;

    // Untouched last name is filled from the server detail...
    expect(form.get('lastName').value).toBe('Smith');
    // ...but the field the user was editing is preserved.
    expect(form.get('firstName').value).toBe('Edited');
    expect((component as any).isEditDetailLoading).toBeFalse();
  });
});
