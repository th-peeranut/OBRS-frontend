import { of, throwError } from 'rxjs';
import { DriverCashDayStore } from './driver-cash-day.store';

function createStaffApiStub(response: unknown): any {
  return { getDriverCashDay: jasmine.createSpy('getDriverCashDay').and.returnValue(of(response)) };
}

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

const DAY_RESP = {
  scheduleId: 42,
  routeLabel: 'BKK-CNX',
  departureDateTime: '2026-08-01T08:00:00',
  currency: 'THB',
  summary: { advanceTotal: '0.00', perHeadTotal: '0.00', expenseTotal: '0.00', netCash: '0.00' },
  perHeadRates: [],
};

describe('DriverCashDayStore', () => {
  it('returns null before a scheduleId is set (never calls the API)', async () => {
    const staffApi = createStaffApiStub({ code: 200, message: 'OK', data: DAY_RESP });
    const store = new DriverCashDayStore(staffApi, createAuthServiceStub());

    await store.refresh();

    expect(staffApi.getDriverCashDay).not.toHaveBeenCalled();
    expect(store.value).toBeNull();
  });

  it('fetches the day once a scheduleId is set', async () => {
    const staffApi = createStaffApiStub({ code: 200, message: 'OK', data: DAY_RESP });
    const store = new DriverCashDayStore(staffApi, createAuthServiceStub());

    store.setScheduleId(42);
    await store.refresh();

    expect(staffApi.getDriverCashDay).toHaveBeenCalledWith(42);
    expect(store.value).toEqual(DAY_RESP);
  });

  // OBRS-960 — component-scoped, per-round: a schedule change clears the
  // cache immediately (never leaks the PREVIOUS round's cash day while the
  // new fetch is in flight).
  it('clears the cached value when the scheduleId changes', async () => {
    const staffApi = createStaffApiStub({ code: 200, message: 'OK', data: DAY_RESP });
    const store = new DriverCashDayStore(staffApi, createAuthServiceStub());

    store.setScheduleId(42);
    await store.refresh();
    expect(store.value).not.toBeNull();

    store.setScheduleId(43);
    expect(store.value).toBeNull();
  });

  it('is a no-op setScheduleId call for the SAME id (does not clear)', async () => {
    const staffApi = createStaffApiStub({ code: 200, message: 'OK', data: DAY_RESP });
    const store = new DriverCashDayStore(staffApi, createAuthServiceStub());

    store.setScheduleId(42);
    await store.refresh();
    store.setScheduleId(42);
    expect(store.value).toEqual(DAY_RESP);
  });

  it('surfaces error$ on a transport failure', async () => {
    const staffApi: any = {
      getDriverCashDay: jasmine.createSpy('getDriverCashDay').and.returnValue(throwError(() => new Error('boom'))),
    };
    const store = new DriverCashDayStore(staffApi, createAuthServiceStub());
    store.setScheduleId(42);

    let failed = false;
    store.error$.subscribe((v) => (failed = v));
    await store.refresh();

    expect(failed).toBeTrue();
  });
});
