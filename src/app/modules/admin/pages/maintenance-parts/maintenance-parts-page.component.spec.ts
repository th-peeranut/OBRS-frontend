import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { MaintenancePartsPageComponent } from './maintenance-parts-page.component';
import { AdminMaintenancePartDto } from '../../../../services/admin/admin-api.service';

/**
 * OBRS-1613 AC1/AC2. Instantiated directly rather than through TestBed, matching
 * `ExpensePayeesPageComponent`'s own spec.
 *
 * <p>What is deliberately NOT re-tested here: the twelve behaviours this screen inherits unchanged
 * from the payee registry — skeleton/empty/filtered-empty, the error-only-when-nothing-cached rule,
 * the admin-cannot-create rule — are pinned there. The tests below are the ones where this screen
 * and that one DISAGREE, plus the two that protect something irreversible.
 */
describe('MaintenancePartsPageComponent', () => {
  const SEEDED: AdminMaintenancePartDto = {
    id: 1,
    code: 'ENGINE_OIL',
    name: 'น้ำมันเครื่อง',
    kind: 'PART',
    active: true,
  };
  const TYPED: AdminMaintenancePartDto = {
    id: 2,
    code: null,
    name: 'จาระบี',
    kind: 'PART',
    active: true,
  };
  const LABOUR: AdminMaintenancePartDto = {
    id: 3,
    code: null,
    name: 'ค่าแรงเปลี่ยนสายพาน',
    kind: 'LABOUR',
    active: true,
  };
  const RETIRED: AdminMaintenancePartDto = {
    id: 4,
    code: null,
    name: 'โช้คอัพหน้า',
    kind: 'PART',
    active: false,
  };

  function makeStoreStub(parts: AdminMaintenancePartDto[] | null) {
    const data$ = new BehaviorSubject<AdminMaintenancePartDto[] | null>(parts);
    return {
      data$,
      refreshing$: new BehaviorSubject<boolean>(false),
      error$: new BehaviorSubject<boolean>(false),
      refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    };
  }

  function makeComponent(
    store = makeStoreStub([SEEDED, TYPED, LABOUR, RETIRED]),
    adminApi: Record<string, unknown> = {},
    alert: Record<string, unknown> = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
    },
    heldRoles: string[] = ['owner'],
    translations: Record<string, string> = {}
  ) {
    const translate = {
      instant: (key: string) => translations[key] ?? key,
      onLangChange: new Subject<unknown>(),
    };
    const auth = {
      hasHeldRole: (roles: string[]) => roles.some((role) => heldRoles.includes(role)),
    };
    const component = new MaintenancePartsPageComponent(
      adminApi as any,
      alert as any,
      translate as any,
      store as any,
      auth as any
    );
    component.ngOnInit();
    return { component: component as any, store, adminApi, alert };
  }

  it('hides retired entries by default and reveals them on request', () => {
    const { component } = makeComponent();

    expect(component.parts.map((p: AdminMaintenancePartDto) => p.id).sort()).toEqual([1, 2, 3]);

    component.onShowRetiredChange(true);

    // Reachable, not deleted: this row still owns the price history of every line that named it.
    expect(component.parts.map((p: AdminMaintenancePartDto) => p.id).sort()).toEqual([1, 2, 3, 4]);
  });

  it('filters by kind without a second fetch', () => {
    const { component, store } = makeComponent();
    store.refresh.calls.reset();

    component.onKindFilterChange('LABOUR');

    expect(component.parts.map((p: AdminMaintenancePartDto) => p.id)).toEqual([3]);
    expect(store.refresh).not.toHaveBeenCalled();
  });

  /**
   * The owner's 2026-08-25 ruling, on screen: the 13 seeded entries keep their translations, and a
   * name the owner typed is Thai verbatim on every locale.
   */
  it('renders a seeded entry through the bundle and a typed one verbatim', () => {
    const { component } = makeComponent(undefined, {}, undefined, ['owner'], {
      'ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.ENGINE_OIL': 'Engine oil',
    });

    expect(component.partLabel(SEEDED)).toBe('Engine oil');
    expect(component.partLabel(TYPED)).toBe('จาระบี');
    expect(component.isSeeded(SEEDED)).toBeTrue();
    expect(component.isSeeded(TYPED)).toBeFalse();
  });

  /**
   * The rename dialog edits what is STORED. Pre-filling the translated label would have an owner on
   * the English locale save "Engine oil" as the Thai name of the entry - and since renaming also
   * clears the code, the Thai name would be gone with no way back.
   */
  it('pre-fills the rename dialog with the stored name, never the translation', () => {
    const { component } = makeComponent(undefined, {}, undefined, ['owner'], {
      'ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.ENGINE_OIL': 'Engine oil',
    });

    component.openRenameModal(SEEDED);

    expect(component.formName).toBe('น้ำมันเครื่อง');
  });

  /**
   * The one irreversible action on this screen. The server clears the i18n key on rename, so the
   * en/zh names go with it and nothing on any screen can put them back. The owner ruled the 13 keep
   * their translations, which forbids losing them QUIETLY - not renaming.
   */
  it('flags a seeded rename so the dialog can warn, and only a seeded one', () => {
    const { component } = makeComponent();

    component.openRenameModal(SEEDED);
    expect(component.isRenamingSeededPart).toBeTrue();

    component.openRenameModal(TYPED);
    expect(component.isRenamingSeededPart).toBeFalse();

    // Creating is never a rename, whatever was open before.
    component.openCreateModal();
    expect(component.isRenamingSeededPart).toBeFalse();
  });

  /**
   * Where this screen and the payee registry genuinely differ. `createExpensePayee` 409s on a name
   * already on record, so that dialog disables its button; `createMaintenancePart` is idempotent and
   * returns the existing row. Disabling the button here would tell the owner the save is blocked
   * when pressing it would work fine.
   */
  it('keeps CREATE submittable when the name exists, because the server reuses the row', () => {
    const { component } = makeComponent();
    component.openCreateModal();
    component.formName = 'จาระบี';

    expect(component.nameCollision?.id).toBe(2);
    expect(component.canSubmit).toBeTrue();
  });

  /**
   * Found by review on 2026-08-25, and it was a lie on screen rather than a crash: the reuse only
   * happens when the KIND matches too. `createPart` runs `assertSameKind` BEFORE its idempotent
   * branch, so a same-name-other-kind create is a 409 - and the dialog was telling the owner "we
   * will use the existing one" and leaving the button enabled right up until the server refused.
   */
  it('blocks CREATE when the name exists under the OTHER kind, which the server 409s', () => {
    const { component } = makeComponent();
    component.openCreateModal();
    component.formName = 'จาระบี';           // exists, kind PART
    component.formKind = 'LABOUR';

    expect(component.nameCollision?.id).toBe(2);
    expect(component.kindConflict).toBeTrue();
    expect(component.canSubmit).toBeFalse();
  });

  it('does not call a matching kind a conflict', () => {
    const { component } = makeComponent();
    component.openCreateModal();
    component.formName = 'จาระบี';
    component.formKind = 'PART';

    expect(component.kindConflict).toBeFalse();
    expect(component.canSubmit).toBeTrue();
  });

  /**
   * RENAME is blocked by the collision itself, so `kindConflict` must not ALSO fire there - two
   * messages at once would leave the owner reading a kind explanation for a name problem.
   */
  it('never reports a kind conflict on the rename path', () => {
    const { component } = makeComponent();
    component.openRenameModal(LABOUR);
    component.formName = 'จาระบี';           // a PART, so the kinds genuinely differ

    expect(component.canSubmit).toBeFalse();
    expect(component.kindConflict).toBeFalse();
  });

  it('blocks RENAME onto an existing name, because that one really is a 409', () => {
    // A rename onto a taken name would be a merge, and a merge re-points one entry's price history
    // onto another with no undo.
    const { component } = makeComponent();
    component.openRenameModal(SEEDED);
    component.formName = 'จาระบี';

    expect(component.nameCollision?.id).toBe(2);
    expect(component.canSubmit).toBeFalse();
  });

  it('does not call an entry its own name a collision', () => {
    const { component } = makeComponent();
    component.openRenameModal(TYPED);
    component.formName = '  จาระบี  ';

    expect(component.nameCollision).toBeNull();
    expect(component.canSubmit).toBeTrue();
  });

  /**
   * AC2 is this line. "สายพานหน้าเครื่อง" and the same name with an invisible ZERO WIDTH SPACE in
   * it are one entry, and Thai marks word breaks with exactly that character - so without this the
   * price history splits in two silently, which is the single thing this card exists to prevent.
   */
  it('treats a name differing only by an invisible character as the same entry', () => {
    const { component } = makeComponent();
    component.openCreateModal();
    component.formName = 'จาระ' + '\u200B' + 'บี';

    expect(component.nameCollision?.id).toBe(2);
  });

  it('sends a trimmed name and revalidates the shared cache after a rename', async () => {
    const update = jasmine
      .createSpy('updateMaintenancePart')
      .and.returnValue(of({ code: 200, message: 'OK', data: null }));
    const { component, store } = makeComponent(undefined, { updateMaintenancePart: update });
    component.openRenameModal(TYPED);
    component.formName = '  จาระบี PBR  ';
    store.refresh.calls.reset();

    await component.submitModal();

    expect(update).toHaveBeenCalledWith(2, { name: 'จาระบี PBR', kind: 'PART' });
    expect(component.isModalOpen).toBeFalse();
    expect(store.refresh).toHaveBeenCalled();
  });

  it('keeps the dialog open and alerts when the save fails', async () => {
    const alert = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
    };
    const { component } = makeComponent(
      undefined,
      {
        createMaintenancePart: jasmine
          .createSpy('create')
          .and.returnValue(throwError(() => new Error('boom'))),
      },
      alert
    );
    component.openCreateModal();
    component.formName = 'ยางรถ';

    await component.submitModal();

    // Closing on failure would look like it saved.
    expect(component.isModalOpen).toBeTrue();
    expect(alert.error).toHaveBeenCalled();
  });

  it('retires and restores through the active endpoint, never a delete', async () => {
    const setActive = jasmine
      .createSpy('setMaintenancePartActive')
      .and.returnValue(of({ code: 200, message: 'OK', data: null }));
    const { component, adminApi } = makeComponent(undefined, {
      setMaintenancePartActive: setActive,
    });

    await component.toggleActive(TYPED);
    expect(setActive).toHaveBeenCalledWith(2, false);

    await component.toggleActive(RETIRED);
    expect(setActive).toHaveBeenCalledWith(4, true);

    // There is no delete endpoint on the service and no caller for one here.
    expect((adminApi as Record<string, unknown>)['deleteMaintenancePart']).toBeUndefined();
  });

  it('lets an admin read and rename, but never add', () => {
    // ROLE_ADMIN > ROLE_OWNER, so an admin reaches this page and the GET returns 200. Rename and
    // retire resolve through getCurrentOwnerScope() and work; CREATE needs getCurrentOwnerId(),
    // which throws for them, so the button must not be there at all.
    const { component } = makeComponent(undefined, {}, undefined, ['admin']);

    expect(component.canCreate).toBeFalse();

    component.openCreateModal();
    expect(component.isModalOpen).toBeFalse();

    component.openRenameModal(TYPED);
    expect(component.isModalOpen).toBeTrue();
  });

  it('honors a null emission from clear() (logout) instead of keeping stale rows', () => {
    // OBRS-506, and the reason scripts/check-store-null-handling.mjs exists: returning early on
    // null left the previous session's rows readable on screen.
    const store = makeStoreStub([SEEDED, TYPED]);
    const { component } = makeComponent(store);
    expect(component.parts.length).toBe(2);

    store.data$.next(null);

    expect(component.parts.length).toBe(0);
    // Nothing is cached any more, so a failure is a full-page error again - not a refresh hint.
    store.error$.next(true);
    expect(component.errorMessage).toBeTruthy();
  });
});
