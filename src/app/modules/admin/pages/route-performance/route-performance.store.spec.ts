import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { RoutePerformanceStore } from './route-performance.store';
import { RoutePerformanceDto } from '../../../../shared/interfaces/route-performance.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> { return { code: 200, message: 'OK', data }; }
function data(): RoutePerformanceDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    routes: [{ routeId: 3, routeSlug: 'bkk-cnx', departures: 2, ticketsSold: 5, netRevenue: '500.00', currency: 'THB', revenueSharePct: 100 }],
    totals: { departures: 2, ticketsSold: 5, netRevenue: '500.00', currency: 'THB' },
  };
}
interface FakeApi { getRoutePerformance: jasmine.Spy<(from: string, to: string) => Observable<ResponseAPI<RoutePerformanceDto>>>; }
function makeStore(api: Partial<FakeApi>, authStatus$ = new BehaviorSubject<boolean>(true)): RoutePerformanceStore {
  const full: FakeApi = { getRoutePerformance: jasmine.createSpy('getRoutePerformance').and.returnValue(of(ok(data()))), ...api };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new RoutePerformanceStore(full as any, { authStatus$ } as any);
}

describe('RoutePerformanceStore', () => {
  it('fetches with the current range on refresh()', async () => {
    const getRoutePerformance = jasmine.createSpy('getRoutePerformance').and.returnValue(of(ok(data())));
    const store = makeStore({ getRoutePerformance });
    await store.refresh();
    const { from, to } = store.range;
    expect(getRoutePerformance).toHaveBeenCalledOnceWith(from, to);
    expect(store.value?.totals.ticketsSold).toBe(5);
  });

  it('setRange() switches the range and refetches', async () => {
    const getRoutePerformance = jasmine.createSpy('getRoutePerformance').and.returnValue(of(ok(data())));
    const store = makeStore({ getRoutePerformance });
    store.setRange('2026-06-01', '2026-06-10');
    await Promise.resolve();
    expect(getRoutePerformance).toHaveBeenCalledWith('2026-06-01', '2026-06-10');
  });

  it('exposes lastErrorCode from a failed fetch', async () => {
    const store = makeStore({ getRoutePerformance: jasmine.createSpy().and.returnValue(throwError(() => ({ error: { errorCode: 'REPORT_RANGE_TOO_LARGE' } }))) });
    await store.refresh();
    expect(store.lastErrorCode).toBe('REPORT_RANGE_TOO_LARGE');
  });
});
