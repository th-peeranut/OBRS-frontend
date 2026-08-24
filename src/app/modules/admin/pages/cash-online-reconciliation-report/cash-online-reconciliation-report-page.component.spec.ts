import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { CashOnlineReconciliationReportPageComponent } from './cash-online-reconciliation-report-page.component';
import { CashOnlineReconciliationReportStore } from './cash-online-reconciliation-report.store';
import { CashOnlineReconciliationReportDto } from '../../../../shared/interfaces/cash-online-reconciliation-report.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminSharedModule } from '../../admin-shared.module';

function makeReport(
  overrides: Partial<CashOnlineReconciliationReportDto> = {}
): CashOnlineReconciliationReportDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    summary: {
      cash: { count: 3, collected: '900.00', refunded: '0.00', net: '900.00' },
      online: { count: 5, collected: '1500.00', refunded: '100.00', net: '1400.00' },
      other: { count: 1, collected: '200.00', refunded: '0.00', net: '200.00' },
      totalCollected: '2600.00',
      currency: 'THB',
    },
    daily: [
      {
        date: '2026-07-01',
        cash: { count: 2, collected: '600.00', refunded: '0.00', net: '600.00' },
        online: { count: 3, collected: '900.00', refunded: '0.00', net: '900.00' },
        other: { count: 1, collected: '200.00', refunded: '0.00', net: '200.00' },
      },
      {
        date: '2026-07-02',
        cash: { count: 1, collected: '300.00', refunded: '0.00', net: '300.00' },
        online: { count: 2, collected: '600.00', refunded: '100.00', net: '500.00' },
        other: { count: 0, collected: '0.00', refunded: '0.00', net: '0.00' },
      },
    ],
    ...overrides,
  };
}

function makeStoreStub(
  data: CashOnlineReconciliationReportDto | null,
  range = { from: '2026-07-01', to: '2026-07-07' }
) {
  const data$ = new BehaviorSubject<CashOnlineReconciliationReportDto | null>(data);
  const refreshing$ = new BehaviorSubject<boolean>(false);
  const error$ = new BehaviorSubject<boolean>(false);
  return {
    data$,
    refreshing$,
    error$,
    range,
    hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setRange: jasmine.createSpy('setRange'),
  };
}

