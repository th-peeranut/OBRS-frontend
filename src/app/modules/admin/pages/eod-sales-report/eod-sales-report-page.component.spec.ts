import { BehaviorSubject } from 'rxjs';
import { EodSalesReportPageComponent } from './eod-sales-report-page.component';
import { EodSalesReportDto } from '../../../../shared/interfaces/eod-sales-report.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

function makeReport(overrides: Partial<EodSalesReportDto> = {}): EodSalesReportDto {
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
      {
        salespersonId: null,
        salespersonName: 'Unassigned',
        salesPointStopId: null,
        salesPointStopLabel: null,
        bookingCount: 1,
        ticketsSold: 1,
        cashAmount: '200.00',
        nonCashAmount: '0.00',
        byMethod: { cash: { amount: '200.00', count: 1 } },
        revenue: { net: '200.00', paid: '200.00', refunded: '0.00', currency: 'THB' },
      },
    ],
    grandTotal: {
      bookingCount: 6,
      ticketsSold: 9,
      cashAmount: '3400.00',
      nonCashAmount: '1500.00',
      byMethod: {
        cash: { amount: '3400.00', count: 5 },
        card: { amount: '1500.00', count: 1 },
      },
      revenue: { net: '4900.00', paid: '4900.00', refunded: '0.00', currency: 'THB' },
    },
    ...overrides,
  };
}

function makeStoreStub(data: EodSalesReportDto | null, date = '2026-07-11') {
  const data$ = new BehaviorSubject<EodSalesReportDto | null>(data);
  const refreshing$ = new BehaviorSubject<boolean>(false);
  const error$ = new BehaviorSubject<boolean>(false);
  return {
    data$,
    refreshing$,
    error$,
    date,
    hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setDate: jasmine.createSpy('setDate'),
  };
}

