import { SimpleChange } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { UserFormModalComponent } from './user-form-modal.component';
import { AdminUserDto } from '../../../../../services/admin/admin-api.service';
import { UserRow } from '../user-management.mappers';
import { ResponseAPI } from '../../../../../shared/interfaces/response.interface';
import { createTranslateStub } from '../../../../../testing/test-stubs';

const JOHN_ROW: UserRow = {
  id: 1,
  fullName: 'Mr John Doe',
  email: 'john@example.com',
  phone: '0812345678',
  roleSlugs: ['admin'],
  roles: ['Admin'],
  status: 'Active',
  statusCode: 'active',
  lastLogin: '-',
  hasLoggedIn: false,
  locked: false,
};

function detailResponse(overrides: Partial<AdminUserDto> = {}): ResponseAPI<AdminUserDto> {
  return {
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
      ...overrides,
    },
  };
}

function makeComponent(getUserById$: Subject<ResponseAPI<AdminUserDto>>) {
  const adminApi = {
    getUserById: jasmine.createSpy('getUserById').and.returnValue(getUserById$.asObservable()),
    createUser: jasmine
      .createSpy('createUser')
      .and.returnValue(of({ code: 201, message: 'Created', data: null })),
    updateUser: jasmine
      .createSpy('updateUser')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    checkUserExistsByEmail: jasmine
      .createSpy('checkUserExistsByEmail')
      .and.returnValue(of({ code: 200, message: 'OK', data: false })),
    checkUserExistsByPhoneNumber: jasmine
      .createSpy('checkUserExistsByPhoneNumber')
      .and.returnValue(of({ code: 200, message: 'OK', data: false })),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  const component = new UserFormModalComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  component.roleOptions = [
    { slug: 'admin', label: 'Admin' },
    { slug: 'staff', label: 'Staff' },
  ];
  component.statusOptions = [
    { code: 'active', label: 'Active' },
    { code: 'inactive', label: 'Inactive' },
  ];
  component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
  return { component, adminApi, alert };
}

function openCreate(component: UserFormModalComponent): void {
  (component as any).isOpen = true;
  (component as any).mode = 'create';
  (component as any).selectedUser = null;
  component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
}

function openEdit(component: UserFormModalComponent, row: UserRow): void {
  (component as any).isOpen = true;
  (component as any).mode = 'edit';
  (component as any).selectedUser = row;
  component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
}

// initEditForm is the private async method ngOnChanges fires (without
// awaiting, like a template-driven callback would). Tests that need to await
// the detail fetch call it directly — same idiom as
// PromotionFormModalComponent's spec — after setting isOpen/selectedUser the
// same way ngOnChanges's caller would.
function openEditAwait(component: UserFormModalComponent, row: UserRow): Promise<void> {
  (component as any).isOpen = true;
  (component as any).mode = 'edit';
  (component as any).selectedUser = row;
  return (component as any).initEditForm(row);
}

function fillValidCreateForm(component: UserFormModalComponent): void {
  const form = (component as any).userForm;
  form.patchValue({
    title: 'Mr',
    firstName: 'New',
    lastName: 'User',
    email: 'new.user@example.com',
    phoneNumber: '0899999999',
    password: 'Password1',
    confirmPassword: 'Password1',
    preferredLocale: 'th',
    status: 'active',
    roles: ['admin'],
    isPhoneNumberVerify: true,
  });
}

describe('UserFormModalComponent', () => {
  // OBRS-455 AC#2: this form writes users.phone_number — the column OTP login matches on. It was
  // the last surface still on \d{10,15}, so an admin could create an account whose owner could
  // never sign in by OTP. UserUpdateReqDto now enforces the same rule server-side.
  describe('phone rule (users.phone_number)', () => {
    it('rejects the 12-digit number the old \\d{10,15} rule accepted', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openCreate(component);

      const ctrl = (component as any).userForm.get('phoneNumber');
      ctrl.setValue('123456789012');
      expect(ctrl.valid).toBeFalse();
      ctrl.setValue('0212345678'); // and a landline, which it also used to take
      expect(ctrl.valid).toBeFalse();
      ctrl.setValue('0812345678');
      expect(ctrl.valid).toBeTrue();
    });
  });

  describe('create mode', () => {
    it('opens with the default create values, including the pre-seeded first status option', () => {
      // Pre-existing behavior carried over verbatim from
      // UserManagementPageComponent.openCreateModal (unlike
      // PromotionFormModalComponent, which starts `status` blank per
      // design-system §3.1) — not "fixed" by this split.
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());

      openCreate(component);

      const form = (component as any).userForm;
      expect(form.get('title').value).toBe('');
      expect(form.get('status').value).toBe('active');
      expect(form.get('roles').value).toEqual([]);
    });

    it('has no username control on the create form', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openCreate(component);

      expect((component as any).userForm.contains('username')).toBeFalse();
    });

    it('ignores unrelated input changes (e.g. option-list refresh) while the modal stays closed', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());

      component.roleOptions = [{ slug: 'admin', label: 'Admin' }];
      component.ngOnChanges({
        roleOptions: new SimpleChange([], component.roleOptions, false),
      });

      expect((component as any).isOpen).toBeFalse();
    });
  });

  describe('edit mode', () => {
    it('opens the edit modal with the row data before the user detail fetch resolves', () => {
      const getUserById$ = new Subject<ResponseAPI<AdminUserDto>>();
      const { component } = makeComponent(getUserById$);

      openEdit(component, { ...JOHN_ROW });

      expect((component as any).isEditDetailLoading).toBeTrue();
      // Form already usable with the row data we had in hand.
      expect((component as any).userForm.get('firstName').value).toBe('John');
    });

    it('patches server detail into untouched fields without clobbering user input', async () => {
      const getUserById$ = new Subject<ResponseAPI<AdminUserDto>>();
      const { component } = makeComponent(getUserById$);

      const promise = openEditAwait(component, { ...JOHN_ROW });
      const form = (component as any).userForm;

      // The admin starts editing before the detail arrives.
      form.get('firstName').setValue('Edited');
      form.get('firstName').markAsDirty();

      getUserById$.next(detailResponse());
      getUserById$.complete();
      await promise;

      // Untouched last name is filled from the server detail...
      expect(form.get('lastName').value).toBe('Smith');
      // ...but the field the user was editing is preserved.
      expect(form.get('firstName').value).toBe('Edited');
      expect((component as any).isEditDetailLoading).toBeFalse();
    });

    it('ignores a stale detail response once the modal has been closed', async () => {
      const getUserById$ = new Subject<ResponseAPI<AdminUserDto>>();
      const { component } = makeComponent(getUserById$);

      const promise = openEditAwait(component, { ...JOHN_ROW });
      (component as any).isOpen = false;
      component.ngOnChanges({ isOpen: new SimpleChange(true, false, false) });

      getUserById$.next(detailResponse());
      getUserById$.complete();
      await promise;

      expect((component as any).isOpen).toBeFalse();
      expect((component as any).isEditDetailLoading).toBeFalse();
    });
  });

  describe('isFieldInvalid', () => {
    it('is false until the field is touched/dirty', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openCreate(component);

      expect((component as any).isFieldInvalid('firstName')).toBeFalse();

      (component as any).userForm.get('firstName').markAsTouched();
      expect((component as any).isFieldInvalid('firstName')).toBeTrue();
    });
  });

  describe('requestClose', () => {
    it('does not emit closed while submitting', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
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

  describe('credential enable/disable', () => {
    it('enables password/confirmPassword with validators in create mode', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openCreate(component);

      const form = (component as any).userForm;
      expect(form.get('password').enabled).toBeTrue();
      expect(form.get('confirmPassword').enabled).toBeTrue();
      // Required validator is active: blank password is invalid.
      expect(form.get('password').invalid).toBeTrue();
    });

    it('disables password/confirmPassword and clears their validators in edit mode', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openEdit(component, { ...JOHN_ROW });

      const form = (component as any).userForm;
      expect(form.get('password').disabled).toBeTrue();
      expect(form.get('confirmPassword').disabled).toBeTrue();
      expect(form.get('password').validator).toBeNull();
    });

    // OBRS-725: the login email is the JWT subject, and PUT /api/private/users/{id}
    // now rejects a changed address outright (user.error.email.immutable). The form
    // must not offer staff an edit the server refuses.
    it('disables the login email in edit mode', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openEdit(component, { ...JOHN_ROW });

      expect((component as any).userForm.get('email').disabled).toBeTrue();
    });

    // must NOT catch: creating an account is the one moment this form legitimately
    // decides what the login email will be.
    it('leaves the login email editable in create mode', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openCreate(component);

      expect((component as any).userForm.get('email').enabled).toBeTrue();
    });

    // The disabled control must still reach the wire: UserUpdateReqDto.email is
    // @NotBlank, and applyUpdates compares the submitted address against the stored
    // one. submitUser reads getRawValue() for exactly this reason — a switch to
    // .value would silently drop the field and turn every save into a 400.
    it('still sends the stored email in the update payload despite the control being disabled', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openEdit(component, { ...JOHN_ROW });
      // Everything a staff edit legitimately changes — but NOT email, which is the
      // value under test and arrives from the loaded row.
      (component as any).userForm.patchValue({
        title: 'Mr',
        firstName: 'Jonathan',
        lastName: 'Smith',
        phoneNumber: '0812345678',
        preferredLocale: 'th',
        status: 'active',
        roles: ['admin'],
        isPhoneNumberVerify: true,
      });

      await (component as any).submitUser();

      const payload = adminApi.updateUser.calls.mostRecent().args[1];
      expect(payload.email).toBe('john@example.com');
    });
  });

  describe('checkSamePassword / confirm-password mismatch display', () => {
    it('returns true immediately in edit mode (no credential check applies)', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openEdit(component, { ...JOHN_ROW });

      expect((component as any).checkSamePassword()).toBeTrue();
    });

    it('is false until both password fields are non-empty and match, in create mode', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openCreate(component);
      const form = (component as any).userForm;

      expect((component as any).checkSamePassword()).toBeFalse();

      form.patchValue({ password: 'Password1', confirmPassword: 'Password2' });
      expect((component as any).checkSamePassword()).toBeFalse();

      form.patchValue({ confirmPassword: 'Password1' });
      expect((component as any).checkSamePassword()).toBeTrue();
    });

    it('shows the mismatch error only once confirmPassword/password has been touched or dirty', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openCreate(component);
      const form = (component as any).userForm;
      form.patchValue({ password: 'Password1', confirmPassword: 'Password2' });

      expect((component as any).shouldShowConfirmPasswordMismatch()).toBeFalse();

      form.get('confirmPassword').markAsTouched();
      expect((component as any).shouldShowConfirmPasswordMismatch()).toBeTrue();
    });

    it('never shows the mismatch error in edit mode', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openEdit(component, { ...JOHN_ROW });

      expect((component as any).shouldShowConfirmPasswordMismatch()).toBeFalse();
    });
  });

  describe('duplicate email/phone checks', () => {
    it('flags emailIsExist after the debounce, only while the modal is open in create mode', fakeAsync(() => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      adminApi.checkUserExistsByEmail.and.returnValue(
        of({ code: 200, message: 'OK', data: true })
      );
      component.ngOnInit();
      openCreate(component);

      (component as any).userForm.get('email').setValue('dup@example.com');
      tick(499);
      expect((component as any).emailIsExist).toBeFalse();
      tick(1);
      expect((component as any).emailIsExist).toBeTrue();
      expect(adminApi.checkUserExistsByEmail).toHaveBeenCalledWith('dup@example.com');
    }));

    it('flags phoneNumberIsExist after the debounce in create mode', fakeAsync(() => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      adminApi.checkUserExistsByPhoneNumber.and.returnValue(
        of({ code: 200, message: 'OK', data: true })
      );
      component.ngOnInit();
      openCreate(component);

      (component as any).userForm.get('phoneNumber').setValue('0899999999');
      tick(500);
      expect((component as any).phoneNumberIsExist).toBeTrue();
    }));

    it('does not call the duplicate-check API while in edit mode', fakeAsync(() => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      component.ngOnInit();
      openEdit(component, { ...JOHN_ROW });

      (component as any).userForm.get('email').setValue('dup@example.com');
      tick(500);

      expect(adminApi.checkUserExistsByEmail).not.toHaveBeenCalled();
    }));

    it('unsubscribes the duplicate-check watchers on destroy', fakeAsync(() => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      component.ngOnInit();
      openCreate(component);

      component.ngOnDestroy();
      (component as any).userForm.get('email').setValue('after-destroy@example.com');
      tick(500);

      expect(adminApi.checkUserExistsByEmail).not.toHaveBeenCalled();
    }));
  });

  describe('submitUser', () => {
    // Byte-for-byte parity with the pre-split UserManagementPageComponent.submitUser
    // on dev: API call -> close -> await success alert -> THEN
    // reloadStructure()/refresh LAST. The modal does not stay open during the
    // refresh. Unlike PromotionFormModalComponent, the invalid-form branch does
    // NOT show an alert.warning() in the original — preserved verbatim.
    it('creates a user, closes immediately, awaits the success alert, then reloadStructure() last', async () => {
      const order: string[] = [];
      const { component, adminApi, alert } = makeComponent(
        new Subject<ResponseAPI<AdminUserDto>>()
      );
      adminApi.createUser.and.callFake(() => {
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
      fillValidCreateForm(component);

      const closedSpy = jasmine.createSpy('closed');
      component.closed.subscribe(() => {
        order.push('closed');
        closedSpy();
      });

      await (component as any).submitUser();

      expect(order).toEqual(['create', 'closed', 'alert', 'reload']);
      expect(closedSpy).toHaveBeenCalled();
    });

    it('updates a user by id when in edit mode', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openEdit(component, { ...JOHN_ROW });
      fillValidCreateForm(component);

      await (component as any).submitUser();

      expect(adminApi.updateUser).toHaveBeenCalledWith(1, jasmine.any(Object));
      expect(component.reloadStructure).toHaveBeenCalled();
    });

    it('marks all fields touched and does not submit when the form is invalid (no alert)', async () => {
      const { component, adminApi, alert } = makeComponent(
        new Subject<ResponseAPI<AdminUserDto>>()
      );
      openCreate(component);

      await (component as any).submitUser();

      expect(adminApi.createUser).not.toHaveBeenCalled();
      expect(alert.success).not.toHaveBeenCalled();
      expect(alert.error).not.toHaveBeenCalled();
      expect((component as any).userForm.get('firstName').touched).toBeTrue();
    });

    it('blocks submission in create mode when the passwords do not match, without calling the API', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openCreate(component);
      fillValidCreateForm(component);
      (component as any).userForm.get('confirmPassword').setValue('Different1');

      await (component as any).submitUser();

      expect(adminApi.createUser).not.toHaveBeenCalled();
    });

    it('blocks submission in create mode when emailIsExist is true, without calling the API', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openCreate(component);
      fillValidCreateForm(component);
      (component as any).emailIsExist = true;

      await (component as any).submitUser();

      expect(adminApi.createUser).not.toHaveBeenCalled();
    });

    it('alerts an error and emits closed, without calling reloadStructure, on API failure', async () => {
      const getUserById$ = new Subject<ResponseAPI<AdminUserDto>>();
      const adminApi = {
        getUserById: jasmine.createSpy('getUserById').and.returnValue(getUserById$.asObservable()),
        createUser: jasmine.createSpy('createUser').and.returnValue(throwError(() => new Error('boom'))),
        updateUser: jasmine.createSpy('updateUser'),
        checkUserExistsByEmail: jasmine
          .createSpy('checkUserExistsByEmail')
          .and.returnValue(of({ code: 200, message: 'OK', data: false })),
        checkUserExistsByPhoneNumber: jasmine
          .createSpy('checkUserExistsByPhoneNumber')
          .and.returnValue(of({ code: 200, message: 'OK', data: false })),
      };
      const alert = {
        success: jasmine.createSpy('success').and.resolveTo(undefined),
        error: jasmine.createSpy('error').and.resolveTo(undefined),
      };
      const component = new UserFormModalComponent(
        adminApi as any,
        new FormBuilder(),
        alert as any,
        createTranslateStub()
      );
      component.roleOptions = [{ slug: 'admin', label: 'Admin' }];
      component.statusOptions = [{ code: 'active', label: 'Active' }];
      component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
      openCreate(component);
      fillValidCreateForm(component);

      const closedSpy = jasmine.createSpy('closed');
      component.closed.subscribe(closedSpy);

      await (component as any).submitUser();

      expect(alert.error).toHaveBeenCalledWith('boom');
      expect(closedSpy).toHaveBeenCalled();
      expect(component.reloadStructure).not.toHaveBeenCalled();
    });
  });
});
