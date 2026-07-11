import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { EodSalesReportStore } from './eod-sales-report.store';
import { EodSalesReportDto } from '../../../../shared/interfaces/eod-sales-report.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function report(overrides: Partial<EodSalesReportDto> = {}): EodSalesReportDto {
  return {
    date: '2026-07-11',
    timezone: 'Asia/Bangkok',
    salespersons: [
      {
        salespersonId: 42,
        salespersonName: 'Somchai Jai',
        salesPointStopId: 7,
        salesPointStopLabel: 'bkk_hub',
        bookingCount: 5,
        ticketsSold: 8,
        cashAmount: '3200.00',
        nonCashAmount: '1500.00',
        byMethod: {
          cash: { amount: '3200.00', count: 4 },
          card: { amount: '1500.00', count: 1 },
        },
        revenue: { net: '4700.00', paid: '4700.00', refunded: '0.00', currency: 'THB' },
      },
    ],
    grandTotal: {
      bookingCount: 5,
      ticketsSold: 8,
      cashAmount: '3200.00',
      nonCashAmount: '1500.00',
      byMethod: {
        cash: { amount: '3200.00', count: 4 },
        card: { amount: '1500.00', count: 1 },
      },
      revenue: { net: '4700.00', paid: '4700.00', refunded: '0.00', currency: 'THB' },
    },
    ...overrides,
  };
}

interface FakeApi {
  getEodSalesReport: jasmine.Spy<(date: string) => Observable<ResponseAPI<EodSalesReportDto>>>;
}

function makeStore(
  api: Partial<FakeApi>,
  authStatus$ = new BehaviorSubject<boolean>(true)
): EodSalesReportStore {
  const full: FakeApi = {
    getEodSalesReport: jasmine.createSpy('getEodSalesReport').and.returnValue(of(ok(report()))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new EodSalesReportStore(full as any, { authStatus$ } as any);
}

describe('EodSalesReportStore', () => {
  // Mirrors the store's own local-date formatting (not toISOString(), which is UTC and would
  // be flaky near a local-midnight boundary).
  function toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  it('defaults to today, client-local yyyy-MM-dd', () => {
    const store = makeStore({});
    expect(store.date).toBe(toDateInputValue(new Date()));
  });

  it('fetches using the current date on refresh()', async () => {
    const getEodSalesReport = jasmine
      .createSpy('getEodSalesReport')
      .and.returnValue(of(ok(report())));
    const store = makeStore({ getEodSalesReport });

    await store.refresh();

    expect(getEodSalesReport).toHaveBeenCalledOnceWith(store.date);
    expect(store.value?.grandTotal.bookingCount).toBe(5);
  });

  // setDate() is the entry point the page calls on a date-picker change — it must update the
  // cached date AND trigger a fetch with it.
  it('setDate() switches the day and refetches with the new date', async () => {
    const getEodSalesReport = jasmine
      .createSpy('getEodSalesReport')
      .and.returnValue(of(ok(report({ grandTotal: report().grandTotal }))));
    const store = makeStore({ getEodSalesReport });

    store.setDate('2026-06-01');
    await Promise.resolve(); // flush the microtask refresh() kicks off

    expect(getEodSalesReport).toHaveBeenCalledWith('2026-06-01');
    expect(store.date).toBe('2026-06-01');
  });

  // SWR contract (shared base class): re-entering the page must replay the LAST-FETCHED
  // day's data, not reset to today.
  it('replays the last-fetched day synchronously to a new subscriber on re-entry', async () => {
    const store = makeStore({
      getEodSalesReport: jasmine
        .createSpy('getEodSalesReport')
        .and.returnValue(of(ok(report({ date: '2026-05-01' })))),
    });
    store.setDate('2026-05-01');
    await new Promise((resolve) => setTimeout(resolve, 0));

    let received: EodSalesReportDto | null | undefined;
    store.data$.subscribe((value) => (received = value));

    expect(received?.date).toBe('2026-05-01');
    expect(store.date).toBe('2026-05-01');
  });

  it('keeps the cached value and flags error$ when a background refresh fails', async () => {
    const getEodSalesReport = jasmine
      .createSpy('getEodSalesReport')
      .and.returnValue(of(ok(report())));
    const store = makeStore({ getEodSalesReport });
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    let errored = false;
    store.error$.subscribe((value) => (errored = value));

    getEodSalesReport.and.returnValue(throwError(() => new Error('network')));
    await store.refresh();

    expect(store.value?.grandTotal.bookingCount).toBe(5); // stale value retained
    expect(errored).toBeTrue();
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
