import { BehaviorSubject, of } from 'rxjs';
import { ExpensesPageComponent } from './expenses-page.component';
import { AdminExpenseDto, AdminVehicleDto } from '../../../../services/admin/admin-api.service';
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

function makeComponent(
  expensesStore: ReturnType<typeof makeExpensesStoreStub>,
  vehiclesStore = makeVehiclesStoreStub([{ id: 1, vehicleNumber: 'V1', numberPlate: 'ABC-123' }]),
  canWrite = true,
  adminApi: Record<string, unknown> = {
    deleteExpense: jasmine.createSpy('deleteExpense').and.returnValue(of({ code: 200, message: 'OK', data: null })),
  }
) {
  const alert = { success: () => Promise.resolve(), error: () => Promise.resolve() };
  const auth = { hasAnyRole: jasmine.createSpy('hasAnyRole').and.returnValue(canWrite) };
  return new ExpensesPageComponent(
    adminApi as any,
    alert as any,
    createTranslateStub(),
    expensesStore as any,
    vehiclesStore as any,
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

      (component as any).onVehicleFilterChange(VEHICLE_CENTRAL_SENTINEL);

      expect(store.setVehicleFilter).toHaveBeenCalledWith(null);
      expect((component as any).centralOnlyFilter).toBeTrue();
      expect((component as any).filteredExpenses.map((r: any) => r.id)).toEqual([2]);
    });
  });

  describe('category / date-range filters (client-side, no network call)', () => {
    it('narrows by category without calling the store', () => {
      const store = makeExpensesStoreStub([
        expense({ id: 1, category: 'FUEL' }),
        expense({ id: 2, category: 'REPAIR' }),
      ]);
      const component = makeComponent(store);
      component.ngOnInit();
      store.setVehicleFilter.calls.reset();

      (component as any).onCategoryFilterChange('FUEL');

      expect((component as any).filteredExpenses.map((r: any) => r.id)).toEqual([1]);
      expect(store.setVehicleFilter).not.toHaveBeenCalled();
    });

    it('narrows by date range without calling the store', () => {
      const store = makeExpensesStoreStub([
        expense({ id: 1, expenseDate: '2026-07-01' }),
        expense({ id: 2, expenseDate: '2026-07-20' }),
      ]);
      const component = makeComponent(store);
      component.ngOnInit();
      store.setVehicleFilter.calls.reset();

      (component as any).onFromDateChange(new Date(2026, 6, 10));

      expect((component as any).filteredExpenses.map((r: any) => r.id)).toEqual([2]);
      expect(store.setVehicleFilter).not.toHaveBeenCalled();
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
