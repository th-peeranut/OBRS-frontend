import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { ExpensesStore } from './expenses.store';
import { AdminExpenseDto } from '../../../../services/admin/admin-api.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function expense(overrides: Partial<AdminExpenseDto> = {}): AdminExpenseDto {
  return {
    id: 1,
    vehicleId: 1,
    category: 'FUEL',
    categoryOtherLabel: null,
    amount: 500,
    vatAmount: null,
    expenseDate: '2026-07-24',
    receiptNo: null,
    paidBy: null,
    note: null,
    ...overrides,
  };
}

interface FakeApi {
  getExpenses: jasmine.Spy<(vehicleId: number | null) => Observable<ResponseAPI<AdminExpenseDto[]>>>;
}

function makeStore(api: Partial<FakeApi>, authStatus$ = new BehaviorSubject<boolean>(true)): ExpensesStore {
  const full: FakeApi = {
    getExpenses: jasmine.createSpy('getExpenses').and.returnValue(of(ok([expense()]))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ExpensesStore(full as any, { authStatus$ } as any);
}

describe('ExpensesStore', () => {
  it('defaults to an unfiltered fetch (vehicleId: null)', async () => {
    const getExpenses = jasmine.createSpy('getExpenses').and.returnValue(of(ok([expense()])));
    const store = makeStore({ getExpenses });

    await store.refresh();

    expect(getExpenses).toHaveBeenCalledOnceWith(null);
    expect(store.vehicleFilterId).toBeNull();
  });

  it('setVehicleFilter(id) scopes the next fetch to that vehicle', async () => {
    const getExpenses = jasmine.createSpy('getExpenses').and.returnValue(of(ok([expense()])));
    const store = makeStore({ getExpenses });

    store.setVehicleFilter(7);
    await Promise.resolve(); // flush the microtask refresh() kicks off

    expect(getExpenses).toHaveBeenCalledWith(7);
    expect(store.vehicleFilterId).toBe(7);
  });

  it('setVehicleFilter(null) returns to an unfiltered fetch', async () => {
    const getExpenses = jasmine.createSpy('getExpenses').and.returnValue(of(ok([expense()])));
    const store = makeStore({ getExpenses });

    store.setVehicleFilter(3);
    await Promise.resolve();
    store.setVehicleFilter(null);
    await Promise.resolve();

    expect(getExpenses).toHaveBeenCalledWith(null);
    expect(store.vehicleFilterId).toBeNull();
  });

  it('replays the last-fetched value synchronously to a new subscriber on re-entry', async () => {
    const store = makeStore({ getExpenses: jasmine.createSpy().and.returnValue(of(ok([expense({ id: 5 })]))) });
    await store.refresh();

    let received: AdminExpenseDto[] | null | undefined;
    store.data$.subscribe((value) => (received = value));

    expect(received?.[0]?.id).toBe(5);
  });

  it('keeps the cached value and flags error$ when a background refresh fails', async () => {
    const getExpenses = jasmine.createSpy('getExpenses').and.returnValue(of(ok([expense()])));
    const store = makeStore({ getExpenses });
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    let errored = false;
    store.error$.subscribe((value) => (errored = value));
    getExpenses.and.returnValue(throwError(() => new Error('network')));
    await store.refresh();

    expect(store.value?.length).toBe(1); // stale value retained
    expect(errored).toBeTrue();
  });

  it('falls back to [] when the response has no data', async () => {
    const getExpenses = jasmine
      .createSpy('getExpenses')
      .and.returnValue(of(ok(null as unknown as AdminExpenseDto[])));
    const store = makeStore({ getExpenses });

    await store.refresh();

    expect(store.value).toEqual([]);
  });

  it('clears the cached expenses on logout', async () => {
    const authStatus$ = new BehaviorSubject<boolean>(true);
    const store = makeStore({}, authStatus$);
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    authStatus$.next(false);

    expect(store.value).toBeNull();
  });
});
