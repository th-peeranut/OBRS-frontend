import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { AdminDashboardStore } from './admin-dashboard.store';
import { DashboardTodayDto } from '../../../../shared/interfaces/dashboard-today.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function makeSnapshot(overrides: Partial<DashboardTodayDto> = {}): DashboardTodayDto {
  return {
    date: '2026-07-10',
    timezone: 'Asia/Bangkok',
    basis: { volume: 'booking_date', revenue: 'booking_date', occupancy: 'departure_date' },
    tiles: {
      departuresCount: 4,
      occupancyRatePct: 55.5,
      bookingCount: 20,
      revenue: { net: '18425.00', paid: '18425.00', refunded: '0.00', currency: 'THB' },
    },
    departures: [
      {
        scheduleId: 1,
        routeLabel: 'Bangkok -> Chiang Mai',
        departureTime: '2026-07-10T08:00:00+07:00',
        seatsSold: 6,
        capacity: 12,
        occupancyRatePct: 50,
      },
    ],
    ...overrides,
  };
}

interface FakeApi {
  getDashboardToday: jasmine.Spy<() => Observable<ResponseAPI<DashboardTodayDto>>>;
}

function makeStore(
  api: Partial<FakeApi>,
  authStatus$ = new BehaviorSubject<boolean>(true)
): AdminDashboardStore {
  const full: FakeApi = {
    getDashboardToday: jasmine
      .createSpy('getDashboardToday')
      .and.returnValue(of(ok(makeSnapshot()))),
    ...api,
  };
  return new AdminDashboardStore(full as any, { authStatus$ } as any);
}

describe('AdminDashboardStore', () => {
  it('builds a snapshot from the dashboard/today endpoint on first refresh', async () => {
    const store = makeStore({
      getDashboardToday: jasmine
        .createSpy('getDashboardToday')
        .and.returnValue(of(ok(makeSnapshot({ tiles: { departuresCount: 3, occupancyRatePct: 40, bookingCount: 9 } })))),
    });

    await store.refresh();

    expect(store.value?.tiles.departuresCount).toBe(3);
    expect(store.value?.tiles.bookingCount).toBe(9);
    expect(store.hasValue).toBeTrue();
  });

  // The fix carried over from ReportsStore/AdminCollectionStore: re-entering
  // /admin/dashboard must render the cached value *synchronously* (no network
  // wait). The root-scoped store survives the component's destruction, and
  // data$ is a BehaviorSubject, so a fresh subscriber (a recreated component)
  // receives the cached value immediately.
  it('replays the cached value to a new subscriber synchronously (no refetch wait)', async () => {
    const store = makeStore({
      getDashboardToday: jasmine
        .createSpy('getDashboardToday')
        .and.returnValue(of(ok(makeSnapshot({ tiles: { departuresCount: 7, occupancyRatePct: 10, bookingCount: 1 } })))),
    });
    await store.refresh(); // first visit populates the cache

    const cached = store.value;
    let receivedOnReentry: DashboardTodayDto | null | undefined;
    store.data$.subscribe((data) => (receivedOnReentry = data)); // re-entry

    expect(receivedOnReentry).toBe(cached); // delivered before any await
    expect(receivedOnReentry).not.toBeNull();
  });

  it('reflects new data after a background revalidate', async () => {
    let bookingCount = 1;
    const store = makeStore({
      getDashboardToday: jasmine
        .createSpy('getDashboardToday')
        .and.callFake(() => of(ok(makeSnapshot({ tiles: { departuresCount: 1, occupancyRatePct: 5, bookingCount } })))),
    });

    await store.refresh();
    expect(store.value?.tiles.bookingCount).toBe(1);

    bookingCount = 2;
    await store.refresh(); // background revalidate picks up the new value

    expect(store.value?.tiles.bookingCount).toBe(2);
  });

  it('keeps the prior cached value and flags error$ when a fetch fails', async () => {
    let response$: Observable<ResponseAPI<DashboardTodayDto>> = of(ok(makeSnapshot()));
    const store = makeStore({
      getDashboardToday: jasmine.createSpy('getDashboardToday').and.callFake(() => response$),
    });

    await store.refresh();
    expect(store.hasValue).toBeTrue();

    response$ = throwError(() => new Error('network'));
    await store.refresh();

    expect(store.value?.tiles.departuresCount).toBe(4); // stale value retained, not blanked
    let failed = false;
    store.error$.subscribe((v) => (failed = v));
    expect(failed).toBeTrue();
  });

  // Concurrent calls never fan out into unrelated fetch cycles — a call that
  // arrives mid-flight collapses into the current cycle (requesting at most
  // one extra rerun when it finishes), rather than each caller kicking off
  // its own independent request. The exact rerun-count contract is the base
  // class's responsibility and is covered in detail by
  // admin-collection-store.spec.ts; here we only need the dashboard-specific
  // wiring (getDashboardToday) to resolve cleanly under concurrent refresh().
  it('resolves cleanly for concurrent refresh() callers without throwing', async () => {
    const getDashboardToday = jasmine
      .createSpy('getDashboardToday')
      .and.returnValue(of(ok(makeSnapshot())));
    const store = makeStore({ getDashboardToday });

    const first = store.refresh();
    const second = store.refresh(); // arrives while the first is in flight
    await Promise.all([first, second]);

    expect(store.hasValue).toBeTrue();
    expect(getDashboardToday).toHaveBeenCalled();
  });

  it('clears the cached value on logout so the next session starts clean', async () => {
    const authStatus$ = new BehaviorSubject<boolean>(true);
    const store = makeStore(
      {
        getDashboardToday: jasmine
          .createSpy('getDashboardToday')
          .and.returnValue(of(ok(makeSnapshot()))),
      },
      authStatus$
    );
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    authStatus$.next(false); // logout / token expiry

    expect(store.hasValue).toBeFalse();
  });

  it('falls back to a zeroed empty snapshot when the API returns no data', async () => {
    const store = makeStore({
      getDashboardToday: jasmine
        .createSpy('getDashboardToday')
        .and.returnValue(of({ code: 200, message: 'OK', data: undefined } as unknown as ResponseAPI<DashboardTodayDto>)),
    });

    await store.refresh();

    expect(store.value?.tiles).toEqual({ departuresCount: 0, occupancyRatePct: 0, bookingCount: 0 });
    expect(store.value?.departures).toEqual([]);
  });
});
