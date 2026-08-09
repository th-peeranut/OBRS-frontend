import { of, throwError } from 'rxjs';
import { DriverCashDayStore } from './driver-cash-day.store';
import { DriverCashDayRespDto } from '../../../../shared/interfaces/driver-cash.interface';

function createStaffApiStub(response: unknown): any {
  return { getDriverCashDay: jasmine.createSpy('getDriverCashDay').and.returnValue(of(response)) };
}

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

// OBRS-960 — CORRECTED (2026-08-02, backend reconciliation): the real, flat
// DriverCashDayRespDto (no `scheduleId`/`routeLabel`/`departureDateTime`/
// `currency`/nested `summary` — none of those exist on the real DTO).
const DAY_RESP: DriverCashDayRespDto = {
  dayId: 1,
  driverId: 5,
  driverName: 'Somchai',
  holderRole: 'DRIVER',
  businessDate: '2026-08-01',
  vehicleId: 42,
  status: 'OPEN',
  entries: [],
  advanceTotal: '0.00',
  perHeadTotal: '0.00',
  expensePaidTotal: '0.00',
  parcelRemitTotal: '0.00',
  // OBRS-992/OBRS-1053: already INSIDE expectedReturnAmount, never an addend.
  parcelClawbackTotal: '0.00',
  expectedReturnAmount: '0.00',
  returnedAmount: null,
  returnedAt: null,
  returnedByUserId: null,
  returnedByName: null,
  discrepancy: null,
  discrepancyReason: null,
  perHeadRates: [],
  hasUnmappedSalesPointRemit: false,
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
