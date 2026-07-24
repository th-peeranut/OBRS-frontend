import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { RevenueAnalyticsStore } from './revenue-analytics.store';
import { RevenueAnalyticsDto } from '../../../../shared/interfaces/revenue-analytics.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function analytics(overrides: Partial<RevenueAnalyticsDto> = {}): RevenueAnalyticsDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    totals: { net: '300.00', paid: '400.00', refunded: '100.00', currency: 'THB' },
    previousPeriod: {
      range: { from: '2026-06-24', to: '2026-06-30', timezone: 'Asia/Bangkok' },
      totals: { net: '200.00', paid: '200.00', refunded: '0.00', currency: 'THB' },
      netChangePct: 50,
    },
    dailyTrend: [],
    ...overrides,
  };
}

interface FakeApi {
  getRevenueAnalytics: jasmine.Spy<(from: string, to: string) => Observable<ResponseAPI<RevenueAnalyticsDto>>>;
}

function makeStore(api: Partial<FakeApi>, authStatus$ = new BehaviorSubject<boolean>(true)): RevenueAnalyticsStore {
  const full: FakeApi = {
    getRevenueAnalytics: jasmine.createSpy('getRevenueAnalytics').and.returnValue(of(ok(analytics()))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new RevenueAnalyticsStore(full as any, { authStatus$ } as any);
}

describe('RevenueAnalyticsStore', () => {
  function toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  it('defaults to the last 7 days inclusive of today', () => {
    const { from, to } = makeStore({}).range;
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - 6);
    expect(to).toBe(toDateInputValue(today));
    expect(from).toBe(toDateInputValue(fromDate));
  });

  it('fetches using the current range on refresh()', async () => {
    const getRevenueAnalytics = jasmine.createSpy('getRevenueAnalytics').and.returnValue(of(ok(analytics())));
    const store = makeStore({ getRevenueAnalytics });

    await store.refresh();

    const { from, to } = store.range;
    expect(getRevenueAnalytics).toHaveBeenCalledOnceWith(from, to);
    expect(store.value?.totals.net).toBe('300.00');
  });

  it('setRange() switches the range and refetches with the new dates', async () => {
    const getRevenueAnalytics = jasmine.createSpy('getRevenueAnalytics').and.returnValue(of(ok(analytics())));
    const store = makeStore({ getRevenueAnalytics });

    store.setRange('2026-06-01', '2026-06-10');
    await Promise.resolve();

    expect(getRevenueAnalytics).toHaveBeenCalledWith('2026-06-01', '2026-06-10');
    expect(store.range).toEqual({ from: '2026-06-01', to: '2026-06-10' });
  });

  it('exposes the errorCode from a failed fetch via lastErrorCode', async () => {
    const store = makeStore({
      getRevenueAnalytics: jasmine.createSpy().and.returnValue(throwError(() => ({ error: { errorCode: 'REPORT_RANGE_TOO_LARGE' } }))),
    });

    await store.refresh();

    expect(store.lastErrorCode).toBe('REPORT_RANGE_TOO_LARGE');
  });

  it('keeps the cached value and flags error$ when a background refresh fails', async () => {
    const getRevenueAnalytics = jasmine.createSpy('getRevenueAnalytics').and.returnValue(of(ok(analytics())));
    const store = makeStore({ getRevenueAnalytics });
    await store.refresh();

    let errored = false;
    store.error$.subscribe((value) => (errored = value));
    getRevenueAnalytics.and.returnValue(throwError(() => new Error('network')));
    await store.refresh();

    expect(store.value?.totals.net).toBe('300.00');
    expect(errored).toBeTrue();
  });
});
