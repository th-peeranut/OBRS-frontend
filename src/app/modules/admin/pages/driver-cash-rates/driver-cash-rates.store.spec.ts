import { of } from 'rxjs';
import { DriverCashRatesStore } from './driver-cash-rates.store';

function createAdminApiStub(rates: unknown, salesPoints: unknown, wageRates: unknown = []): any {
  return {
    getDriverCashRates: jasmine
      .createSpy('getDriverCashRates')
      .and.returnValue(of({ code: 200, message: 'OK', data: rates })),
    getDriverCashSalesPoints: jasmine
      .createSpy('getDriverCashSalesPoints')
      .and.returnValue(of({ code: 200, message: 'OK', data: salesPoints })),
    // OBRS-1356 — the wage-per-leg table, fetched alongside the two above.
    getDriverWageRates: jasmine
      .createSpy('getDriverWageRates')
      .and.returnValue(of({ code: 200, message: 'OK', data: wageRates })),
  };
}

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

// OBRS-1073 — the picker source moved from the PUBLIC all-stops endpoint
// (`StationService.getAll()`) to the owner-only
// `GET /owner/driver-cash/sales-points`. The stops list was never wrong as a
// list of stops; it was the wrong QUESTION once a rate belonged to a counter,
// because 91 of the 101 seeded stops belong to no sales point at all.
describe('DriverCashRatesStore', () => {
  const SALES_POINTS = [
    { id: 11, code: 'BAN_BUENG', name: 'บ้านบึง' },
    { id: 12, code: 'MO_CHIT', name: 'หมอชิต' },
  ];

  it('fetches rates and sales points together', async () => {
    const rates = [
      {
        id: 1,
        salesPointId: 11,
        salesPointCode: 'BAN_BUENG',
        salesPointName: 'บ้านบึง',
        effectiveFrom: '2026-01-01',
        ratePerHead: '20.00',
      },
    ];
    const store = new DriverCashRatesStore(createAdminApiStub(rates, SALES_POINTS), createAuthServiceStub());

    await store.refresh();

    expect(store.value?.rates).toEqual(rates);
    expect(store.value?.salesPoints.length).toBe(2);
    expect(store.value?.salesPoints[0].code).toBe('BAN_BUENG');
  });

  it('never calls the public all-stops endpoint any more', async () => {
    const adminApi = createAdminApiStub([], SALES_POINTS);
    const store = new DriverCashRatesStore(adminApi, createAuthServiceStub());

    await store.refresh();

    expect(adminApi.getDriverCashSalesPoints).toHaveBeenCalled();
    // The store's constructor no longer even takes a StationService - a
    // regression that reintroduced it would fail to compile, but this pins the
    // observable behaviour so a future "convenience" re-add is caught too.
    expect((store as unknown as { stationService?: unknown }).stationService).toBeUndefined();
  });

  it('defaults all three to an empty array when the responses have no data', async () => {
    const store = new DriverCashRatesStore(createAdminApiStub(null, null, null), createAuthServiceStub());

    await store.refresh();

    expect(store.value?.rates).toEqual([]);
    expect(store.value?.salesPoints).toEqual([]);
    expect(store.value?.wageRates).toEqual([]);
  });

  // OBRS-1356 — the wage rate rides on the SAME fetch, so the page cannot show
  // a per-head table that loaded and a wage table that silently did not.
  it('fetches the wage-per-leg rates with the rest', async () => {
    const wageRates = [{ id: 9, effectiveFrom: '2026-08-15', ratePerLeg: '700.00' }];
    const store = new DriverCashRatesStore(
      createAdminApiStub([], SALES_POINTS, wageRates),
      createAuthServiceStub()
    );

    await store.refresh();

    expect(store.value?.wageRates).toEqual(wageRates);
  });
});
