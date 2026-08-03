import { of } from 'rxjs';
import { DriverCashRatesStore } from './driver-cash-rates.store';

function createAdminApiStub(rates: unknown): any {
  return {
    getDriverCashRates: jasmine
      .createSpy('getDriverCashRates')
      .and.returnValue(of({ code: 200, message: 'OK', data: rates })),
  };
}

function createStationServiceStub(stops: unknown): any {
  return {
    getAll: jasmine.createSpy('getAll').and.returnValue(of({ code: 200, message: 'OK', data: stops })),
  };
}

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

// OBRS-960 — CORRECTED (2026-08-02, backend reconciliation): the first
// version of this store/spec fetched `AdminApiService.getLookups()`
// filtered to `category === 'stop'` — a category that does not exist on
// the real backend (`LookupCategoryConstant.java`), so it would always
// have resolved to an empty array. The store now fetches
// `StationService.getAll()` (`GET /api/stops`, the same source every
// customer-facing stop picker already uses) instead.
describe('DriverCashRatesStore', () => {
  it('fetches rates and stops together', async () => {
    const rates = [{ id: 1, stopId: 1, stopSlug: 'bkk', effectiveFrom: '2026-01-01', ratePerHead: '20.00' }];
    const stops = [
      { id: 1, slug: 'bkk', status: 'active', stopType: 'terminal', createdAt: '', updatedAt: '' },
      { id: 2, slug: 'cnx', status: 'active', stopType: 'terminal', createdAt: '', updatedAt: '' },
    ];
    const store = new DriverCashRatesStore(
      createAdminApiStub(rates),
      createStationServiceStub(stops),
      createAuthServiceStub()
    );

    await store.refresh();

    expect(store.value?.rates).toEqual(rates);
    expect(store.value?.stops.length).toBe(2);
    expect(store.value?.stops[0].slug).toBe('bkk');
  });

  it('defaults both to an empty array when the responses have no data', async () => {
    const store = new DriverCashRatesStore(
      createAdminApiStub(null),
      createStationServiceStub(null),
      createAuthServiceStub()
    );

    await store.refresh();

    expect(store.value?.rates).toEqual([]);
    expect(store.value?.stops).toEqual([]);
  });
});
