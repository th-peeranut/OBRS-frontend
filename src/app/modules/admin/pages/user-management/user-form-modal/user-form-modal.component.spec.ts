import { HttpErrorResponse } from '@angular/common/http';
import { SimpleChange } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { UserFormModalComponent } from './user-form-modal.component';
import { AdminUserDto } from '../../../../../services/admin/admin-api.service';
import { SALES_POINT_ACTIVE_NONE, UserRow } from '../user-management.mappers';
import { ResponseAPI } from '../../../../../shared/interfaces/response.interface';
import { createTranslateStub } from '../../../../../testing/test-stubs';

// OBRS-1230: real (not parsed/guessed) name parts, same as toUserRow now
// carries from the list endpoint's AdminUserDto — this fixture is built by
// hand rather than through toUserRow, so it has to state them explicitly to
// stay representative of what a real (non-guest) row looks like.
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
  title: 'Mr',
  firstName: 'John',
  middleName: '',
  lastName: 'Doe',
  guest: false,
};

// OBRS-1255 / ADR-0123: what toUserRow produces for a guest shadow row. Every field here is a
// consequence of GuestUserService#newShadowUser, not a convenient fixture: NULL email (so the row
// carries `null`, not the list's '-'), zero roles, and the whole composed name still in firstName
// because title/last_name were never populated (the defect OBRS-1230 fixed going forward).
const GUEST_ROW: UserRow = {
  id: 7,
  fullName: 'Miss กุลธิดา นาใจคง',
  email: null,
  phone: '0812345678',
  roleSlugs: [],
  roles: ['-'],
  status: 'Active',
  statusCode: 'active',
  lastLogin: '-',
  hasLoggedIn: false,
  locked: false,
  title: '',
  firstName: 'Miss กุลธิดา นาใจคง',
  middleName: '',
  lastName: '',
  guest: true,
};

