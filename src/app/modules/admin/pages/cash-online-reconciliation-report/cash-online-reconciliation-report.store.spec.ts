import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { CashOnlineReconciliationReportStore } from './cash-online-reconciliation-report.store';
import { CashOnlineReconciliationReportDto } from '../../../../shared/interfaces/cash-online-reconciliation-report.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function report(
  overrides: Partial<CashOnlineReconciliationReportDto> = {}
): CashOnlineReconciliationReportDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    summary: {
      cash: { count: 3, collected: '900.00', refunded: '0.00', net: '900.00' },
      online: { count: 5, collected: '1500.00', refunded: '100.00', net: '1400.00' },
      other: { count: 1, collected: '200.00', refunded: '0.00', net: '200.00' },
      totalCollected: '2600.00',
      currency: 'THB',
    },
    daily: [],
    ...overrides,
  };
}

interface FakeApi {
  getCashOnlineReconciliationReport: jasmine.Spy<
    (from: string, to: string) => Observable<ResponseAPI<CashOnlineReconciliationReportDto>>
  >;
}

function makeStore(
  api: Partial<FakeApi>,
  authStatus$ = new BehaviorSubject<boolean>(true)
): CashOnlineReconciliationReportStore {
  const full: FakeApi = {
    getCashOnlineReconciliationReport: jasmine
      .createSpy('getCashOnlineReconciliationReport')
      .and.returnValue(of(ok(report()))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new CashOnlineReconciliationReportStore(full as any, { authStatus$ } as any);
}

describe('CashOnlineReconciliationReportStore', () => {
  // Mirrors the store's own local-date formatting (not toISOString(), which is
  // UTC and would be flaky near a local-midnight boundary).
  function toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  it('defaults to the last 7 days inclusive of today', () => {
    const store = makeStore({});
    const { from, to } = store.range;

    const today = new Date();
    const expectedTo = toDateInputValue(today);
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - 6);
    const expectedFrom = toDateInputValue(fromDate);

    expect(to).toBe(expectedTo);
    expect(from).toBe(expectedFrom);
  });

  it('fetches using the current range on refresh()', async () => {
    const getCashOnlineReconciliationReport = jasmine
      .createSpy('getCashOnlineReconciliationReport')
      .and.returnValue(of(ok(report())));
    const store = makeStore({ getCashOnlineReconciliationReport });

    await store.refresh();

    const { from, to } = store.range;
    expect(getCashOnlineReconciliationReport).toHaveBeenCalledOnceWith(from, to);
    expect(store.value?.summary.cash.count).toBe(3);
  });

  // setRange() is the entry point the page calls on a (client-validated)
  // date-range change — it must update the range AND trigger a fetch with it.
  it('setRange() switches the range and refetches with the new dates', async () => {
    const getCashOnlineReconciliationReport = jasmine
      .createSpy('getCashOnlineReconciliationReport')
      .and.returnValue(
        of(
          ok(
            report({
              summary: {
                cash: { count: 9, collected: '9.00', refunded: '0.00', net: '9.00' },
                online: { count: 0, collected: '0.00', refunded: '0.00', net: '0.00' },
                other: { count: 0, collected: '0.00', refunded: '0.00', net: '0.00' },
                totalCollected: '9.00',
                currency: 'THB',
              },
            })
          )
        )
      );
    const store = makeStore({ getCashOnlineReconciliationReport });

    store.setRange('2026-06-01', '2026-06-10');
    await Promise.resolve(); // flush the microtask refresh() kicks off

    expect(getCashOnlineReconciliationReport).toHaveBeenCalledWith('2026-06-01', '2026-06-10');
    expect(store.range).toEqual({ from: '2026-06-01', to: '2026-06-10' });
  });

  // SWR contract (shared base class): re-entering the page must replay the
  // LAST-FETCHED range's data, not reset to the default range.
  it('replays the last-fetched range synchronously to a new subscriber on re-entry', async () => {
    const store = makeStore({
      getCashOnlineReconciliationReport: jasmine
        .createSpy('getCashOnlineReconciliationReport')
        .and.returnValue(
          of(
            ok(
              report({
                summary: {
                  cash: { count: 5, collected: '5.00', refunded: '0.00', net: '5.00' },
                  online: { count: 0, collected: '0.00', refunded: '0.00', net: '0.00' },
                  other: { count: 0, collected: '0.00', refunded: '0.00', net: '0.00' },
                  totalCollected: '5.00',
                  currency: 'THB',
                },
              })
            )
          )
        ),
    });
    store.setRange('2026-05-01', '2026-05-05');
    await new Promise((resolve) => setTimeout(resolve, 0));

    let received: CashOnlineReconciliationReportDto | null | undefined;
    store.data$.subscribe((value) => (received = value));

    expect(received?.summary.cash.count).toBe(5);
    expect(store.range).toEqual({ from: '2026-05-01', to: '2026-05-05' });
  });

  it('keeps the cached value and flags error$ when a background refresh fails', async () => {
    const getCashOnlineReconciliationReport = jasmine
      .createSpy('getCashOnlineReconciliationReport')
      .and.returnValue(of(ok(report())));
    const store = makeStore({ getCashOnlineReconciliationReport });
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    let errored = false;
    store.error$.subscribe((value) => (errored = value));

    getCashOnlineReconciliationReport.and.returnValue(throwError(() => new Error('network')));
    await store.refresh();

    expect(store.value?.summary.cash.count).toBe(3); // stale value retained
    expect(errored).toBeTrue();
  });

  it('falls back to a zeroed report when the response has no data', async () => {
    const getCashOnlineReconciliationReport = jasmine
      .createSpy('getCashOnlineReconciliationReport')
      .and.returnValue(of(ok(null as unknown as CashOnlineReconciliationReportDto)));
    const store = makeStore({ getCashOnlineReconciliationReport });

    await store.refresh();

    expect(store.value?.summary.cash).toEqual({
      count: 0,
      collected: '0.00',
      refunded: '0.00',
      net: '0.00',
    });
    expect(store.value?.summary.online).toEqual({
      count: 0,
      collected: '0.00',
      refunded: '0.00',
      net: '0.00',
    });
    expect(store.value?.summary.other).toEqual({
      count: 0,
      collected: '0.00',
      refunded: '0.00',
      net: '0.00',
    });
    expect(store.value?.summary.totalCollected).toBe('0.00');
    expect(store.value?.summary.currency).toBe('THB');
    expect(store.value?.daily).toEqual([]);
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
