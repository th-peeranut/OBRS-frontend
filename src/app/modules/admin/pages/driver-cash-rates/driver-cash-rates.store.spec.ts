import { of } from 'rxjs';
import { DriverCashRatesStore } from './driver-cash-rates.store';

function createAdminApiStub(rates: unknown, lookups: unknown): any {
  return {
    getDriverCashRates: jasmine.createSpy('getDriverCashRates').and.returnValue(of({ code: 200, message: 'OK', data: rates })),
    getLookups: jasmine.createSpy('getLookups').and.returnValue(of({ code: 200, message: 'OK', data: lookups })),
  };
}

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

describe('DriverCashRatesStore', () => {
  it('fetches rates and filters lookups to category "stop" only', async () => {
    const rates = [{ id: 1, stopId: 1, stopSlug: 'bkk', effectiveFrom: '2026-01-01', ratePerHead: '20.00' }];
    const lookups = [
      { id: 1, category: 'stop', slug: 'bkk', translations: [] },
      { id: 2, category: 'vehicle_type', slug: 'van', translations: [] },
    ];
    const store = new DriverCashRatesStore(createAdminApiStub(rates, lookups), createAuthServiceStub());

    await store.refresh();

    expect(store.value?.rates).toEqual(rates);
    expect(store.value?.stopLookups.length).toBe(1);
    expect(store.value?.stopLookups[0].slug).toBe('bkk');
  });
});
