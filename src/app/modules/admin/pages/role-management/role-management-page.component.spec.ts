import { BehaviorSubject, throwError } from 'rxjs';
import { RoleManagementPageComponent } from './role-management-page.component';
import { RoleRow } from './role-management.mappers';
import { createTranslateStub } from '../../../../testing/test-stubs';

// OBRS-263 Phase 2 split: RoleManagementPageComponent is now an orchestrator
// only — the form modal (create/edit/detail-fetch/submit ordering) and the
// delete modal's confirm/cancel rendering moved to RoleFormModalComponent /
// RoleDeleteModalComponent / RoleListTableComponent, with their own specs.
// This spec keeps only what the parent still owns: store wiring, the
// localization pass (incl. the dateLang-vs-locale CRITICAL case), the modal
// open/close orchestration state, and confirmDelete (API + optimistic
// mutate + refresh).

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

interface RolesData {
  roles: Array<{ id: number; slug: string; status: string; translations: unknown[]; updatedAt?: string }>;
  lookups: unknown[];
}

function makeStoreStub() {
  const data$ = new BehaviorSubject<unknown>(null);
  const store = {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    mutate: jasmine.createSpy('mutate').and.callFake((transform: (d: RolesData) => RolesData) => {
      const current = data$.value;
      if (current !== null) {
        data$.next(transform(current as RolesData));
      }
    }),
    get hasValue() {
      return data$.value !== null;
    },
  };
  return store;
}

function makeComponent(translateOverrides: Record<string, unknown> = {}, roles: string[] = ['admin']) {
  const adminApi = {
    deleteRoleById: jasmine.createSpy('deleteRoleById').and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null })),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
  };
  const store = makeStoreStub();
  const translate = { ...createTranslateStub(), ...translateOverrides };
  const component = new RoleManagementPageComponent(adminApi as any, alert as any, translate as any, store as any, { getRoles: () => roles } as any);
  // Subscribe the way ngOnInit does, without invoking ngOnInit's void
  // store.refresh() (irrelevant to these unit tests).
  store.data$.subscribe((data) => {
    if (data) {
      (component as any).rawRoles = (data as RolesData).roles;
      (component as any).rawLookups = (data as RolesData).lookups;
      (component as any).applyLocalization();
    }
  });
  return { component, adminApi, alert, store, translate };
}