describe('CashOnlineReconciliationReportPageComponent', () => {
  it('should create', () => {
    const store = makeStoreStub(null);
    const component = new CashOnlineReconciliationReportPageComponent(
      store as any,
      createTranslateStub()
    );
    expect(component).toBeTruthy();
  });

  it('seeds the date pickers from the store range on init', () => {
    const store = makeStoreStub(null, { from: '2026-06-01', to: '2026-06-10' });
    const component = new CashOnlineReconciliationReportPageComponent(
      store as any,
      createTranslateStub()
    );

    component.ngOnInit();

    expect((component as any).fromDate.getFullYear()).toBe(2026);
    expect((component as any).fromDate.getMonth()).toBe(5); // June, 0-indexed
    expect((component as any).fromDate.getDate()).toBe(1);
    expect((component as any).toDate.getDate()).toBe(10);
    expect(store.refresh).toHaveBeenCalled();
  });

  it('renders cached data immediately via the summary/dailyRows getters', () => {
    const store = makeStoreStub(makeReport());
    const component = new CashOnlineReconciliationReportPageComponent(
      store as any,
      createTranslateStub()
    );

    component.ngOnInit();

    expect((component as any).summary.cash.count).toBe(3);
    expect((component as any).dailyRows.length).toBe(2);
  });

  describe('contentState', () => {
    it('is "loading" on first ever visit (no cache yet, refresh in flight)', () => {
      const store = makeStoreStub(null);
      store.refreshing$.next(true);
      store.hasValue = false;
      const component = new CashOnlineReconciliationReportPageComponent(
        store as any,
        createTranslateStub()
      );

      component.ngOnInit();

      expect((component as any).contentState).toBe('loading');
    });

    it('is "invalid" when the client-side range guard rejects (from > to)', () => {
      const store = makeStoreStub(makeReport());
      const component = new CashOnlineReconciliationReportPageComponent(
        store as any,
        createTranslateStub()
      );
      component.ngOnInit();

      component['onFromDateChange'](new Date(2026, 6, 10));
      component['onToDateChange'](new Date(2026, 6, 1));

      expect((component as any).contentState).toBe('invalid');
      expect(store.setRange).not.toHaveBeenCalled();
    });

    it('is "error" when a fetch fails with no cached value', () => {
      const store = makeStoreStub(null);
      const component = new CashOnlineReconciliationReportPageComponent(
        store as any,
        createTranslateStub()
      );
      component.ngOnInit();

      store.error$.next(true);

      expect((component as any).contentState).toBe('error');
      expect((component as any).loadError).toBe('ADMIN.CASH_ONLINE_RECONCILIATION.LOAD_FAILED');
    });

    it('keeps loadError empty (contentState not "error") when a background revalidate fails but cached data remains', () => {
      const store = makeStoreStub(makeReport());
      store.hasValue = true;
      const component = new CashOnlineReconciliationReportPageComponent(
        store as any,
        createTranslateStub()
      );
      component.ngOnInit();

      store.error$.next(true);

      expect((component as any).loadError).toBe('');
      expect((component as any).contentState).toBe('data');
    });

    it('is "empty" when all three buckets have count 0', () => {
      const store = makeStoreStub(
        makeReport({
          summary: {
            cash: { count: 0, collected: '0.00', refunded: '0.00', net: '0.00' },
            online: { count: 0, collected: '0.00', refunded: '0.00', net: '0.00' },
            other: { count: 0, collected: '0.00', refunded: '0.00', net: '0.00' },
            totalCollected: '0.00',
            currency: 'THB',
          },
          daily: [],
        })
      );
      const component = new CashOnlineReconciliationReportPageComponent(
        store as any,
        createTranslateStub()
      );
      component.ngOnInit();

      expect((component as any).contentState).toBe('empty');
    });

    it('is "data" when at least one bucket has a nonzero count', () => {
      const store = makeStoreStub(makeReport());
      const component = new CashOnlineReconciliationReportPageComponent(
        store as any,
        createTranslateStub()
      );
      component.ngOnInit();

      expect((component as any).contentState).toBe('data');
    });
  });

  describe('applyRange (client guard)', () => {
    it('dispatches store.setRange with yyyy-MM-dd strings for a valid range', () => {
      const store = makeStoreStub(makeReport());
      const component = new CashOnlineReconciliationReportPageComponent(
        store as any,
        createTranslateStub()
      );
      component.ngOnInit();

      component['onFromDateChange'](new Date(2026, 5, 1));
      component['onToDateChange'](new Date(2026, 5, 10));

      expect(store.setRange).toHaveBeenCalledWith('2026-06-01', '2026-06-10');
      expect((component as any).rangeError).toBe('');
    });

    it('sets rangeError and does not dispatch when from > to', () => {
      const store = makeStoreStub(makeReport());
      const component = new CashOnlineReconciliationReportPageComponent(
        store as any,
        createTranslateStub()
      );
      component.ngOnInit();

      // Set `to` FIRST (to a date before the default fromDate seeded by ngOnInit), so
      // every intermediate state stays invalid — reversing this order would let the
      // first change alone form a momentarily-valid range and legitimately dispatch
      // setRange before the second change made it invalid.
      component['onToDateChange'](new Date(2026, 5, 1));
      component['onFromDateChange'](new Date(2026, 5, 10));

      expect(store.setRange).not.toHaveBeenCalled();
      expect((component as any).rangeError).toBe(
        'ADMIN.CASH_ONLINE_RECONCILIATION.ERROR.RANGE_INVALID'
      );
    });

    it('sets rangeError and does not dispatch when the span exceeds 366 days', () => {
      const store = makeStoreStub(makeReport());
      const component = new CashOnlineReconciliationReportPageComponent(
        store as any,
        createTranslateStub()
      );
      component.ngOnInit();

      component['onFromDateChange'](new Date(2025, 0, 1));
      component['onToDateChange'](new Date(2026, 6, 1));

      expect(store.setRange).not.toHaveBeenCalled();
      expect((component as any).rangeError).toBe(
        'ADMIN.CASH_ONLINE_RECONCILIATION.ERROR.RANGE_TOO_LARGE'
      );
    });

    it('does not dispatch when either date is cleared', () => {
      const store = makeStoreStub(makeReport());
      const component = new CashOnlineReconciliationReportPageComponent(
        store as any,
        createTranslateStub()
      );
      component.ngOnInit();

      component['onFromDateChange'](null);

      expect(store.setRange).not.toHaveBeenCalled();
    });
  });

  describe('expand toggle', () => {
    it('toggles a row in and out of expandedRows, keyed by date', () => {
      const store = makeStoreStub(makeReport());
      const component = new CashOnlineReconciliationReportPageComponent(
        store as any,
        createTranslateStub()
      );
      component.ngOnInit();
      const row = (component as any).dailyRows[0];

      expect((component as any).isExpanded(row)).toBeFalse();
      (component as any).toggleExpand(row);
      expect((component as any).isExpanded(row)).toBeTrue();
      (component as any).toggleExpand(row);
      expect((component as any).isExpanded(row)).toBeFalse();
    });

    it('clears expandedRows when the daily array identity changes (new fetch)', () => {
      const store = makeStoreStub(makeReport());
      const component = new CashOnlineReconciliationReportPageComponent(
        store as any,
        createTranslateStub()
      );
      component.ngOnInit();
      const row = (component as any).dailyRows[0];
      (component as any).toggleExpand(row);
      expect((component as any).isExpanded(row)).toBeTrue();

      // Simulate setRange() resolving with a fresh report (new array reference, same shape).
      store.data$.next(makeReport());

      expect((component as any).isExpanded((component as any).dailyRows[0])).toBeFalse();
    });
  });

  it('formatMoney formats a decimal string as localized currency', () => {
    const store = makeStoreStub(makeReport());
    const component = new CashOnlineReconciliationReportPageComponent(
      store as any,
      createTranslateStub()
    );
    component.ngOnInit();

    expect((component as any).formatMoney('900.00', 'THB')).toContain('900');
  });

  it('formatMoney falls back to 0 for a non-numeric string', () => {
    const store = makeStoreStub(makeReport());
    const component = new CashOnlineReconciliationReportPageComponent(
      store as any,
      createTranslateStub()
    );
    component.ngOnInit();

    expect((component as any).formatMoney('not-a-number')).toBe('THB 0');
  });

  it('unsubscribes on destroy', () => {
    const store = makeStoreStub(makeReport());
    const component = new CashOnlineReconciliationReportPageComponent(
      store as any,
      createTranslateStub()
    );
    component.ngOnInit();

    component.ngOnDestroy();

    store.data$.next(
      makeReport({
        summary: {
          cash: { count: 999, collected: '1.00', refunded: '0.00', net: '1.00' },
          online: { count: 0, collected: '0.00', refunded: '0.00', net: '0.00' },
          other: { count: 0, collected: '0.00', refunded: '0.00', net: '0.00' },
          totalCollected: '1.00',
          currency: 'THB',
        },
      })
    );
    expect((component as any).summary.cash.count).not.toBe(999);
  });
});

