import { of } from 'rxjs';
import { DriverCashDaysStore } from './driver-cash-days.store';
import { DriverCashDaySummaryRespDto } from '../../../../shared/interfaces/driver-cash.interface';

function createAdminApiStub(response: unknown): any {
  return { getDriverCashDays: jasmine.createSpy('getDriverCashDays').and.returnValue(of(response)) };
}

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

describe('DriverCashDaysStore', () => {
  it('defaults to a 7-day range ending today', () => {
    const store = new DriverCashDaysStore(createAdminApiStub({}), createAuthServiceStub());
    const range = store.range;
    const spanDays = Math.round(
      (new Date(range.to).getTime() - new Date(range.from).getTime()) / (24 * 60 * 60 * 1000)
    );
    expect(spanDays).toBe(6);
  });

  // OBRS-960 — CORRECTED (2026-08-02, backend reconciliation): the real
  // endpoint returns a FLAT array, not a `{range, items}` page wrapper —
  // the first version of this store (and this spec) invented that wrapper.
  it('fetches with the current range and returns the flat response array', async () => {
    const rows: DriverCashDaySummaryRespDto[] = [
      {
        dayId: 1,
        driverId: 5,
        driverName: 'Somchai',
        businessDate: '2026-08-01',
        vehicleId: 10,
        vehiclePlate: 'AB-1234',
        status: 'OPEN',
        expectedReturnAmount: '250.00',
        returnedAmount: null,
        discrepancy: null,
        hasUnmappedSalesPointRemit: false,
      },
    ];
    const adminApi = createAdminApiStub({ code: 200, message: 'OK', data: rows });
    const store = new DriverCashDaysStore(adminApi, createAuthServiceStub());

    await store.refresh();

    expect(store.value).toEqual(rows);
  });

  it('defaults to an empty array when the response has no data', async () => {
    const adminApi = createAdminApiStub({ code: 200, message: 'OK', data: null });
    const store = new DriverCashDaysStore(adminApi, createAuthServiceStub());

    await store.refresh();

    expect(store.value).toEqual([]);
  });

  it('setRange updates the range and re-fetches', async () => {
    const adminApi = createAdminApiStub({ code: 200, message: 'OK', data: [] });
    const store = new DriverCashDaysStore(adminApi, createAuthServiceStub());

    store.setRange('2026-01-01', '2026-01-31');
    await new Promise((r) => setTimeout(r, 0));

    expect(adminApi.getDriverCashDays).toHaveBeenCalledWith('2026-01-01', '2026-01-31');
    expect(store.range).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });
});
