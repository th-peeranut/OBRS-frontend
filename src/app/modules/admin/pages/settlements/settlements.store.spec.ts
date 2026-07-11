import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { SettlementsPendingStore } from './settlements.store';
import {
  SettlementPendingPageDto,
} from '../../../../shared/interfaces/settlement.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function page(overrides: Partial<SettlementPendingPageDto> = {}): SettlementPendingPageDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    items: [
      {
        scheduleId: 1,
        originStopId: 5,
        originStopSlug: 'nong_chak',
        departureDateTime: '2026-07-10T08:00:00+07:00',
        routeSlug: 'bkk-cnx',
        liveTotalAmount: '1000.00',
        ticketCount: 4,
      },
    ],
    ...overrides,
  };
}

interface FakeApi {
  getSettlementsPending: jasmine.Spy<
    (from: string, to: string) => Observable<ResponseAPI<SettlementPendingPageDto>>
  >;
}

function makeStore(
  api: Partial<FakeApi>,
  authStatus$ = new BehaviorSubject<boolean>(true)
): SettlementsPendingStore {
  const full: FakeApi = {
    getSettlementsPending: jasmine.createSpy('getSettlementsPending').and.returnValue(of(ok(page()))),
    ...api,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new SettlementsPendingStore(full as any, { authStatus$ } as any);
}

describe('SettlementsPendingStore', () => {
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
    const getSettlementsPending = jasmine
      .createSpy('getSettlementsPending')
      .and.returnValue(of(ok(page())));
    const store = makeStore({ getSettlementsPending });

    await store.refresh();

    const { from, to } = store.range;
    expect(getSettlementsPending).toHaveBeenCalledOnceWith(from, to);
    expect(store.value?.items.length).toBe(1);
  });

  it('setRange() switches the range and refetches with the new dates', async () => {
    const getSettlementsPending = jasmine
      .createSpy('getSettlementsPending')
      .and.returnValue(of(ok(page({ items: [] }))));
    const store = makeStore({ getSettlementsPending });

    store.setRange('2026-06-01', '2026-06-10');
    await Promise.resolve();

    expect(getSettlementsPending).toHaveBeenCalledWith('2026-06-01', '2026-06-10');
    expect(store.range).toEqual({ from: '2026-06-01', to: '2026-06-10' });
  });

  it('replays the last-fetched range synchronously to a new subscriber on re-entry', async () => {
    const store = makeStore({
      getSettlementsPending: jasmine
        .createSpy('getSettlementsPending')
        .and.returnValue(
          of(
            ok(
              page({
                items: [
                  {
                    scheduleId: 3,
                    originStopId: 5,
                    originStopSlug: 'nong_chak',
                    departureDateTime: '2026-05-01T08:00:00+07:00',
                    routeSlug: 'bkk-cnx',
                    liveTotalAmount: '300.00',
                    ticketCount: 1,
                  },
                ],
              })
            )
          )
        ),
    });
    store.setRange('2026-05-01', '2026-05-05');
    await new Promise((resolve) => setTimeout(resolve, 0));

    let received: SettlementPendingPageDto | null | undefined;
    store.data$.subscribe((value) => (received = value));

    expect(received?.items[0].scheduleId).toBe(3);
    expect(store.range).toEqual({ from: '2026-05-01', to: '2026-05-05' });
  });

  it('keeps the cached value and flags error$ when a background refresh fails', async () => {
    const getSettlementsPending = jasmine
      .createSpy('getSettlementsPending')
      .and.returnValue(of(ok(page())));
    const store = makeStore({ getSettlementsPending });
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    let errored = false;
    store.error$.subscribe((value) => (errored = value));

    getSettlementsPending.and.returnValue(throwError(() => new Error('network')));
    await store.refresh();

    expect(store.value?.items.length).toBe(1); // stale value retained
    expect(errored).toBeTrue();
  });

  it('exposes the errorCode from a failed fetch via lastErrorCode', async () => {
    const httpError = { error: { errorCode: 'SETTLEMENT_RANGE_INVALID' } };
    const store = makeStore({
      getSettlementsPending: jasmine.createSpy().and.returnValue(throwError(() => httpError)),
    });

    await store.refresh();

    expect(store.lastErrorCode).toBe('SETTLEMENT_RANGE_INVALID');
  });

  it('clears lastErrorCode after a subsequent successful fetch', async () => {
    let shouldFail = true;
    const store = makeStore({
      getSettlementsPending: jasmine.createSpy().and.callFake(() =>
        shouldFail
          ? throwError(() => ({ error: { errorCode: 'SETTLEMENT_RANGE_INVALID' } }))
          : of(ok(page()))
      ),
    });

    await store.refresh();
    expect(store.lastErrorCode).toBe('SETTLEMENT_RANGE_INVALID');

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

  // Confirm success path (page.component uses this to remove a settled row
  // without waiting on the background revalidate).
  it('mutate() removes a settled row optimistically', async () => {
    const store = makeStore({});
    await store.refresh();

    store.mutate((current) => ({
      ...current,
      items: current.items.filter((i) => i.scheduleId !== 1),
    }));

    expect(store.value?.items.length).toBe(0);
  });
});