describe('EodSalesReportPageComponent', () => {
  it('should create', () => {
    const store = makeStoreStub(null);
    const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
    expect(component).toBeTruthy();
  });

  it('seeds the date picker from the store date on init', () => {
    const store = makeStoreStub(null, '2026-06-15');
    const component = new EodSalesReportPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).selectedDate.getFullYear()).toBe(2026);
    expect((component as any).selectedDate.getMonth()).toBe(5); // June, 0-indexed
    expect((component as any).selectedDate.getDate()).toBe(15);
    expect(store.refresh).toHaveBeenCalled();
  });

  it('renders cached data immediately via the rows/grandTotal getters', () => {
    const store = makeStoreStub(makeReport());
    const component = new EodSalesReportPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).rows.length).toBe(2);
    expect((component as any).grandTotal.bookingCount).toBe(6);
  });

  // contentState drives the body so a message never renders beside a stale/zero table.
  describe('contentState', () => {
    it('is "loading" on first ever visit (no cache yet, refresh in flight)', () => {
      const store = makeStoreStub(null);
      store.refreshing$.next(true);
      store.hasValue = false;
      const component = new EodSalesReportPageComponent(store as any, createTranslateStub());

      component.ngOnInit();

      expect((component as any).contentState).toBe('loading');
    });

    it('is "error" when a fetch fails with no cached value', () => {
      const store = makeStoreStub(null);
      const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      store.error$.next(true);

      expect((component as any).contentState).toBe('error');
      expect((component as any).loadError).toBe('ADMIN.EOD_REPORT.LOAD_FAILED');
    });

    it('keeps loadError empty (contentState not "error") when a background revalidate fails but cached data remains', () => {
      const store = makeStoreStub(makeReport());
      store.hasValue = true;
      const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      store.error$.next(true);

      expect((component as any).loadError).toBe('');
      expect((component as any).contentState).toBe('data');
    });

    it('is "empty" for a day with no staff-sold activity (salespersons: [])', () => {
      const store = makeStoreStub(
        makeReport({
          salespersons: [],
          grandTotal: {
            bookingCount: 0,
            ticketsSold: 0,
            cashAmount: '0.00',
            nonCashAmount: '0.00',
            byMethod: {},
            revenue: { net: '0.00', paid: '0.00', refunded: '0.00', currency: 'THB' },
          },
        })
      );
      const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      expect((component as any).contentState).toBe('empty');
    });

    it('is "data" for a day with at least one row', () => {
      const store = makeStoreStub(makeReport());
      const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      expect((component as any).contentState).toBe('data');
    });
  });

  it('formatMoney formats a decimal string as localized currency', () => {
    const store = makeStoreStub(makeReport());
    const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    expect((component as any).formatMoney('3200.00', 'THB')).toContain('3,200');
  });

  it('formatMoney falls back to 0 for a non-numeric string', () => {
    const store = makeStoreStub(makeReport());
    const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    expect((component as any).formatMoney('not-a-number', 'THB')).toContain('0.00');
  });

  describe('expand toggle', () => {
    it('toggles a numeric salespersonId row in and out of expandedRows', () => {
      const store = makeStoreStub(makeReport());
      const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();
      const row = (component as any).rows[0]; // salespersonId: 42

      expect((component as any).isExpanded(row)).toBeFalse();
      (component as any).toggleExpand(row);
      expect((component as any).isExpanded(row)).toBeTrue();
      (component as any).toggleExpand(row);
      expect((component as any).isExpanded(row)).toBeFalse();
    });

    it('tracks the null-salespersonId "Unassigned" row via a synthetic key', () => {
      const store = makeStoreStub(makeReport());
      const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();
      const unassignedRow = (component as any).rows[1]; // salespersonId: null

      expect((component as any).isExpanded(unassignedRow)).toBeFalse();
      (component as any).toggleExpand(unassignedRow);
      expect((component as any).isExpanded(unassignedRow)).toBeTrue();
      // Does not collide with the numeric row's expand state.
      expect((component as any).isExpanded((component as any).rows[0])).toBeFalse();
    });

    it('clears expandedRows when the salespersons array identity changes (new fetch)', () => {
      const store = makeStoreStub(makeReport());
      const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();
      const row = (component as any).rows[0];
      (component as any).toggleExpand(row);
      expect((component as any).isExpanded(row)).toBeTrue();

      // Simulate setDate() resolving with a fresh report (new array reference, same shape).
      store.data$.next(makeReport());

      expect((component as any).isExpanded((component as any).rows[0])).toBeFalse();
    });
  });

  describe('methodEntries (KNOWN_METHOD_ORDER sort)', () => {
    it('sorts known methods per KNOWN_METHOD_ORDER, unlisted methods last', () => {
      const store = makeStoreStub(makeReport());
      const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      const byMethod = {
        other: { amount: '10.00', count: 1 },
        card: { amount: '20.00', count: 2 },
        cash: { amount: '30.00', count: 3 },
        new_wallet_slug: { amount: '5.00', count: 1 },
        qr_promptpay: { amount: '15.00', count: 1 },
      };

      const sortedSlugs = (component as any)
        .methodEntries(byMethod)
        .map((entry: { slug: string }) => entry.slug);

      expect(sortedSlugs).toEqual(['cash', 'card', 'qr_promptpay', 'other', 'new_wallet_slug']);
    });
  });

  describe('methodLabel', () => {
    it('returns the translated label for a known method', () => {
      const store = makeStoreStub(makeReport());
      const translate = createTranslateStub();
      translate.instant = (key: string) =>
        key === 'ADMIN.EOD_REPORT.METHOD.CASH' ? 'Cash' : key;
      const component = new EodSalesReportPageComponent(store as any, translate);
      component.ngOnInit();

      expect((component as any).methodLabel('cash')).toBe('Cash');
    });

    // Forward-compat with a payment method the backend ships before i18n catches up: ngx-translate's
    // instant() echoes the key itself when no translation exists.
    it('falls back to the raw slug when the translation is missing', () => {
      const store = makeStoreStub(makeReport());
      const translate = createTranslateStub();
      translate.instant = (key: string) =>
        key === 'ADMIN.EOD_REPORT.METHOD.CASH' ? 'Cash' : key;
      const component = new EodSalesReportPageComponent(store as any, translate);
      component.ngOnInit();

      expect((component as any).methodLabel('new_wallet_slug')).toBe('new_wallet_slug');
    });
  });

  it('grandTotal getter reflects the store-provided grand total', () => {
    const store = makeStoreStub(makeReport());
    const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    expect((component as any).grandTotal.cashAmount).toBe('3400.00');
    expect((component as any).grandTotal.revenue.net).toBe('4900.00');
  });

  // Date change -> refresh: onDateChange must dispatch store.setDate with a yyyy-MM-dd string.
  it('dispatches store.setDate with a yyyy-MM-dd string on date change', () => {
    const store = makeStoreStub(makeReport());
    const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component['onDateChange'](new Date(2026, 5, 1));

    expect(store.setDate).toHaveBeenCalledWith('2026-06-01');
  });

  it('does not call store.setDate when the date is cleared', () => {
    const store = makeStoreStub(makeReport());
    const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component['onDateChange'](null);

    expect(store.setDate).not.toHaveBeenCalled();
  });

  it('unsubscribes on destroy', () => {
    const store = makeStoreStub(makeReport());
    const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component.ngOnDestroy();

    store.data$.next(makeReport({ grandTotal: { ...makeReport().grandTotal, bookingCount: 999 } }));
    expect((component as any).grandTotal.bookingCount).not.toBe(999);
  });
});
