import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { ReportsStore } from './reports.store';
import { ReportsSummaryDto } from '../../../../shared/interfaces/reports-summary.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function summary(overrides: Partial<ReportsSummaryDto> = {}): ReportsSummaryDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    basis: { volume: 'booking_date', revenue: 'booking_date', occupancy: 'departure_date' },
    tiles: { bookingCount: 10, ticketsSold: 12, occupancyRatePct: 40 },
    daily: [],
    ...overrides,
  };
}

interface FakeApi {
  getReportsSummary: jasmine.Spy<(from: string, to: string) => Observable<ResponseAPI<ReportsSummaryDto>>>;
}

function makeStore(
  api: Partial<FakeApi>,
  authStatus$ = new BehaviorSubject<boolean>(true)
): ReportsStore {
  const full: FakeApi = {
    getReportsSummary: jasmine.createSpy('getReportsSummary').and.returnValue(of(ok(summary()))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ReportsStore(full as any, { authStatus$ } as any);
}

describe('ReportsStore', () => {
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
    const getReportsSummary = jasmine
      .createSpy('getReportsSummary')
      .and.returnValue(of(ok(summary())));
    const store = makeStore({ getReportsSummary });

    await store.refresh();

    const { from, to } = store.range;
    expect(getReportsSummary).toHaveBeenCalledOnceWith(from, to);
    expect(store.value?.tiles.bookingCount).toBe(10);
  });

  // setRange() is the entry point the page calls on a (client-validated)
  // date-range change — it must update the range AND trigger a fetch with it.
  it('setRange() switches the range and refetches with the new dates', async () => {
    const getReportsSummary = jasmine
      .createSpy('getReportsSummary')
      .and.returnValue(of(ok(summary({ tiles: { bookingCount: 99, ticketsSold: 5, occupancyRatePct: 10 } }))));
    const store = makeStore({ getReportsSummary });

    store.setRange('2026-06-01', '2026-06-10');
    await Promise.resolve(); // flush the microtask refresh() kicks off

    expect(getReportsSummary).toHaveBeenCalledWith('2026-06-01', '2026-06-10');
    expect(store.range).toEqual({ from: '2026-06-01', to: '2026-06-10' });
  });

  // SWR contract (shared base class): re-entering the page must replay the
  // LAST-FETCHED range's data, not reset to the default range.
  it('replays the last-fetched range synchronously to a new subscriber on re-entry', async () => {
    const store = makeStore({
      getReportsSummary: jasmine
        .createSpy('getReportsSummary')
        .and.returnValue(of(ok(summary({ tiles: { bookingCount: 3, ticketsSold: 3, occupancyRatePct: 5 } })))),
    });
    store.setRange('2026-05-01', '2026-05-05');
    // setRange() is fire-and-forget (matches the page's other fire-and-forget
    // dispatches); flush a macrotask so the underlying refresh() has actually
    // resolved and populated data$, not just started.
    await new Promise((resolve) => setTimeout(resolve, 0));

    let received: ReportsSummaryDto | null | undefined;
    store.data$.subscribe((value) => (received = value));

    expect(received?.tiles.bookingCount).toBe(3);
    expect(store.range).toEqual({ from: '2026-05-01', to: '2026-05-05' });
  });

  it('keeps the cached value and flags error$ when a background refresh fails', async () => {
    const getReportsSummary = jasmine
      .createSpy('getReportsSummary')
      .and.returnValue(of(ok(summary())));
    const store = makeStore({ getReportsSummary });
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    let errored = false;
    store.error$.subscribe((value) => (errored = value));

    getReportsSummary.and.returnValue(throwError(() => new Error('network')));
    await store.refresh();

    expect(store.value?.tiles.bookingCount).toBe(10); // stale value retained
    expect(errored).toBeTrue();
  });

  it('exposes the errorCode from a failed fetch via lastErrorCode, for the range-specific backstop messages', async () => {
    const httpError = { error: { errorCode: 'REPORT_RANGE_TOO_LARGE' } };
    const store = makeStore({
      getReportsSummary: jasmine.createSpy().and.returnValue(throwError(() => httpError)),
    });

    await store.refresh();

    expect(store.lastErrorCode).toBe('REPORT_RANGE_TOO_LARGE');
  });

  it('clears lastErrorCode after a subsequent successful fetch', async () => {
    let shouldFail = true;
    const store = makeStore({
      getReportsSummary: jasmine.createSpy().and.callFake(() =>
        shouldFail
          ? throwError(() => ({ error: { errorCode: 'REPORT_RANGE_INVALID' } }))
          : of(ok(summary()))
      ),
    });

    await store.refresh();
    expect(store.lastErrorCode).toBe('REPORT_RANGE_INVALID');

    shouldFail = false;
    await store.refresh();
    expect(store.lastErrorCode).toBeNull();
  });

  it('clears the cached range data on logout', async () => {
    const authStatus$ = new BehaviorSubject<boolean>(true);
    const store = makeStore({}, authStatus$);
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    authStatus$.next(false);

    expect(store.value).toBeNull();
  });
});
