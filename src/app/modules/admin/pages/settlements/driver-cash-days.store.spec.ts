import { of } from 'rxjs';
import { DriverCashDaysStore } from './driver-cash-days.store';

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

  it('fetches with the current range and returns the response data', async () => {
    const page = { range: { from: '2026-08-01', to: '2026-08-07', timezone: 'Asia/Bangkok' }, items: [] };
    const adminApi = createAdminApiStub({ code: 200, message: 'OK', data: page });
    const store = new DriverCashDaysStore(adminApi, createAuthServiceStub());

    await store.refresh();

    expect(store.value).toEqual(page);
  });

  it('setRange updates the range and re-fetches', async () => {
    const adminApi = createAdminApiStub({ code: 200, message: 'OK', data: { range: {}, items: [] } });
    const store = new DriverCashDaysStore(adminApi, createAuthServiceStub());

    store.setRange('2026-01-01', '2026-01-31');
    await new Promise((r) => setTimeout(r, 0));

    expect(adminApi.getDriverCashDays).toHaveBeenCalledWith('2026-01-01', '2026-01-31');
    expect(store.range).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });
});
