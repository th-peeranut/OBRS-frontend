import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { VehiclePlReportStore } from './vehicle-pl-report.store';
import { VehiclePlReportDto } from '../../../../shared/interfaces/vehicle-pl-report.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function report(overrides: Partial<VehiclePlReportDto> = {}): VehiclePlReportDto {
  return {
    from: '2026-08-01',
    to: '2026-08-22',
    vatIncludedInAmounts: true,
    rows: [],
    totals: {
      revenue: '900.00',
      expenses: '300.00',
      vat: '21.00',
      margin: '600.00',
      currency: 'THB',
      pendingExpenses: '50.00',
    },
    ...overrides,
  };
}

interface FakeApi {
  getVehiclePlReport: jasmine.Spy<
    (from: string, to: string) => Observable<ResponseAPI<VehiclePlReportDto>>
  >;
}

function makeStore(
  api: Partial<FakeApi>,
  authStatus$ = new BehaviorSubject<boolean>(true)
): VehiclePlReportStore {
  const full: FakeApi = {
    getVehiclePlReport: jasmine
      .createSpy('getVehiclePlReport')
      .and.returnValue(of(ok(report()))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new VehiclePlReportStore(full as any, { authStatus$ } as any);
}

describe('VehiclePlReportStore', () => {
  // Mirrors the store's own local-date formatting (not toISOString(), which is UTC and
  // would be flaky near a local-midnight boundary).
  function toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // NOT the last 7 days the sibling report stores default to: a P&L is read a month at a
  // time, and a 7-day window would include a month's instalment or insurance line only if
  // it happened to fall inside it.
  it('defaults to the current month, from the 1st through today', () => {
    const store = makeStore({});
    const today = new Date();

    expect(store.range.from).toBe(
      toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1))
    );
    expect(store.range.to).toBe(toDateInputValue(today));
  });

  it('fetches using the current range on refresh()', async () => {
    const getVehiclePlReport = jasmine
      .createSpy('getVehiclePlReport')
      .and.returnValue(of(ok(report())));
    const store = makeStore({ getVehiclePlReport });

    await store.refresh();

    const { from, to } = store.range;
    expect(getVehiclePlReport).toHaveBeenCalledOnceWith(from, to);
    expect(store.value?.totals.margin).toBe('600.00');
  });

  it('setRange() switches the range and refetches with the new dates', async () => {
    const getVehiclePlReport = jasmine
      .createSpy('getVehiclePlReport')
      .and.returnValue(of(ok(report())));
    const store = makeStore({ getVehiclePlReport });

    store.setRange('2026-06-01', '2026-06-30');
    await Promise.resolve(); // flush the microtask refresh() kicks off

    expect(getVehiclePlReport).toHaveBeenCalledWith('2026-06-01', '2026-06-30');
    expect(store.range).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('keeps the cached value and flags error$ when a background refresh fails', async () => {
    const getVehiclePlReport = jasmine
      .createSpy('getVehiclePlReport')
      .and.returnValue(of(ok(report())));
    const store = makeStore({ getVehiclePlReport });
    await store.refresh();

    let errored = false;
    store.error$.subscribe((value) => (errored = value));

    getVehiclePlReport.and.returnValue(throwError(() => new Error('network')));
    await store.refresh();

    expect(store.value?.totals.margin).toBe('600.00'); // stale value retained
    expect(errored).toBeTrue();
  });

  // A data-less 200 must not become a screen that looks like a real all-zero month with a
  // fleet on it: no rows, and a totals object whose currency the page can still format.
  it('falls back to a zeroed report when the response has no data', async () => {
    const store = makeStore({
      getVehiclePlReport: jasmine
        .createSpy('getVehiclePlReport')
        .and.returnValue(of(ok(null as unknown as VehiclePlReportDto))),
    });

    await store.refresh();

    expect(store.value?.rows).toEqual([]);
    expect(store.value?.totals.revenue).toBe('0.00');
    expect(store.value?.totals.pendingExpenses).toBe('0.00');
    expect(store.value?.totals.currency).toBe('THB');
    expect(store.value?.vatIncludedInAmounts).toBeTrue();
  });

  it('clears the cached report on logout', async () => {
    const authStatus$ = new BehaviorSubject<boolean>(true);
    const store = makeStore({}, authStatus$);
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    authStatus$.next(false);

    expect(store.value).toBeNull();
  });
});
