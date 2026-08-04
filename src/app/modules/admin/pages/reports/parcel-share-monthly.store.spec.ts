import { of } from 'rxjs';
import { ParcelShareMonthlyStore } from './parcel-share-monthly.store';

function createAdminApiStub(response: unknown): any {
  return { getParcelShareMonthly: jasmine.createSpy('getParcelShareMonthly').and.returnValue(of(response)) };
}

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

describe('ParcelShareMonthlyStore', () => {
  it('defaults the period to the current year/month', () => {
    const store = new ParcelShareMonthlyStore(createAdminApiStub({}), createAuthServiceStub());
    const now = new Date();
    expect(store.period).toEqual({ year: now.getFullYear(), month: now.getMonth() + 1 });
  });

  it('fetches with role fixed to SALESPERSON — no role selector', async () => {
    const adminApi = createAdminApiStub({ code: 200, message: 'OK', data: [] });
    const store = new ParcelShareMonthlyStore(adminApi, createAuthServiceStub());

    await store.refresh();

    const args = adminApi.getParcelShareMonthly.calls.mostRecent().args;
    expect(args[2]).toBe('SALESPERSON');
  });

  it('setPeriod updates year/month and re-fetches', async () => {
    const adminApi = createAdminApiStub({ code: 200, message: 'OK', data: [{ payeeUserId: 1, payeeName: 'A', total: '100.00' }] });
    const store = new ParcelShareMonthlyStore(adminApi, createAuthServiceStub());

    store.setPeriod(2025, 3);
    await new Promise((r) => setTimeout(r, 0));

    expect(adminApi.getParcelShareMonthly).toHaveBeenCalledWith(2025, 3, 'SALESPERSON');
    expect(store.period).toEqual({ year: 2025, month: 3 });
  });
});