/** Resolve after all pending microtasks have flushed. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('RoleManagementPageComponent modal orchestration', () => {
  it('openCreateModal sets mode=create, clears selectedRole, and opens the form modal', () => {
    const { component } = makeComponent();
    (component as any).selectedRole = { ...ROLE_ROW };

    (component as any).openCreateModal();

    expect((component as any).mode).toBe('create');
    expect((component as any).selectedRole).toBeNull();
    expect((component as any).isFormModalOpen).toBeTrue();
  });

  it('openEditModal sets mode=edit, selectedRole, and opens the form modal', () => {
    const { component } = makeComponent();

    (component as any).openEditModal({ ...ROLE_ROW });

    expect((component as any).mode).toBe('edit');
    expect((component as any).selectedRole).toEqual({ ...ROLE_ROW });
    expect((component as any).isFormModalOpen).toBeTrue();
  });

  it('onFormModalClosed closes the modal and clears selectedRole', () => {
    const { component } = makeComponent();
    (component as any).openEditModal({ ...ROLE_ROW });

    (component as any).onFormModalClosed();

    expect((component as any).isFormModalOpen).toBeFalse();
    expect((component as any).selectedRole).toBeNull();
  });

  it('openDeleteModal sets selectedRole and opens the delete modal', () => {
    const { component } = makeComponent();

    (component as any).openDeleteModal({ ...ROLE_ROW });

    expect((component as any).selectedRole).toEqual({ ...ROLE_ROW });
    expect((component as any).isDeleteModalOpen).toBeTrue();
  });

  it('closeDeleteModal is a no-op while isDeleting unless forced', () => {
    const { component } = makeComponent();
    (component as any).openDeleteModal({ ...ROLE_ROW });
    (component as any).isDeleting = true;

    (component as any).closeDeleteModal();
    expect((component as any).isDeleteModalOpen).toBeTrue();

    (component as any).closeDeleteModal(true);
    expect((component as any).isDeleteModalOpen).toBeFalse();
    expect((component as any).selectedRole).toBeNull();
  });
});

describe('RoleManagementPageComponent confirmDelete — optimistic removal', () => {
  // Regression for SIT issue #14: the deleted role must disappear from the
  // rendered table synchronously on confirmDelete(), before the background
  // store.refresh() resolves (~2s on SIT).
  it('removes the deleted role from filteredRoles synchronously, before refresh resolves', async () => {
    const { component, store, alert } = makeComponent();

    const seedData: RolesData = {
      roles: [
        { id: 7, slug: 'owner', status: 'active', translations: [] },
        { id: 9, slug: 'driver', status: 'active', translations: [] },
      ],
      lookups: [],
    };
    store.data$.next(seedData);

    // Make refresh stay pending so we can assert before it resolves.
    let resolveRefresh!: () => void;
    store.refresh.and.returnValue(new Promise<void>((r) => { resolveRefresh = r; }));
    alert.success.and.resolveTo(undefined);

    (component as any).selectedRole = { ...ROLE_ROW, id: 7 };
    (component as any).isDeleteModalOpen = true;

    const done = (component as any).confirmDelete();
    await flush();

    const filteredRoles: Array<{ id: number }> = (component as any).filteredRoles;
    expect(filteredRoles.every((r) => r.id !== 7)).toBeTrue();
    expect(filteredRoles.some((r) => r.id === 9)).toBeTrue();

    resolveRefresh();
    await done;
  });

  it('does nothing when confirmDelete is called with no selectedRole', async () => {
    const { component, adminApi } = makeComponent();
    (component as any).selectedRole = null;

    await (component as any).confirmDelete();

    expect(adminApi.deleteRoleById).not.toHaveBeenCalled();
  });

  it('shows an error alert and closes the modal (forced) on delete failure', async () => {
    const { component, adminApi, alert } = makeComponent();
    adminApi.deleteRoleById.and.returnValue(throwError(() => new Error('boom')));

    (component as any).selectedRole = { ...ROLE_ROW };
    (component as any).isDeleteModalOpen = true;

    await (component as any).confirmDelete();

    expect(alert.error).toHaveBeenCalledWith('boom');
    expect((component as any).isDeleteModalOpen).toBeFalse();
  });
});

describe('RoleManagementPageComponent applyLocalization — dateLang vs locale', () => {
  // CRITICAL: mirrors role-management.mappers.spec.ts's toRoleRow/
  // toLatestTimestamp CRITICAL cases, but exercised through the real page
  // wiring (applyLocalization) to prove the page itself never collapses the
  // raw `translate.currentLang` (dateLang) into the th/en-normalized
  // `locale`. `zh` is chosen deliberately: getCurrentLocale() normalizes any
  // non-"en"-prefixed lang to 'th' (so labels resolve via the th
  // translation), while formatDisplayDateTime's month-name lookup treats
  // 'zh' as its own branch, distinct from 'th' — so if the page had
  // accidentally passed the normalized `locale` ('th') instead of the raw
  // `dateLang` ('zh'), the date would render with Thai month abbreviations
  // instead of Chinese ones, and this test would catch it.
  it('passes the RAW currentLang as dateLang (not the normalized locale) into toRoleRow/toLatestTimestamp', () => {
    const { component, store } = makeComponent({ currentLang: 'zh' });

    const seedData: RolesData = {
      roles: [
        {
          id: 1,
          slug: 'owner',
          status: 'active',
          translations: [{ locale: 'th', label: 'เจ้าของ' }],
          updatedAt: '2026-07-08T03:00:00Z',
        },
      ],
      lookups: [],
    };
    store.data$.next(seedData);

    const roles: RoleRow[] = (component as any).roles;
    // locale normalizes to 'th' (zh doesn't start with 'en') -> label uses
    // the th translation, same as today.
    expect(roles[0].label).toBe('เจ้าของ');
    // ...but the date must reflect the RAW dateLang ('zh'), not 'th'.
    expect(roles[0].updatedAt).toContain('7月');
    expect(roles[0].updatedAt).not.toContain('ก.ค.');
    expect((component as any).lastUpdatedAt).toContain('7月');
  });
});

// OBRS-506: a null emission (clear(), e.g. on logout) must reset the cached
// roles, not leave a previous session's rows on screen — same shape as the
// already-fixed usability-reports-page.component.ts (OBRS-467). Uses the
// component's REAL ngOnInit() (not the manual re-subscribe makeComponent()
// uses above) so the fix under test is actually exercised.
describe('RoleManagementPageComponent null-handling (OBRS-506)', () => {
  it('clears roles when the store emits null', () => {
    const adminApi = {
      deleteRoleById: jasmine
        .createSpy('deleteRoleById')
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
      alert as any,
      createTranslateStub() as any,
      store as any,
      { getRoles: () => ['admin'] } as any
    );
    component.ngOnInit();

    store.data$.next({
      roles: [{ id: 7, slug: 'owner', status: 'active', translations: [] }],
      lookups: [],
    });
    expect((component as any).roles.length).toBe(1);

    store.data$.next(null);

    expect((component as any).roles)
      .withContext('a null emission must not leave the previous session\'s rows on screen')
      .toEqual([]);
  });
});


// OBRS-1495 AC-6: the role rule itself, in BOTH directions. The held-role test
// must stay `getRoles().includes('admin')` — `hasAnyRole(['admin'])` answers
// true for an owner through `AuthService.ROLE_GRANTS`, so the column would
// never hide for the one role it was meant to hide from (the OBRS-869 trap).
describe('RoleManagementPageComponent slug column rule (OBRS-1495)', () => {
  const OWNER_ROLES = ['owner', 'salesperson', 'driver', 'customer'];

  it('shows the slug column when the held role is admin', () => {
    const { component } = makeComponent({}, ['admin']);
    expect((component as any).showSlugColumn).toBeTrue();
  });

  it('hides the slug column from an owner', () => {
    const { component } = makeComponent({}, OWNER_ROLES);
    expect((component as any).showSlugColumn).toBeFalse();
  });
});
