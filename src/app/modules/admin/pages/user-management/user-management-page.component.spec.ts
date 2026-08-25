import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { UserManagementPageComponent } from './user-management-page.component';
import { AdminApiService, AdminUserDto } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { AuthService } from '../../../../auth/auth.service';
import { UsersStore } from './users.store';
import { RoleOption } from './user-management.mappers';
import { createTranslateStub } from '../../../../testing/test-stubs';

const USER_ROW = {
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

const USER_DTO: AdminUserDto = {
  id: 1,
  fullName: 'Mr John Doe',
  email: 'john@example.com',
  phoneNumber: '0812345678',
  status: 'active',
  roles: ['admin'],
};

function makeStoreStub() {
  const data$ = new BehaviorSubject<{
    users: AdminUserDto[];
    roles: unknown[];
    lookups: unknown[];
  } | null>(null);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    mutate: jasmine
      .createSpy('mutate')
      .and.callFake((transform: (current: typeof data$.value) => typeof data$.value) => {
        if (data$.value !== null) {
          data$.next(transform(data$.value));
        }
      }),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

// OBRS-847: `heldRoles` is the caller's RAW roles, and `hasAnyRole` keeps
// returning true for every one of them — that is not laziness, it is the real
// AuthService contract (ROLE_GRANTS gives owner and admin each other's
// grants). A stub where hasAnyRole tracked the held role would hide the very
// bug this card is about.
function makeComponent(
  adminApi: Record<string, unknown> = {},
  store = makeStoreStub(),
  heldRoles: string[] = ['admin']
) {
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  const authService = {
    hasAnyRole: jasmine.createSpy('hasAnyRole').and.returnValue(true),
    getRoles: jasmine.createSpy('getRoles').and.returnValue(heldRoles),
  };
  const component = new UserManagementPageComponent(
    adminApi as any,
    alert as any,
    createTranslateStub(),
    store as any,
    authService as any
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, store, alert, authService };
}

describe('UserManagementPageComponent', () => {
  it('subscribes to store.data$ and calls store.refresh() on init — no direct fetch', () => {
    const { component, store } = makeComponent();

    component.ngOnInit();

    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('maps every raw user into a row', () => {
    const { component, store } = makeComponent();

    component.ngOnInit();
    store.data$.next({ users: [USER_DTO], roles: [], lookups: [] });

    expect(component.users.length).toBe(1);
    expect(component.users[0].fullName).toBe('Mr John Doe');
  });

  // OBRS-330: applyLocalization wires a translateFn (translate.instant) into
  // toUserRow so the Roles column localizes like the Status column already
  // does. createTranslateStub()'s instant() is an identity function (no
  // ADMIN.USERS.ROLE_NAMES.* keys resolve), which is exactly the "unknown
  // translation" case toUserRow/extractRoleLabels must fall back on — so the
  // bare "admin" slug from USER_DTO.roles should render as the prettified
  // "Admin" fallback, never the raw slug and never a raw i18n key.
  it('localizes the role slug via translate.instant, falling back to a prettified label', () => {
    const { component, store } = makeComponent();

    component.ngOnInit();
    store.data$.next({ users: [USER_DTO], roles: [], lookups: [] });

    expect(component.users[0].roleSlugs).toEqual(['admin']);
    expect(component.users[0].roles).toEqual(['Admin']);
  });

  // OBRS-182: real last-login flows through the page's mapping, not just the
  // pure mapper unit (user-management.mappers.spec.ts covers the mapper
  // logic itself).
  it('maps a user with lastLoginAt into a row with hasLoggedIn true', () => {
    const { component, store } = makeComponent();

    component.ngOnInit();
    store.data$.next({
      users: [{ ...USER_DTO, lastLoginAt: '2026-07-10T02:00:00Z' }],
      roles: [],
      lookups: [],
    });

    expect(component.users[0].hasLoggedIn).toBeTrue();
  });

  it('maps a user with no lastLoginAt into a row with hasLoggedIn false (never falls back to updatedAt)', () => {
    const { component, store } = makeComponent();

    component.ngOnInit();
    store.data$.next({ users: [USER_DTO], roles: [], lookups: [] });

    expect(component.users[0].hasLoggedIn).toBeFalse();
  });

  // OBRS-506: a null emission (clear(), e.g. on logout) must reset the
  // cached users, not leave a previous session's rows on screen — same shape
  // as the already-fixed usability-reports-page.component.ts (OBRS-467).
  it('clears users when the store emits null (OBRS-506)', () => {
    const { component, store } = makeComponent();

    component.ngOnInit();
    store.data$.next({ users: [USER_DTO], roles: [], lookups: [] });
    expect(component.users.length).toBe(1);

    store.data$.next(null);

    expect(component.users)
      .withContext('a null emission must not leave the previous session\'s rows on screen')
      .toEqual([]);
  });

  // OBRS-257: the form/table/delete/unlock markup and their FormGroup/API
  // calls moved into child components (UserFormModalComponent /
  // UserListTableComponent / UserDeleteModalComponent /
  // UserUnlockModalComponent) — the page now only sets the
  // modal-orchestration state those children are bound to. Coverage for form
  // validation/submit/edit-fetch/credential logic/duplicate-check lives in
  // user-form-modal.component.spec.ts.
  describe('modal orchestration', () => {
    it('openCreateModal() opens the form modal in create mode with no selection', () => {
      const { component } = makeComponent();
      component.ngOnInit();

      component.openCreateModal();

      expect(component.mode).toBe('create');
      expect(component.selectedUser).toBeNull();
      expect(component.isFormModalOpen).toBeTrue();
    });

    it('openEditModal() opens the form modal in edit mode with the given row — synchronously, no detail fetch here', () => {
      const { component } = makeComponent();
      component.ngOnInit();

      component.openEditModal({ ...USER_ROW });

      expect(component.mode).toBe('edit');
      expect(component.selectedUser).toEqual({ ...USER_ROW });
      expect(component.isFormModalOpen).toBeTrue();
    });

    it('onFormModalClosed() closes the form modal and clears the selection', () => {
      const { component } = makeComponent();
      component.ngOnInit();
      component.openEditModal({ ...USER_ROW });

      component.onFormModalClosed();

      expect(component.isFormModalOpen).toBeFalse();
      expect(component.selectedUser).toBeNull();
    });

    it('reloadStructureBound() delegates to store.refresh()', () => {
      const { component, store } = makeComponent();

      component.reloadStructureBound();

      expect(store.refresh).toHaveBeenCalled();
    });
  });

  describe('delete modal', () => {
    it('openDeleteModal opens the confirm dialog for the given user', () => {
      const { component } = makeComponent();
      component.ngOnInit();

      component.openDeleteModal({ ...USER_ROW });

      expect(component.isDeleteModalOpen).toBeTrue();
      expect(component.selectedUser).toEqual({ ...USER_ROW });
    });

    it('closeDeleteModal does not close while deleting unless forced', () => {
      const { component } = makeComponent();
      component.ngOnInit();
      component.openDeleteModal({ ...USER_ROW });
      component.isDeleting = true;

      component.closeDeleteModal();
      expect(component.isDeleteModalOpen).toBeTrue();

      component.closeDeleteModal(true);
      expect(component.isDeleteModalOpen).toBeFalse();
    });

    it('confirmDelete() calls DELETE and optimistically removes the row before the alert', async () => {
      const deleteSpy = jasmine
        .createSpy('deleteUser')
        .and.returnValue(of({ code: 200, message: 'OK', data: null }));
      const { component, store, alert } = makeComponent({ deleteUser: deleteSpy });
      component.ngOnInit();
      store.data$.next({ users: [USER_DTO], roles: [], lookups: [] });

      component.openDeleteModal(component.users[0]);
      await component.confirmDelete();

      expect(deleteSpy).toHaveBeenCalledWith(1);
      const updated = store.data$.value as { users: AdminUserDto[] };
      expect(updated.users.length).toBe(0);
      // OBRS-653: the row is anonymised and kept, so the toast the admin will
      // quote back to the customer must not be the generic "deleted" one.
      expect(alert.success).toHaveBeenCalledWith('ADMIN.USERS.CLOSE_SUCCESS');
    });

    it('confirmDelete() shows an error alert and does not mutate the list on failure', async () => {
      const deleteSpy = jasmine.createSpy('deleteUser').and.returnValue(throwError(() => new Error('boom')));
      const { component, store, alert } = makeComponent({ deleteUser: deleteSpy });
      component.ngOnInit();
      store.data$.next({ users: [USER_DTO], roles: [], lookups: [] });

      component.openDeleteModal(component.users[0]);
      await component.confirmDelete();

      expect(alert.error).toHaveBeenCalled();
      const updated = store.data$.value as { users: AdminUserDto[] };
      expect(updated.users.length).toBe(1);
    });
  });

  describe('unlock modal', () => {
    it('openUnlockModal opens the confirm dialog for the given user', () => {
      const { component } = makeComponent();
      component.ngOnInit();

      component.openUnlockModal({ ...USER_ROW, locked: true });

      expect(component.isUnlockModalOpen).toBeTrue();
      expect(component.selectedUser).toEqual({ ...USER_ROW, locked: true });
    });

    it('closeUnlockModal keeps the selection when the delete modal is still open', () => {
      const { component } = makeComponent();
      component.ngOnInit();
      component.openDeleteModal({ ...USER_ROW });
      component.openUnlockModal({ ...USER_ROW });

      component.closeUnlockModal(true);

      expect(component.isUnlockModalOpen).toBeFalse();
      expect(component.selectedUser).not.toBeNull();
    });

    it('confirmUnlock() calls unlockUser and optimistically clears the locked flag', async () => {
      const unlockSpy = jasmine
        .createSpy('unlockUser')
        .and.returnValue(of({ code: 200, message: 'OK', data: null }));
      const { component, store } = makeComponent({ unlockUser: unlockSpy });
      component.ngOnInit();
      store.data$.next({ users: [{ ...USER_DTO, locked: true }], roles: [], lookups: [] });

      component.openUnlockModal(component.users[0]);
      await component.confirmUnlock();

      expect(unlockSpy).toHaveBeenCalledWith(1);
      const updated = store.data$.value as { users: AdminUserDto[] };
      expect(updated.users[0].locked).toBeFalse();
    });
  });

  // OBRS-847 / ADR-0114. Note what the stub does NOT do: `hasAnyRole` returns
  // true throughout, exactly as the real AuthService does for an owner
  // (ROLE_GRANTS lists 'admin' among owner's grants). So a filter gated on
  // hasAnyRole(['admin']) would pass every "admin" case below and fail every
  // "owner" one — these tests catch that substitution rather than assuming it
  // away.
  describe('role filter options', () => {
    const ALL_ROLES = [
      { slug: 'admin', name: 'Admin' },
      { slug: 'owner', name: 'Owner' },
      { slug: 'salesperson', name: 'Salesperson' },
      { slug: 'driver', name: 'Driver' },
      { slug: 'customer', name: 'Customer' },
    ];

    function loadRolesAs(heldRoles: string[]) {
      const store = makeStoreStub();
      const { component } = makeComponent({}, store, heldRoles);
      component.ngOnInit();
      store.data$.next({ users: [], roles: ALL_ROLES, lookups: [] });
      return component;
    }

    it('hides customer and admin from an OWNER', () => {
      const component = loadRolesAs(['owner']);

      const slugs = component.roleFilterOptions.map((option: RoleOption) => option.slug);
      expect(slugs).not.toContain('customer');
      expect(slugs).not.toContain('admin');
    });

    it('still offers an OWNER every staff role their list can contain', () => {
      const component = loadRolesAs(['owner']);

      expect(component.roleFilterOptions.map((option: RoleOption) => option.slug)).toEqual([
        'owner',
        'salesperson',
        'driver',
      ]);
    });

    it('leaves a platform ADMIN the full list', () => {
      const component = loadRolesAs(['admin']);

      expect(component.roleFilterOptions.map((option: RoleOption) => option.slug)).toEqual([
        'admin',
        'owner',
        'salesperson',
        'driver',
        'customer',
      ]);
    });

    // AC4: the form modal reads `roleOptions`, whose question is "which roles
    // may I ASSIGN" — the backend still lets an OWNER create a CUSTOMER
    // (UserService#validateAssignableRoles). Narrowing the filter must not
    // quietly narrow that.
    it('leaves the FORM role list untouched for an OWNER', () => {
      const component = loadRolesAs(['owner']);

      expect(component.roleOptions.map((option: RoleOption) => option.slug)).toEqual([
        'admin',
        'owner',
        'salesperson',
        'driver',
        'customer',
      ]);
    });

    it('clears a selected role filter that the narrowed list no longer offers', () => {
      const store = makeStoreStub();
      const { component } = makeComponent({}, store, ['owner']);
      component.ngOnInit();
      component.selectedRoleFilter = 'customer';

      store.data$.next({ users: [], roles: ALL_ROLES, lookups: [] });

      expect(component.selectedRoleFilter).toBe('');
    });
  });

  describe('hasAdminRole', () => {
    it('delegates to AuthService.hasAnyRole(["admin"])', () => {
      const { component, authService } = makeComponent();

      component.hasAdminRole();

      expect(authService.hasAnyRole).toHaveBeenCalledWith(['admin']);
    });
  });
});

// ── OBRS-257: child extraction — verify the page wires the right inputs to
// app-user-list-table / app-user-form-modal / app-user-delete-modal /
// app-user-unlock-modal and delegates their outputs to the existing
// handlers. Uses NO_ERRORS_SCHEMA (established pattern in this codebase,
// e.g. promotions-page.component.spec.ts) so the child selectors don't need
// to be declared.
describe('UserManagementPageComponent template wiring to child components', () => {
  let fixture: ComponentFixture<UserManagementPageComponent>;
  let component: UserManagementPageComponent;
  let store: ReturnType<typeof makeStoreStub>;

  beforeEach(async () => {
    store = makeStoreStub();
    const adminApi = {
      deleteUser: jasmine.createSpy('deleteUser'),
      unlockUser: jasmine.createSpy('unlockUser'),
    };
    const alert = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };
    // OBRS-847: an OWNER, not an admin — for a platform admin the two role
    // lists are the same array, so a binding assertion made under an admin
    // would pass whichever of them the template names.
    const authService = {
      hasAnyRole: jasmine.createSpy('hasAnyRole').and.returnValue(true),
      getRoles: jasmine.createSpy('getRoles').and.returnValue(['owner']),
    };

    await TestBed.configureTestingModule({
      declarations: [UserManagementPageComponent],
      imports: [CommonModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: UsersStore, useValue: store },
        { provide: AdminApiService, useValue: adminApi },
        { provide: AlertService, useValue: alert },
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserManagementPageComponent);
    component = fixture.componentInstance;
  });

  it('app-user-list-table receives rows/isLoading/skeletonRows/hasError/canUnlock/totalCount', () => {
    fixture.detectChanges(); // run ngOnInit first
    (component as any).filteredUsers = [{ ...USER_ROW }];
    (component as any).users = [{ ...USER_ROW }, { ...USER_ROW, id: 2 }];
    (component as any).errorMessage = 'boom';
    fixture.detectChanges();

    const table = fixture.debugElement.query(By.css('app-user-list-table'));
    expect(table.properties['rows']).toBe((component as any).filteredUsers);
    expect(table.properties['skeletonRows']).toBe((component as any).skeletonRows);
    expect(table.properties['hasError']).toBeTrue();
    expect(table.properties['canUnlock']).toBeTrue();
    expect(table.properties['totalCount']).toBe(2);
  });

  it('app-user-form-modal receives isOpen/mode/selectedUser/option lists/reloadStructure', () => {
    fixture.detectChanges();
    (component as any).openEditModal({ id: 2, fullName: 'Jane' });
    fixture.detectChanges();

    const modal = fixture.debugElement.query(By.css('app-user-form-modal'));
    expect(modal.properties['isOpen']).toBeTrue();
    expect(modal.properties['mode']).toBe('edit');
    expect(modal.properties['selectedUser']).toEqual({ id: 2, fullName: 'Jane' });
    expect(modal.properties['reloadStructure']).toBe((component as any).reloadStructureBound);
  });

  it('delegates (edit)/(delete)/(unlock) from the list table to the matching open*Modal handlers', () => {
    fixture.detectChanges();
    spyOn(component as any, 'openEditModal');
    spyOn(component as any, 'openDeleteModal');
    spyOn(component as any, 'openUnlockModal');

    const table = fixture.debugElement.query(By.css('app-user-list-table'));
    const row = { id: 2, fullName: 'Jane' };
    table.triggerEventHandler('edit', row);
    table.triggerEventHandler('delete', row);
    table.triggerEventHandler('unlock', row);

    expect((component as any).openEditModal).toHaveBeenCalledWith(row);
    expect((component as any).openDeleteModal).toHaveBeenCalledWith(row);
    expect((component as any).openUnlockModal).toHaveBeenCalledWith(row);
  });

  it('delegates (closed) from the form modal to onFormModalClosed', () => {
    fixture.detectChanges();
    spyOn(component as any, 'onFormModalClosed');

    const modal = fixture.debugElement.query(By.css('app-user-form-modal'));
    modal.triggerEventHandler('closed', undefined);

    expect((component as any).onFormModalClosed).toHaveBeenCalled();
  });

  // OBRS-847: what reaches the DOM, not just what the component computed —
  // the whole card is one binding, and the two lists it chooses between are
  // both non-empty and both plausible.
  it('gives the role filter dropdown the narrowed list and the form modal the full one', () => {
    fixture.detectChanges();
    store.data$.next({
      users: [],
      roles: [{ slug: 'owner' }, { slug: 'driver' }, { slug: 'customer' }, { slug: 'admin' }],
      lookups: [],
    });
    fixture.detectChanges();

    const dropdown = fixture.debugElement.queryAll(By.css('app-admin-dropdown'))[0];
    const modal = fixture.debugElement.query(By.css('app-user-form-modal'));

    expect(
      (dropdown.properties['options'] as RoleOption[]).map((option) => option.slug)
    ).toEqual(['owner', 'driver']);
    expect((modal.properties['roleOptions'] as RoleOption[]).map((option) => option.slug)).toEqual([
      'owner',
      'driver',
      'customer',
      'admin',
    ]);
  });

  it('delegates (confirm)/(cancel) from the delete and unlock modals to their handlers', () => {
    fixture.detectChanges();
    spyOn(component as any, 'confirmDelete');
    spyOn(component as any, 'closeDeleteModal');
    spyOn(component as any, 'confirmUnlock');
    spyOn(component as any, 'closeUnlockModal');

    const deleteModal = fixture.debugElement.query(By.css('app-user-delete-modal'));
    deleteModal.triggerEventHandler('confirm', undefined);
    deleteModal.triggerEventHandler('cancel', undefined);

    const unlockModal = fixture.debugElement.query(By.css('app-user-unlock-modal'));
    unlockModal.triggerEventHandler('confirm', undefined);
    unlockModal.triggerEventHandler('cancel', undefined);

    expect((component as any).confirmDelete).toHaveBeenCalled();
    expect((component as any).closeDeleteModal).toHaveBeenCalled();
    expect((component as any).confirmUnlock).toHaveBeenCalled();
    expect((component as any).closeUnlockModal).toHaveBeenCalled();
  });
});
