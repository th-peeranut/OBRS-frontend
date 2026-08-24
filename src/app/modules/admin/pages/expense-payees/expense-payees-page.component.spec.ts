import { BehaviorSubject, of, throwError } from 'rxjs';
import { Subject } from 'rxjs';
import { ExpensePayeesPageComponent } from './expense-payees-page.component';
import { AdminExpensePayeeDto } from '../../../../services/admin/admin-api.service';

/**
 * OBRS-1577 AC6. Instantiated directly rather than through TestBed, matching `ExpensesPageComponent`'s
 * own spec.
 *
 * The assertions worth having here are the ones that protect the RECORD: a retired payee must stay
 * reachable (it owns bills), a rename must never quietly merge two payees, and the screen must not
 * hide readable rows behind an error banner just because a background revalidate failed.
 */
describe('ExpensePayeesPageComponent', () => {
  const ACTIVE_GARAGE: AdminExpensePayeeDto = { id: 1, name: 'Anek Service', type: 'GARAGE', active: true };
  const ACTIVE_STATION: AdminExpensePayeeDto = { id: 2, name: 'PTT Nong Chak', type: 'FUEL_STATION', active: true };
  const RETIRED_GARAGE: AdminExpensePayeeDto = { id: 3, name: 'Old Garage', type: 'GARAGE', active: false };

  function makeStoreStub(payees: AdminExpensePayeeDto[] | null) {
    const data$ = new BehaviorSubject<AdminExpensePayeeDto[] | null>(payees);
    return {
      data$,
      refreshing$: new BehaviorSubject<boolean>(false),
      error$: new BehaviorSubject<boolean>(false),
      refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    };
  }

  function makeComponent(
    store = makeStoreStub([ACTIVE_GARAGE, ACTIVE_STATION, RETIRED_GARAGE]),
    adminApi: Record<string, unknown> = {},
    alert: Record<string, unknown> = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
    },
    heldRoles: string[] = ['owner']
  ) {
    const translate = { instant: (key: string) => key, onLangChange: new Subject<unknown>() };
    // `hasHeldRole`, not `hasAnyRole`: the point of the flag under test is that they answer
    // differently for an admin.
    const auth = {
      hasHeldRole: (roles: string[]) => roles.some((role) => heldRoles.includes(role)),
    };
    const component = new ExpensePayeesPageComponent(
      adminApi as any,
      alert as any,
      translate as any,
      store as any,
      auth as any
    );
    component.ngOnInit();
    return { component: component as any, store, adminApi, alert };
  }

  it('hides retired payees by default and reveals them on request', () => {
    const { component } = makeComponent();

    expect(component.payees.map((p: AdminExpensePayeeDto) => p.id)).toEqual([1, 2]);

    component.onShowRetiredChange(true);

    // AC6: reachable, not deleted. This row is the only record of who every bill paid to it went to.
    expect(component.payees.map((p: AdminExpensePayeeDto) => p.id).sort()).toEqual([1, 2, 3]);
  });

  it('filters by type without a second fetch', () => {
    const { component, store } = makeComponent();
    store.refresh.calls.reset();

    component.onTypeFilterChange('FUEL_STATION');

    expect(component.payees.map((p: AdminExpensePayeeDto) => p.id)).toEqual([2]);
    expect(store.refresh).not.toHaveBeenCalled();
  });

  it('lets an admin read and rename, but never add', async () => {
    // The backend hierarchy is ROLE_ADMIN > ROLE_OWNER, so an admin reaches this page and its GET
    // returns 200 — the "OWNER-only" label is about the endpoint annotation, not about who arrives.
    // Rename and retire resolve through `getCurrentOwnerScope()` and work for them. CREATE alone
    // needs `getCurrentOwnerId()`, which throws, so the add button must not be there at all.
    const create = jasmine.createSpy('createExpensePayee');
    const { component } = makeComponent(undefined, { createExpensePayee: create }, undefined, [
      'admin',
    ]);

    expect(component.canCreate).toBeFalse();
    expect(component.payees.length).toBe(2);

    component.openCreateModal();
    expect(component.isModalOpen).toBeFalse();

    await component.submitModal();
    expect(create).not.toHaveBeenCalled();

    // Rename is still offered — the server does allow it for them.
    component.openRenameModal(ACTIVE_GARAGE);
    expect(component.isModalOpen).toBeTrue();
  });

  it('refuses a rename onto a name another payee already holds', () => {
    // Merging two payees moves one's payment history onto the other and cannot be undone, so this
    // is refused here AND by the server (409) — never resolved by merging.
    const { component } = makeComponent();
    component.openRenameModal(ACTIVE_GARAGE);
    component.formName = 'PTT Nong Chak';

    expect(component.nameAlreadyTaken).toBeTrue();
    expect(component.canSubmit).toBeFalse();
  });

  it('does not call its own current name a clash', () => {
    const { component } = makeComponent();
    component.openRenameModal(ACTIVE_GARAGE);
    component.formName = '  Anek Service  ';

    expect(component.nameAlreadyTaken).toBeFalse();
    expect(component.canSubmit).toBeTrue();
  });

  it('treats a name differing only by spacing as taken, matching the server rule', () => {
    const { component } = makeComponent();
    component.openCreateModal();
    component.formName = 'pttnongchak';

    expect(component.nameAlreadyTaken).toBeTrue();
  });

  it('sends a trimmed name and revalidates the shared cache after a rename', async () => {
    const update = jasmine
      .createSpy('updateExpensePayee')
      .and.returnValue(of({ code: 200, message: 'OK', data: null }));
    const { component, store } = makeComponent(undefined, { updateExpensePayee: update });
    component.openRenameModal(ACTIVE_GARAGE);
    component.formName = '  Anek Service 2  ';
    store.refresh.calls.reset();

    await component.submitModal();

    expect(update).toHaveBeenCalledWith(1, { name: 'Anek Service 2', type: 'GARAGE' });
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
      { createExpensePayee: jasmine.createSpy('create').and.returnValue(throwError(() => new Error('boom'))) },
      alert
    );
    component.openCreateModal();
    component.formName = 'New Garage';

    await component.submitModal();

    // Closing on failure would look like it saved.
    expect(component.isModalOpen).toBeTrue();
    expect(alert.error).toHaveBeenCalled();
  });

  it('retires and restores through the active endpoint, never a delete', async () => {
    const setActive = jasmine
      .createSpy('setExpensePayeeActive')
      .and.returnValue(of({ code: 200, message: 'OK', data: null }));
    const { component, adminApi } = makeComponent(undefined, { setExpensePayeeActive: setActive });

    await component.toggleActive(ACTIVE_GARAGE);
    expect(setActive).toHaveBeenCalledWith(1, false);

    await component.toggleActive(RETIRED_GARAGE);
    expect(setActive).toHaveBeenCalledWith(3, true);

    // There is no delete endpoint on the service and no caller for one here.
    expect((adminApi as Record<string, unknown>)['deleteExpensePayee']).toBeUndefined();
  });

  it('shows a page error only when a failure leaves NOTHING to read', () => {
    const store = makeStoreStub(null);
    const { component } = makeComponent(store);

    store.error$.next(true);
    expect(component.errorMessage).toBeTruthy();

    // Cached rows arrive; a later failed revalidate must not replace readable data with a banner.
    store.data$.next([ACTIVE_GARAGE]);
    store.error$.next(true);
    expect(component.errorMessage).toBe('');
    expect(component.payees.length).toBe(1);
  });

  it('reports empty and filtered-empty as different states', () => {
    const { component } = makeComponent(makeStoreStub([]));
    expect(component.isEmpty).toBeTrue();
    expect(component.isFilteredEmpty).toBeFalse();

    const populated = makeComponent();
    populated.component.onTypeFilterChange('OTHER');
    expect(populated.component.isEmpty).toBeFalse();
    expect(populated.component.isFilteredEmpty).toBeTrue();
  });
});