/** The name split an admin types in to repair a guest row — the whole reason the row must save. */
function fillGuestName(component: UserFormModalComponent): void {
  (component as any).userForm.patchValue({
    title: 'Miss',
    firstName: 'กุลธิดา',
    lastName: 'นาใจคง',
  });
}

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
    // OBRS-1258: harmless default for every pre-existing test (none of them select the
    // 'salesperson' role, so updateUserSalesPoints is never expected to be called).
    getDriverCashSalesPoints: jasmine
      .createSpy('getDriverCashSalesPoints')
      .and.returnValue(of({ code: 200, message: 'OK', data: [] })),
    updateUserSalesPoints: jasmine
      .createSpy('updateUserSalesPoints')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
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

  // OBRS-1232: the field became a dropdown over a stable code. The risk that came with it is
  // narrow and expensive: this control was free text for months, so a row can hold a value that is
  // not one of the nine codes, and a select with no matching option shows blank - after which a
  // Save that changed nothing else WIPES it. That is the OBRS-1230 shape (a modal guessing at data
  // it could not represent) and it is what `legacyTitleValue` exists to stop.
  describe('title dropdown (OBRS-1232)', () => {
    it('offers no extra option when the stored title is one of the nine codes', async () => {
      const getUserById$ = new Subject<ResponseAPI<AdminUserDto>>();
      const { component } = makeComponent(getUserById$);

      const promise = openEditAwait(component, { ...JOHN_ROW, title: 'MISS' });
      getUserById$.next(detailResponse({ title: 'MISS' }));
      getUserById$.complete();
      await promise;

      expect((component as any).legacyTitleValue).toBeNull();
      expect((component as any).userForm.get('title').value).toBe('MISS');
    });

    it('keeps an unmappable legacy value as its own option, so a Save cannot drop it', async () => {
      const getUserById$ = new Subject<ResponseAPI<AdminUserDto>>();
      const { component } = makeComponent(getUserById$);

      const promise = openEditAwait(component, { ...JOHN_ROW, title: 'คุณ' });
      getUserById$.next(detailResponse({ title: 'คุณ' }));
      getUserById$.complete();
      await promise;

      expect((component as any).legacyTitleValue).toBe('คุณ');
      expect((component as any).userForm.get('title').value).toBe('คุณ');
    });

    it('accepts a blank title - no title is a valid answer (OBRS-1231) and length no longer rules', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openCreate(component);

      const ctrl = (component as any).userForm.get('title');
      ctrl.setValue('');
      expect(ctrl.valid).toBeTrue();
      expect((component as any).legacyTitleValue).toBeNull();
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

  // ── OBRS-1255 ───────────────────────────────────────────────────────────────────────────────
  describe('guest shadow row (ADR-0123)', () => {
    it('AC2: the form is VALID with zero roles, because the roles control is disabled - the old form could not submit at all', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());

      openEdit(component, GUEST_ROW);
      fillGuestName(component);

      // The reporter of this card had to tick a role to make the form valid — which is exactly the
      // action AC2 forbids — and only then reached the 400. Disabling the control (not just hiding
      // the chips) is what removes roleRequiredValidator from the group's validity.
      expect((component as any).userForm.get('roles').value).toEqual([]);
      expect((component as any).userForm.get('roles').disabled).toBeTrue();
      expect((component as any).userForm.valid).toBeTrue();

      await (component as any).submitUser();

      expect(adminApi.updateUser).toHaveBeenCalled();
    });

    it('AC2: the payload carries no email, roles or isPhoneNumberVerify key, and no "-" anywhere', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openEdit(component, GUEST_ROW);
      fillGuestName(component);

      await (component as any).submitUser();

      const payload = adminApi.updateUser.calls.mostRecent().args[1];
      expect('email' in payload).toBeFalse();
      expect('roles' in payload).toBeFalse();
      expect('isPhoneNumberVerify' in payload).toBeFalse();
      expect(JSON.stringify(payload)).not.toContain('-');
    });

    it('AC2: phone and locale are disabled but still SENT - they hold real values, and the number is the key a later registration is matched on', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      openEdit(component, GUEST_ROW);
      fillGuestName(component);

      expect((component as any).userForm.get('phoneNumber').disabled).toBeTrue();
      expect((component as any).userForm.get('preferredLocale').disabled).toBeTrue();

      await (component as any).submitUser();

      expect(adminApi.updateUser.calls.mostRecent().args[1].phoneNumber).toBe('0812345678');
    });

    it('must NOT catch: re-opening on an ordinary row after a guest one re-enables everything', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());

      openEdit(component, GUEST_ROW);
      (component as any).isOpen = false;
      component.ngOnChanges({ isOpen: new SimpleChange(true, false, false) });
      openEdit(component, { ...JOHN_ROW });

      const form = (component as any).userForm;
      expect(form.get('roles').disabled).toBeFalse();
      expect(form.get('phoneNumber').disabled).toBeFalse();
      expect(form.get('preferredLocale').disabled).toBeFalse();
    });

    it('reads the guest flag off the ROW, not off "this row happens to have no roles"', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());

      // A real account mid-cleanup can hold zero roles; it is still not a shadow row, and the
      // server would (correctly) still refuse a payload with no roles for it.
      openEdit(component, { ...JOHN_ROW, roleSlugs: [], roles: ['-'], guest: false });

      expect((component as any).isGuestRowEdit).toBeFalse();
      expect((component as any).userForm.get('roles').disabled).toBeFalse();
    });
  });

  describe('field-bound 400 (OBRS-1255 AC3)', () => {
    function componentWithUpdateError(body: unknown) {
      const { component, adminApi, alert } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      adminApi.updateUser.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 400, error: body }))
      );
      return { component, adminApi, alert };
    }

    it('keeps the modal OPEN and pins the reason to the field the server named', async () => {
      const { component, alert } = componentWithUpdateError({
        errorCode: 'VALIDATION_FAILED',
        message: 'Validation Failed',
        errors: [{ field: 'email', rejectedValue: '-', reason: 'must be valid' }],
      });
      openEdit(component, { ...JOHN_ROW });
      fillValidCreateForm(component);

      const closedSpy = jasmine.createSpy('closed');
      component.closed.subscribe(closedSpy);

      await (component as any).submitUser();

      // The old branch closed the modal and showed one generic "ข้อมูลไม่ผ่านการตรวจสอบ" — the
      // operator lost the form AND was never told which value was refused. For `email`, which is
      // disabled in edit mode, they could not even see it on the way past.
      expect(closedSpy).not.toHaveBeenCalled();
      expect(alert.error).not.toHaveBeenCalled();
      expect((component as any).serverFieldErrors['email']).toBe('must be valid');
    });

    it('must NOT catch: an error with no errors[] still closes and alerts, exactly as before', async () => {
      const { component, alert } = componentWithUpdateError({
        errorCode: 'USER_ERROR_UNAUTHORIZED',
        message: 'You are not authorized to manage this account',
      });
      openEdit(component, { ...JOHN_ROW });
      fillValidCreateForm(component);

      const closedSpy = jasmine.createSpy('closed');
      component.closed.subscribe(closedSpy);

      await (component as any).submitUser();

      expect(closedSpy).toHaveBeenCalled();
      expect(alert.error).toHaveBeenCalledWith('You are not authorized to manage this account');
      expect((component as any).serverFieldErrors).toEqual({});
    });

    it('clears a previous rejection when the modal is re-opened, so it never labels a value that is gone', async () => {
      const { component } = componentWithUpdateError({
        errorCode: 'VALIDATION_FAILED',
        errors: [{ field: 'email', rejectedValue: '-', reason: 'must be valid' }],
      });
      openEdit(component, { ...JOHN_ROW });
      fillValidCreateForm(component);
      await (component as any).submitUser();
      expect((component as any).serverFieldErrors['email']).toBeDefined();

      (component as any).isOpen = false;
      component.ngOnChanges({ isOpen: new SimpleChange(true, false, false) });

      expect((component as any).serverFieldErrors).toEqual({});
    });
  });

  // ── OBRS-1258 ───────────────────────────────────────────────────────────────────────────────
  describe('sales points (edit mode, salesperson only)', () => {
    const SALESPERSON_ROW: UserRow = {
      ...JOHN_ROW,
      roleSlugs: ['salesperson'],
      roles: ['Salesperson'],
    };

    function makeComponentWithSalesPoints(
      getUserById$: Subject<ResponseAPI<AdminUserDto>> = new Subject<ResponseAPI<AdminUserDto>>()
    ) {
      const result = makeComponent(getUserById$);
      (result.adminApi as any).getDriverCashSalesPoints = jasmine
        .createSpy('getDriverCashSalesPoints')
        .and.returnValue(
          of({
            code: 200,
            message: 'OK',
            data: [
              { id: 1, code: 'NONG_CHAK', name: 'Nong Chak' },
              { id: 2, code: 'BAN_BUENG', name: 'Ban Bueng' },
            ],
          })
        );
      result.component.roleOptions = [
        ...result.component.roleOptions,
        { slug: 'salesperson', label: 'Salesperson' },
      ];
      return result;
    }

    // SEV1 (Scrutinize findings 1+6): activeSalesPointCode MUST be seeded in initCreateForm's
    // reset object, or FormGroup.reset(value) resets it to null and — combined with no
    // Validators.required on the control — the create form would still be well-formed, but a
    // regression that instead added `required` to the control would make it permanently
    // invalid with no visible error (the field is hidden in create mode). Both halves covered:
    it('SEV1: activeSalesPointCode/allowedSalesPointCodes are seeded (not null) in create mode', () => {
      const { component } = makeComponentWithSalesPoints();
      openCreate(component);

      const form = (component as any).userForm;
      // Not null (FormGroup.reset(value) resets any ABSENT key to null) and not undefined —
      // both would break the well-formed-value assumption the getters/toggle methods rely on.
      expect(form.value['activeSalesPointCode']).toBe(SALES_POINT_ACTIVE_NONE);
      expect(form.value['allowedSalesPointCodes']).toEqual([]);
      // Neither new control contributes an error on its own (no validators) — any invalidity
      // at this point in create mode belongs entirely to the still-blank required fields.
      expect(form.get('activeSalesPointCode').errors).toBeNull();
      expect(form.get('allowedSalesPointCodes').errors).toBeNull();
    });

    it('SEV1: drives the create modal all the way to a successful Save', async () => {
      const { component, adminApi } = makeComponentWithSalesPoints();
      openCreate(component);
      fillValidCreateForm(component);

      await (component as any).submitUser();

      expect(adminApi.createUser).toHaveBeenCalled();
    });

    it('AC1: isSalespersonSelected is false for a non-salesperson row', () => {
      const { component } = makeComponentWithSalesPoints();
      openEdit(component, { ...JOHN_ROW });

      expect((component as any).isSalespersonSelected).toBeFalse();
    });

    it('AC1: isSalespersonSelected flips live off the roles chip list, same source of truth isRoleChecked reads', () => {
      const { component } = makeComponentWithSalesPoints();
      openEdit(component, { ...JOHN_ROW });
      expect((component as any).isSalespersonSelected).toBeFalse();

      (component as any).toggleRoleSelection('salesperson', true);
      expect((component as any).isSalespersonSelected).toBeTrue();

      (component as any).toggleRoleSelection('salesperson', false);
      expect((component as any).isSalespersonSelected).toBeFalse();
    });

    it('loads sales point options once per edit-modal open, NOT gated on isSalespersonSelected', fakeAsync(() => {
      const { component } = makeComponentWithSalesPoints();
      openEdit(component, { ...JOHN_ROW }); // not a salesperson
      tick();

      expect((component as any).salesPointOptions.length).toBe(2);
      expect((component as any).salesPointsLoadState).toBe('loaded');
    }));

    it('sets salesPointsLoadState to "error" (not "loaded" with an empty list) when the fetch fails', fakeAsync(() => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<AdminUserDto>>());
      (adminApi as any).getDriverCashSalesPoints = jasmine
        .createSpy('getDriverCashSalesPoints')
        .and.returnValue(throwError(() => new Error('network error')));

      openEdit(component, { ...JOHN_ROW });
      tick();

      expect((component as any).salesPointsLoadState).toBe('error');
      expect((component as any).salesPointOptions).toEqual([]);
    }));

    it('AC2: removing the currently-active point from the allowed set clears the active field immediately', () => {
      const { component } = makeComponentWithSalesPoints();
      openEdit(component, { ...SALESPERSON_ROW });

      (component as any).toggleSalesPointSelection('NONG_CHAK', true);
      (component as any).toggleSalesPointSelection('BAN_BUENG', true);
      (component as any).userForm.patchValue({ activeSalesPointCode: 'BAN_BUENG' });

      (component as any).toggleSalesPointSelection('BAN_BUENG', false);

      expect((component as any).userForm.value['allowedSalesPointCodes']).toEqual(['NONG_CHAK']);
      expect((component as any).userForm.value['activeSalesPointCode']).toBe(SALES_POINT_ACTIVE_NONE);
    });

    it('AC2: removing a point that is NOT the active one leaves the active field untouched', () => {
      const { component } = makeComponentWithSalesPoints();
      openEdit(component, { ...SALESPERSON_ROW });

      (component as any).toggleSalesPointSelection('NONG_CHAK', true);
      (component as any).toggleSalesPointSelection('BAN_BUENG', true);
      (component as any).userForm.patchValue({ activeSalesPointCode: 'BAN_BUENG' });

      (component as any).toggleSalesPointSelection('NONG_CHAK', false);

      expect((component as any).userForm.value['activeSalesPointCode']).toBe('BAN_BUENG');
    });

    it('activeSalesPointOptions offers the sentinel plus only currently-ALLOWED codes', fakeAsync(() => {
      const { component } = makeComponentWithSalesPoints();
      openEdit(component, { ...SALESPERSON_ROW });
      tick();

      (component as any).toggleSalesPointSelection('NONG_CHAK', true);

      const options = (component as any).activeSalesPointOptions as { value: string }[];
      expect(options.map((o) => o.value)).toEqual([SALES_POINT_ACTIVE_NONE, 'NONG_CHAK']);
    }));

    it('AC4: pre-selects both fields from the fetched detail', async () => {
      const getUserById$ = new Subject<ResponseAPI<AdminUserDto>>();
      const { component } = makeComponentWithSalesPoints(getUserById$);

      const promise = openEditAwait(component, { ...SALESPERSON_ROW });
      getUserById$.next(
        detailResponse({
          roles: ['salesperson'],
          salesPointCodes: ['NONG_CHAK', 'BAN_BUENG'],
          activeSalesPointCode: 'BAN_BUENG',
        })
      );
      getUserById$.complete();
      await promise;

      const form = (component as any).userForm;
      expect(form.value['allowedSalesPointCodes']).toEqual(['NONG_CHAK', 'BAN_BUENG']);
      expect(form.value['activeSalesPointCode']).toBe('BAN_BUENG');
    });

    it('AC3: saving an empty allowed set sends a true clear (empty array + null active)', async () => {
      const { component, adminApi } = makeComponentWithSalesPoints();
      openEdit(component, { ...SALESPERSON_ROW });
      fillValidCreateForm(component);
      (component as any).userForm.patchValue({ roles: ['salesperson'] });

      await (component as any).submitUser();

      expect(adminApi.updateUserSalesPoints).toHaveBeenCalledWith(1, {
        salesPointCodes: [],
        activeSalesPointCode: null,
      });
    });

    it('AC5: a non-salesperson save does not call the sales-points endpoint at all', async () => {
      const { component, adminApi } = makeComponentWithSalesPoints();
      openEdit(component, { ...JOHN_ROW }); // admin only, never salesperson
      fillValidCreateForm(component);

      await (component as any).submitUser();

      expect(adminApi.updateUser).toHaveBeenCalled();
      expect(adminApi.updateUserSalesPoints).not.toHaveBeenCalled();
    });

    it('base PUT + sales-points PUT both fire, base first, when editing a salesperson', async () => {
      const order: string[] = [];
      const { component, adminApi } = makeComponentWithSalesPoints();
      adminApi.updateUser.and.callFake(() => {
        order.push('updateUser');
        return of({ code: 200, message: 'OK', data: null });
      });
      (adminApi as any).updateUserSalesPoints.and.callFake(() => {
        order.push('updateUserSalesPoints');
        return of({ code: 200, message: 'OK', data: null });
      });
      openEdit(component, { ...SALESPERSON_ROW });
      fillValidCreateForm(component);
      (component as any).userForm.patchValue({ roles: ['salesperson'] });

      await (component as any).submitUser();

      expect(order).toEqual(['updateUser', 'updateUserSalesPoints']);
    });
  });
});
