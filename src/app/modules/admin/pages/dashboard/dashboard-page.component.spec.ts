import { BehaviorSubject } from 'rxjs';
import { DashboardPageComponent } from './dashboard-page.component';
import { DashboardTodayDto } from '../../../../shared/interfaces/dashboard-today.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

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

function makeStoreStub(data: DashboardTodayDto | null) {
  const data$ = new BehaviorSubject<DashboardTodayDto | null>(data);
  const refreshing$ = new BehaviorSubject<boolean>(false);
  const error$ = new BehaviorSubject<boolean>(false);
  return {
    data$,
    refreshing$,
    error$,
    hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
  };
}

describe('DashboardPageComponent', () => {
  it('should create', () => {
    const store = makeStoreStub(null);
    const component = new DashboardPageComponent(store as any, createTranslateStub());
    expect(component).toBeTruthy();
  });

  it('shows the loading skeleton state on first ever visit (no cache yet)', () => {
    const store = makeStoreStub(null);
    store.refreshing$.next(true);
    store.hasValue = false;
    const component = new DashboardPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).isLoading).toBeTrue();
    expect((component as any).contentState).toBe('loading');
  });

  it('renders cached data immediately via the tiles/departures getters', () => {
    const store = makeStoreStub(makeSnapshot());
    const component = new DashboardPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).tiles.bookingCount).toBe(20);
    expect((component as any).departures.length).toBe(1);
    expect(store.refresh).toHaveBeenCalled();
  });

  // The Revenue tile renders off the PRESENCE of tiles.revenue, never a
  // client-side role check — forward-compatible with a future viewer without
  // revenue visibility.
  it('showRevenue reflects the presence of tiles.revenue, not a role check', () => {
    const withRevenue = makeStoreStub(makeSnapshot());
    const componentWith = new DashboardPageComponent(withRevenue as any, createTranslateStub());
    componentWith.ngOnInit();
    expect((componentWith as any).showRevenue).toBeTrue();

    const snapshotNoRevenue = makeSnapshot();
    delete (snapshotNoRevenue.tiles as any).revenue;
    const withoutRevenue = makeStoreStub(snapshotNoRevenue);
    const componentWithout = new DashboardPageComponent(withoutRevenue as any, createTranslateStub());
    componentWithout.ngOnInit();
    expect((componentWithout as any).showRevenue).toBeFalse();
  });

  it('flags an all-zero day as isEmptyDay (not an error)', () => {
    const store = makeStoreStub(
      makeSnapshot({
        tiles: { departuresCount: 0, occupancyRatePct: 0, bookingCount: 0 },
        departures: [],
      })
    );
    const component = new DashboardPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).isEmptyDay).toBeTrue();
    expect((component as any).contentState).toBe('empty');
  });

  // Occupancy keys on departure-date; a day can have real occupancy while
  // bookingCount (booking-date basis) is 0 — that is NOT empty (OBRS-40
  // e41e88e precedent, carried over to the dashboard).
  it('does NOT flag a day with departure-date occupancy but zero bookings as empty', () => {
    const store = makeStoreStub(
      makeSnapshot({
        tiles: { departuresCount: 2, occupancyRatePct: 21.4, bookingCount: 0 },
        departures: [
          {
            scheduleId: 1,
            routeLabel: 'Bangkok -> Pattaya',
            departureTime: '2026-07-10T09:00:00+07:00',
            seatsSold: 3,
            capacity: 14,
            occupancyRatePct: 21.4,
          },
        ],
      })
    );
    const component = new DashboardPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).isEmptyDay).toBeFalse();
    expect((component as any).contentState).toBe('data');
  });

  it('contentState is "data" for a non-zero snapshot', () => {
    const store = makeStoreStub(makeSnapshot());
    const component = new DashboardPageComponent(store as any, createTranslateStub());
    component.ngOnInit();
    expect((component as any).contentState).toBe('data');
  });

  it('contentState is "error" when a fetch fails with no cached value', () => {
    const store = makeStoreStub(null);
    const component = new DashboardPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).contentState).toBe('error');
    expect((component as any).loadError).toBe('ADMIN.DASHBOARD.LOAD_FAILED');
  });

  it('keeps loadError empty when a background revalidate fails but cached data remains (hasValue true)', () => {
    const store = makeStoreStub(makeSnapshot());
    store.hasValue = true;
    const component = new DashboardPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).loadError).toBe('');
    expect((component as any).hasFailed).toBeTrue();
    expect((component as any).contentState).toBe('data'); // tiles/table stay, not the error card
  });

  // Money fields are decimal STRINGS — format via Number()->Intl.NumberFormat,
  // never toFixed the string itself.
  it('formats the revenue tile via Number()->Intl.NumberFormat, not string toFixed', () => {
    const store = makeStoreStub(
      makeSnapshot({
        tiles: {
          departuresCount: 1,
          occupancyRatePct: 10,
          bookingCount: 1,
          revenue: { net: '1234.5', paid: '1234.5', refunded: '0.00', currency: 'THB' },
        },
      })
    );
    const component = new DashboardPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    expect((component as any).revenueTileDisplay).toBe(
      (component as any).formatMoney('1234.5', 'THB')
    );
    expect((component as any).revenueTileDisplay).toContain('1,234.5');
  });

  it('formats occupancy to 1 decimal place', () => {
    const store = makeStoreStub(makeSnapshot());
    const component = new DashboardPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    expect((component as any).occupancyDisplay(55.5)).toBe('55.5%');
    expect((component as any).occupancyDisplay(0)).toBe('0.0%');
  });

  it('unsubscribes on destroy', () => {
    const store = makeStoreStub(makeSnapshot());
    const component = new DashboardPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component.ngOnDestroy();

    store.data$.next(makeSnapshot({ tiles: { departuresCount: 999, occupancyRatePct: 1, bookingCount: 1 } }));
    expect((component as any).tiles.departuresCount).not.toBe(999);
  });
});
