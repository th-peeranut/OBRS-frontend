import { BehaviorSubject, of, throwError } from 'rxjs';
import { ExpensesPageComponent } from './expenses-page.component';
import {
  AdminExpenseDto,
  AdminExpensePayeeDto,
  AdminVehicleDto,
} from '../../../../services/admin/admin-api.service';
import { VEHICLE_CENTRAL_SENTINEL } from './expenses-page.mappers';
import { VehiclesData } from '../vehicles/vehicles.store';
import { createTranslateStub } from '../../../../testing/test-stubs';

function expense(overrides: Partial<AdminExpenseDto> = {}): AdminExpenseDto {
  return {
    id: 1,
    vehicleId: 1,
    category: 'FUEL',
    categoryOtherLabel: null,
    amount: 500,
    vatAmount: null,
    expenseDate: '2026-07-20',
    receiptNo: null,
    paidBy: null,
    note: null,
    ...overrides,
  };
}

function makeExpensesStoreStub(data: AdminExpenseDto[] | null) {
  const data$ = new BehaviorSubject<AdminExpenseDto[] | null>(data);
  const refreshing$ = new BehaviorSubject<boolean>(false);
  const error$ = new BehaviorSubject<boolean>(false);
  return {
    data$,
    refreshing$,
    error$,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setVehicleFilter: jasmine.createSpy('setVehicleFilter'),
    mutate: jasmine.createSpy('mutate').and.callFake((transform: (current: AdminExpenseDto[]) => AdminExpenseDto[]) => {
      if (data$.value !== null) {
        data$.next(transform(data$.value));
      }
    }),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeVehiclesStoreStub(vehicles: AdminVehicleDto[] = []) {
  const data$ = new BehaviorSubject<VehiclesData | null>({ vehicles, vehicleTypes: [], lookups: [] });
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

/** OBRS-1577: the payee registry cache. Defaults to a loaded-but-empty list, which is the state an
 * operator who has not added any garages yet is genuinely in. */
function makePayeesStoreStub(payees: AdminExpensePayeeDto[] = []) {
  const data$ = new BehaviorSubject<AdminExpensePayeeDto[] | null>(payees);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeComponent(
  expensesStore: ReturnType<typeof makeExpensesStoreStub>,
  vehiclesStore = makeVehiclesStoreStub([{ id: 1, vehicleNumber: 'V1', numberPlate: 'ABC-123' }]),
  canWrite = true,
  adminApi: Record<string, unknown> = {
    deleteExpense: jasmine.createSpy('deleteExpense').and.returnValue(of({ code: 200, message: 'OK', data: null })),
  },
  roles: string[] = ['owner'],
  payeesStore = makePayeesStoreStub()
) {
  const alert = { success: () => Promise.resolve(), error: () => Promise.resolve() };
  const auth = {
    hasAnyRole: jasmine.createSpy('hasAnyRole').and.returnValue(canWrite),
    // OBRS-808: `owner` by default. The picker and the operator column are
    // admin-only, so the DEFAULT caller in this spec is the one that must not
    // see them — an admin-by-default stub would make every existing test a
    // silent admin test.
    getRoles: jasmine.createSpy('getRoles').and.returnValue(roles),
    // OBRS-1577: the HELD role, with no ROLE_GRANTS expansion — `hasAnyRole(['owner'])` is true for
    // an admin, and the create affordance this feeds must be false for them.
    hasHeldRole: (required: string[]) => required.some((role) => roles.includes(role)),
  };
  return new ExpensesPageComponent(
    adminApi as any,
    alert as any,
    createTranslateStub(),
    expensesStore as any,
    vehiclesStore as any,
    payeesStore as any,
    auth as any
  );
}

describe('ExpensesPageComponent', () => {
  it('should create', () => {
    expect(makeComponent(makeExpensesStoreStub(null))).toBeTruthy();
  });

  it('renders cached expenses immediately and still revalidates in the background', () => {
    const store = makeExpensesStoreStub([expense()]);
    const component = makeComponent(store);

    component.ngOnInit();

    expect((component as any).isLoading).toBeFalse();
    expect((component as any).expenses.length).toBe(1);
    expect(store.refresh).toHaveBeenCalled();
  });

  it('surfaces the load-failed message only when there is no cached data', () => {
    const store = makeExpensesStoreStub(null);
    const component = makeComponent(store);
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).errorMessage).toBe('ADMIN.MESSAGES.LOAD_EXPENSES_FAILED');
  });

  it('honors a null emission from clear() (logout) instead of keeping stale rows', () => {
    const store = makeExpensesStoreStub([expense()]);
    const component = makeComponent(store);
    component.ngOnInit();
    expect((component as any).expenses.length).toBe(1);

    store.data$.next(null);

    expect((component as any).expenses.length).toBe(0);
  });

  describe('vehicle filter (§6.2)', () => {
    it('"ทั้งหมด" (raw "") fetches unfiltered and clears centralOnly', () => {
      const store = makeExpensesStoreStub([expense()]);
      const component = makeComponent(store);
      component.ngOnInit();

      (component as any).onVehicleFilterChange('');

      expect(store.setVehicleFilter).toHaveBeenCalledWith(null);
      expect((component as any).centralOnlyFilter).toBeFalse();
    });

    it('a specific vehicle id scopes the SERVER fetch to that vehicle', () => {
      const store = makeExpensesStoreStub([expense()]);
      const component = makeComponent(store);
      component.ngOnInit();

      (component as any).onVehicleFilterChange('1');

      expect(store.setVehicleFilter).toHaveBeenCalledWith(1);
      expect((component as any).centralOnlyFilter).toBeFalse();
    });

    it('"central only" ALSO fetches unfiltered (null) — not a fourth server call — and narrows client-side', () => {
      const store = makeExpensesStoreStub([
        expense({ id: 1, vehicleId: 1 }),
        expense({ id: 2, vehicleId: null }),
      ]);
      const component = makeComponent(store);
      component.ngOnInit();
      // OBRS-1626: the page now opens on the CURRENT month, and these rows are
      // dated 2026-07 - pin the month so this test keeps testing the sentinel.
      (component as any).onYearChange('2026');
      (component as any).onMonthChange('7');

      (component as any).onVehicleFilterChange(VEHICLE_CENTRAL_SENTINEL);

      expect(store.setVehicleFilter).toHaveBeenCalledWith(null);
      expect((component as any).centralOnlyFilter).toBeTrue();
      expect((component as any).filteredExpenses.map((r: any) => r.id)).toEqual([2]);
    });
  });

  describe('category / month filters (client-side, no network call)', () => {
    it('narrows by category without calling the store', () => {
      const store = makeExpensesStoreStub([
        expense({ id: 1, category: 'FUEL' }),
        expense({ id: 2, category: 'REPAIR' }),
      ]);
      const component = makeComponent(store);
      component.ngOnInit();
      (component as any).onYearChange('2026');
      (component as any).onMonthChange('7');
      store.setVehicleFilter.calls.reset();

      (component as any).onCategoryFilterChange('FUEL');

      expect((component as any).filteredExpenses.map((r: any) => r.id)).toEqual([1]);
      expect(store.setVehicleFilter).not.toHaveBeenCalled();
    });

    // OBRS-1626 AC-2: opening the page used to render every row in the system.
    it('opens on the CURRENT month, not on everything', () => {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const store = makeExpensesStoreStub([
        expense({ id: 1, expenseDate: '2024-03-11' }),
        expense({ id: 2, expenseDate: `${thisMonth}-05` }),
      ]);
      const component = makeComponent(store);
      component.ngOnInit();

      expect((component as any).filteredExpenses.map((r: any) => r.id)).toEqual([2]);
      expect(store.setVehicleFilter).not.toHaveBeenCalled();
    });

    it('narrows to the picked year+month without calling the store', () => {
      const store = makeExpensesStoreStub([
        expense({ id: 1, expenseDate: '2026-06-30' }),
        expense({ id: 2, expenseDate: '2026-07-20' }),
        expense({ id: 3, expenseDate: '2026-08-01' }),
      ]);
      const component = makeComponent(store);
      component.ngOnInit();
      store.setVehicleFilter.calls.reset();

      (component as any).onYearChange('2026');
      (component as any).onMonthChange('7');

      expect((component as any).filteredExpenses.map((r: any) => r.id)).toEqual([2]);
      expect(store.setVehicleFilter).not.toHaveBeenCalled();
    });

    // OBRS-1626: the dropdown's own placeholder row emits '' when clicked, and
    // `Number('')` is 0, which `new Date` reads as the year 1900 - the table
    // would empty itself with no explanation.
    it('ignores the empty value the dropdown placeholder emits', () => {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const store = makeExpensesStoreStub([expense({ id: 1, expenseDate: `${thisMonth}-05` })]);
      const component = makeComponent(store);
      component.ngOnInit();

      (component as any).onYearChange('');
      (component as any).onMonthChange('');

      expect((component as any).selectedYear).toBe(String(now.getFullYear()));
      expect((component as any).selectedMonth).toBe(String(now.getMonth() + 1));
      expect((component as any).filteredExpenses.map((r: any) => r.id)).toEqual([1]);
    });

    // OBRS-1626: /admin/reports builds its year list as `period.year - 2 + i`,
    // which offers two years the expense data cannot reach. Copying that here
    // was the trap; this test is what makes copying it fail.
    it('offers the years the data actually has, and no future year', () => {
      const store = makeExpensesStoreStub([
        expense({ id: 1, expenseDate: '2024-03-11' }),
        expense({ id: 2, expenseDate: '2025-11-02' }),
      ]);
      const component = makeComponent(store);
      component.ngOnInit();

      const years = (component as any).yearOptions.map((option: any) => option.code);
      expect(years).toContain('2024');
      expect(years).toContain('2025');
      expect(years).toContain(String(new Date().getFullYear()));
      expect(years).not.toContain(String(new Date().getFullYear() + 1));
    });
  });

  // OBRS-808
  describe('operator roster (OBRS-808)', () => {
    const OWNERS = [
      { id: 7, slug: 'nj-travel', displayName: 'NJ Travel', legalName: 'NJ Travel' },
      { id: 9, slug: 'second', displayName: 'Second Lines', legalName: 'Second Lines' },
    ];

    function adminApiWithOwners(owners = OWNERS) {
      return {
        deleteExpense: jasmine.createSpy('deleteExpense').and.returnValue(of({ code: 200, message: 'OK', data: null })),
        getOwners: jasmine
          .createSpy('getOwners')
          .and.returnValue(of({ code: 200, message: 'OK', data: owners })),
      };
    }

    it('AC2: an owner never REQUESTS the roster — a 403 is not a recoverable empty list', async () => {
      const api = adminApiWithOwners();
      const component = makeComponent(makeExpensesStoreStub([expense()]), undefined, true, api, ['owner']);

      component.ngOnInit();
      await Promise.resolve();

      expect(api.getOwners).not.toHaveBeenCalled();
      expect((component as any).isAdmin).toBeFalse();
      expect((component as any).ownerOptions).toEqual([]);
    });

    it('AC1: an admin fetches the roster and gets options for the picker', async () => {
      const api = adminApiWithOwners();
      const component = makeComponent(makeExpensesStoreStub([expense()]), undefined, true, api, ['admin']);

      component.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();

      expect(api.getOwners).toHaveBeenCalled();
      expect((component as any).ownerOptions.map((o: any) => o.code)).toEqual(['7', '9']);
    });

    it('resolves the operator label onto the rows an admin sees', async () => {
      const api = adminApiWithOwners();
      const component = makeComponent(
        makeExpensesStoreStub([expense({ id: 1, ownerId: 9 })]),
        undefined,
        true,
        api,
        ['admin']
      );

      component.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();

      expect((component as any).expenses[0].ownerLabel).toBe('Second Lines');
    });

    // OBRS-1627: the operator COLUMN became this filter. With one operator on
    // prod it narrows nothing today, which is exactly why it needs a test - a
    // control that quietly matched no rows would look identical.
    it('narrows the table by operator, client-side and without a store call', async () => {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const store = makeExpensesStoreStub([
        expense({ id: 1, ownerId: 7, expenseDate: `${thisMonth}-05` }),
        expense({ id: 2, ownerId: 9, expenseDate: `${thisMonth}-06` }),
      ]);
      const component = makeComponent(store, undefined, true, adminApiWithOwners(), ['admin']);

      component.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();
      store.setVehicleFilter.calls.reset();

      (component as any).onOwnerFilterChange('9');

      expect((component as any).filteredExpenses.map((r: any) => r.id)).toEqual([2]);
      expect(store.setVehicleFilter).not.toHaveBeenCalled();
    });

    it('clearing the operator filter restores every operator, not none', async () => {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const store = makeExpensesStoreStub([
        expense({ id: 1, ownerId: 7, expenseDate: `${thisMonth}-05` }),
        expense({ id: 2, ownerId: 9, expenseDate: `${thisMonth}-06` }),
      ]);
      const component = makeComponent(store, undefined, true, adminApiWithOwners(), ['admin']);

      component.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();

      (component as any).onOwnerFilterChange('9');
      (component as any).onOwnerFilterChange('');

      expect((component as any).filteredExpenses.map((r: any) => r.id)).toEqual([1, 2]);
    });

    it('a failed roster fetch leaves the page usable and the options empty — no alert on load', async () => {
      // The consequence is confined to the create modal, which says so itself.
      // Alerting here would fire on every page load for a control the user may
      // never open.
      const api = {
        deleteExpense: jasmine.createSpy('deleteExpense'),
        getOwners: jasmine.createSpy('getOwners').and.returnValue(throwError(() => new Error('403'))),
      };
      const component = makeComponent(makeExpensesStoreStub([expense()]), undefined, true, api, ['admin']);

      component.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();

      expect((component as any).ownerOptions).toEqual([]);
      expect((component as any).expenses.length).toBe(1);
      expect((component as any).errorMessage).toBe('');
    });
  });

  describe('delete flow', () => {
    it('optimistically removes the row, then refreshes', async () => {
      const store = makeExpensesStoreStub([expense({ id: 1 }), expense({ id: 2 })]);
      const deleteExpense = jasmine
        .createSpy('deleteExpense')
        .and.returnValue(of({ code: 200, message: 'OK', data: null }));
      const component = makeComponent(store, undefined, true, { deleteExpense });
      component.ngOnInit();

      (component as any).selectedExpense = (component as any).expenses.find((r: any) => r.id === 1);
      await (component as any).confirmDelete();

      expect(deleteExpense).toHaveBeenCalledWith(1);
      expect(store.mutate).toHaveBeenCalled();
      expect(store.refresh).toHaveBeenCalled();
    });
  });
});
