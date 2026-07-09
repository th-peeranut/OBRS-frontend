import { BehaviorSubject } from 'rxjs';
import { ReportsPageComponent } from './reports-page.component';
import { ReportsSummaryDto } from '../../../../shared/interfaces/reports-summary.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

function makeSummary(overrides: Partial<ReportsSummaryDto> = {}): ReportsSummaryDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    basis: { volume: 'booking_date', revenue: 'booking_date', occupancy: 'departure_date' },
    tiles: {
      bookingCount: 20,
      ticketsSold: 25,
      occupancyRatePct: 55.5,
      revenue: { net: '18425.00', paid: '18425.00', refunded: '0.00', currency: 'THB' },
    },
    daily: [
      {
        date: '2026-07-01',
        bookingCount: 5,
        ticketsSold: 6,
        occupancyRatePct: 50,
        seatsSold: 6,
        seatCapacity: 12,
        revenue: { net: '5000.00', paid: '5000.00', refunded: '0.00', currency: 'THB' },
      },
    ],
    ...overrides,
  };
}

function makeStoreStub(data: ReportsSummaryDto | null, range = { from: '2026-07-01', to: '2026-07-07' }) {
  const data$ = new BehaviorSubject<ReportsSummaryDto | null>(data);
  const refreshing$ = new BehaviorSubject<boolean>(false);
  const error$ = new BehaviorSubject<boolean>(false);
  return {
    data$,
    refreshing$,
    error$,
    range,
    lastErrorCode: null as string | null,
    hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setRange: jasmine.createSpy('setRange'),
  };
}

describe('ReportsPageComponent', () => {
  it('should create', () => {
    const store = makeStoreStub(null);
    const component = new ReportsPageComponent(store as any, createTranslateStub());
    expect(component).toBeTruthy();
  });

  it('seeds the two date pickers from the store range on init', () => {
    const store = makeStoreStub(null, { from: '2026-06-01', to: '2026-06-07' });
    const component = new ReportsPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).fromDate.getFullYear()).toBe(2026);
    expect((component as any).fromDate.getMonth()).toBe(5); // June, 0-indexed
    expect((component as any).fromDate.getDate()).toBe(1);
    expect((component as any).toDate.getDate()).toBe(7);
    expect(store.refresh).toHaveBeenCalled();
  });

  it('shows the loading skeleton state on first ever visit (no cache yet)', () => {
    const store = makeStoreStub(null);
    store.refreshing$.next(true);
    store.hasValue = false;
    const component = new ReportsPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).isLoading).toBeTrue();
  });

  it('renders cached data immediately via the tiles/dailyRows getters', () => {
    const store = makeStoreStub(makeSummary());
    const component = new ReportsPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).tiles.bookingCount).toBe(20);
    expect((component as any).dailyRows.length).toBe(1);
  });

  // The Revenue tile/column render off the PRESENCE of tiles.revenue, never a
  // client-side role check — forward-compatible with OBRS-129.
  it('showRevenue reflects the presence of tiles.revenue, not a role check', () => {
    const withRevenue = makeStoreStub(makeSummary());
    const componentWith = new ReportsPageComponent(withRevenue as any, createTranslateStub());
    componentWith.ngOnInit();
    expect((componentWith as any).showRevenue).toBeTrue();

    const summaryNoRevenue = makeSummary();
    delete (summaryNoRevenue.tiles as any).revenue;
    const withoutRevenue = makeStoreStub(summaryNoRevenue);
    const componentWithout = new ReportsPageComponent(withoutRevenue as any, createTranslateStub());
    componentWithout.ngOnInit();
    expect((componentWithout as any).showRevenue).toBeFalse();
  });

  it('flags an all-zero range as isEmptyRange (not an error)', () => {
    const store = makeStoreStub(
      makeSummary({
        tiles: { bookingCount: 0, ticketsSold: 0, occupancyRatePct: 0 },
        daily: [
          { date: '2026-07-01', bookingCount: 0, ticketsSold: 0, occupancyRatePct: 0, seatsSold: 0, seatCapacity: 12 },
        ],
      })
    );
    const component = new ReportsPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).isEmptyRange).toBeTrue();
  });

  // Client guard: from > to must show the inline warning and must NOT dispatch.
  it('shows RANGE_INVALID and does not call store.setRange when from > to', () => {
    const store = makeStoreStub(makeSummary());
    const component = new ReportsPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component['onFromDateChange'](new Date(2026, 6, 10));
    component['onToDateChange'](new Date(2026, 6, 1));

    expect((component as any).rangeError).toBe('ADMIN.REPORTS.ERROR.RANGE_INVALID');
    expect(store.setRange).not.toHaveBeenCalled();
  });

  // Client guard: a span over 366 days must show the inline warning and must
  // NOT dispatch.
  it('shows RANGE_TOO_LARGE and does not call store.setRange when the span exceeds 366 days', () => {
    const store = makeStoreStub(makeSummary());
    const component = new ReportsPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component['onFromDateChange'](new Date(2020, 0, 1));
    component['onToDateChange'](new Date(2026, 0, 1));

    expect((component as any).rangeError).toBe('ADMIN.REPORTS.ERROR.RANGE_TOO_LARGE');
    expect(store.setRange).not.toHaveBeenCalled();
  });

  it('dispatches store.setRange with yyyy-MM-dd strings for a valid range', () => {
    const store = makeStoreStub(makeSummary());
    const component = new ReportsPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component['onFromDateChange'](new Date(2026, 5, 1));
    component['onToDateChange'](new Date(2026, 5, 10));

    expect((component as any).rangeError).toBe('');
    expect(store.setRange).toHaveBeenCalledWith('2026-06-01', '2026-06-10');
  });

  // Server 400 backstop: branches on the stable errorCode, never the message.
  it('shows the range-specific message when error$ fires with a matching errorCode and no cache', () => {
    const store = makeStoreStub(null);
    store.lastErrorCode = 'REPORT_RANGE_TOO_LARGE';
    const component = new ReportsPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).loadError).toBe('ADMIN.REPORTS.ERROR.RANGE_TOO_LARGE');
  });

  it('falls back to the generic LOAD_FAILED message for an unrecognized errorCode', () => {
    const store = makeStoreStub(null);
    store.lastErrorCode = 'SOMETHING_ELSE';
    const component = new ReportsPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).loadError).toBe('ADMIN.REPORTS.LOAD_FAILED');
  });

  it('keeps loadError empty when a background revalidate fails but cached data remains (hasValue true)', () => {
    const store = makeStoreStub(makeSummary());
    store.hasValue = true;
    const component = new ReportsPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).loadError).toBe('');
  });

  it('unsubscribes on destroy', () => {
    const store = makeStoreStub(makeSummary());
    const component = new ReportsPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component.ngOnDestroy();

    store.data$.next(makeSummary({ tiles: { bookingCount: 999, ticketsSold: 1, occupancyRatePct: 1 } }));
    expect((component as any).tiles.bookingCount).not.toBe(999);
  });
});