// Regression coverage for the same detached-`this` trackBy bug fixed for
// EodSalesReportPageComponent/RefundVoidReportPageComponent (OBRS-231/OBRS-98):
// NgForOf's DefaultIterableDiffer stores and invokes `trackBy` DETACHED from the
// component instance. Every spec above constructs the component directly and calls
// its methods with `this` correctly bound, so none of them exercise the actual
// template-driven trackBy invocation path — this block renders the real template via
// TestBed + fixture.detectChanges() and asserts the DOM row count, which fails with a
// TypeError and 0 rendered rows against a bare (non-arrow-function) `trackByRow` method.
describe('CashOnlineReconciliationReportPageComponent (template rendering)', () => {
  let fixture: ComponentFixture<CashOnlineReconciliationReportPageComponent>;
  let dataSubject: BehaviorSubject<CashOnlineReconciliationReportDto | null>;
  let storeStub: {
    data$: BehaviorSubject<CashOnlineReconciliationReportDto | null>;
    refreshing$: BehaviorSubject<boolean>;
    error$: BehaviorSubject<boolean>;
    range: { from: string; to: string };
    hasValue: boolean;
    refresh: jasmine.Spy;
    setRange: jasmine.Spy;
  };

  beforeEach(async () => {
    dataSubject = new BehaviorSubject<CashOnlineReconciliationReportDto | null>(null);
    storeStub = {
      data$: dataSubject,
      refreshing$: new BehaviorSubject<boolean>(false),
      error$: new BehaviorSubject<boolean>(false),
      range: { from: '2026-07-01', to: '2026-07-07' },
      hasValue: false,
      refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
      setRange: jasmine.createSpy('setRange'),
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), DatePickerModule, AdminSharedModule],
      declarations: [CashOnlineReconciliationReportPageComponent],
      providers: [{ provide: CashOnlineReconciliationReportStore, useValue: storeStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(CashOnlineReconciliationReportPageComponent);
  });

  it('renders one table row per daily entry via the real template (trackBy stays bound to the component)', () => {
    const report = makeReport(); // 2 daily rows
    storeStub.hasValue = true;
    dataSubject.next(report);

    expect(() => fixture.detectChanges()).not.toThrow();

    const dataRows: NodeListOf<HTMLTableRowElement> = fixture.nativeElement.querySelectorAll(
      'tbody tr:not(.cor-detail-row)'
    );
    expect(dataRows.length).toBe(report.daily.length);
  });

  it('renders the basis and partition notes unconditionally, even before data arrives', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.cor-basis-note')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.cor-partition-note')).not.toBeNull();
  });

  it('renders the Total Collected figure once data arrives', () => {
    const report = makeReport();
    storeStub.hasValue = true;
    dataSubject.next(report);

    fixture.detectChanges();

    const figure = fixture.nativeElement.querySelector('.cor-total-figure');
    expect(figure).not.toBeNull();
    expect(figure.textContent).toContain('2,600');
  });
});
