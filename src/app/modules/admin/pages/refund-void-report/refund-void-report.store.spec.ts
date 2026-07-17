import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { RefundVoidReportStore } from './refund-void-report.store';
import { RefundVoidReportDto } from '../../../../shared/interfaces/refund-void-report.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function report(overrides: Partial<RefundVoidReportDto> = {}): RefundVoidReportDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    summary: {
      refunded: { count: 3, amount: '900.00' },
      manualRefundPending: { count: 1, amount: '300.00' },
      voided: {
        count: 4,
        amount: '1200.00',
        cancelled: { count: 2, amount: '600.00' },
        expired: { count: 2, amount: '600.00' },
      },
      currency: 'THB',
    },
    daily: [],
    ...overrides,
  };
}

interface FakeApi {
  getRefundVoidReport: jasmine.Spy<(from: string, to: string) => Observable<ResponseAPI<RefundVoidReportDto>>>;
}

function makeStore(
  api: Partial<FakeApi>,
  authStatus$ = new BehaviorSubject<boolean>(true)
): RefundVoidReportStore {
  const full: FakeApi = {
    getRefundVoidReport: jasmine
      .createSpy('getRefundVoidReport')
      .and.returnValue(of(ok(report()))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new RefundVoidReportStore(full as any, { authStatus$ } as any);
}

describe('RefundVoidReportStore', () => {
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
    const getRefundVoidReport = jasmine
      .createSpy('getRefundVoidReport')
      .and.returnValue(of(ok(report())));
    const store = makeStore({ getRefundVoidReport });

    await store.refresh();

    const { from, to } = store.range;
    expect(getRefundVoidReport).toHaveBeenCalledOnceWith(from, to);
    expect(store.value?.summary.refunded.count).toBe(3);
  });

  // setRange() is the entry point the page calls on a (client-validated)
  // date-range change — it must update the range AND trigger a fetch with it.
  it('setRange() switches the range and refetches with the new dates', async () => {
    const getRefundVoidReport = jasmine
      .createSpy('getRefundVoidReport')
      .and.returnValue(
        of(
          ok(
            report({
              summary: {
                refunded: { count: 9, amount: '9.00' },
                manualRefundPending: { count: 0, amount: '0.00' },
                voided: {
                  count: 0,
                  amount: '0.00',
                  cancelled: { count: 0, amount: '0.00' },
                  expired: { count: 0, amount: '0.00' },
                },
                currency: 'THB',
              },
            })
          )
        )
      );
    const store = makeStore({ getRefundVoidReport });

    store.setRange('2026-06-01', '2026-06-10');
    await Promise.resolve(); // flush the microtask refresh() kicks off

    expect(getRefundVoidReport).toHaveBeenCalledWith('2026-06-01', '2026-06-10');
    expect(store.range).toEqual({ from: '2026-06-01', to: '2026-06-10' });
  });

  // SWR contract (shared base class): re-entering the page must replay the
  // LAST-FETCHED range's data, not reset to the default range.
  it('replays the last-fetched range synchronously to a new subscriber on re-entry', async () => {
    const store = makeStore({
      getRefundVoidReport: jasmine
        .createSpy('getRefundVoidReport')
        .and.returnValue(
          of(
            ok(
              report({
                summary: {
                  refunded: { count: 5, amount: '5.00' },
                  manualRefundPending: { count: 0, amount: '0.00' },
                  voided: {
                    count: 0,
                    amount: '0.00',
                    cancelled: { count: 0, amount: '0.00' },
                    expired: { count: 0, amount: '0.00' },
                  },
                  currency: 'THB',
                },
              })
            )
          )
        ),
    });
    store.setRange('2026-05-01', '2026-05-05');
    await new Promise((resolve) => setTimeout(resolve, 0));

    let received: RefundVoidReportDto | null | undefined;
    store.data$.subscribe((value) => (received = value));

    expect(received?.summary.refunded.count).toBe(5);
    expect(store.range).toEqual({ from: '2026-05-01', to: '2026-05-05' });
  });

  it('keeps the cached value and flags error$ when a background refresh fails', async () => {
    const getRefundVoidReport = jasmine
      .createSpy('getRefundVoidReport')
      .and.returnValue(of(ok(report())));
    const store = makeStore({ getRefundVoidReport });
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    let errored = false;
    store.error$.subscribe((value) => (errored = value));

    getRefundVoidReport.and.returnValue(throwError(() => new Error('network')));
    await store.refresh();

    expect(store.value?.summary.refunded.count).toBe(3); // stale value retained
    expect(errored).toBeTrue();
  });

  it('falls back to a zeroed report when the response has no data', async () => {
    const getRefundVoidReport = jasmine
      .createSpy('getRefundVoidReport')
      .and.returnValue(of(ok(null as unknown as RefundVoidReportDto)));
    const store = makeStore({ getRefundVoidReport });

    await store.refresh();

    expect(store.value?.summary.refunded).toEqual({ count: 0, amount: '0.00' });
    expect(store.value?.summary.voided).toEqual({
      count: 0,
      amount: '0.00',
      cancelled: { count: 0, amount: '0.00' },
      expired: { count: 0, amount: '0.00' },
    });
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
