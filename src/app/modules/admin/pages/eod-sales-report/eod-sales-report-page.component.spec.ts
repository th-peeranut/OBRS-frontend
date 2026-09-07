import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { MenuModule } from 'primeng/menu';
import { EodSalesReportPageComponent } from './eod-sales-report-page.component';
import { EodSalesReportStore } from './eod-sales-report.store';
import { EodSalesReportDto } from '../../../../shared/interfaces/eod-sales-report.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminSharedModule } from '../../admin-shared.module';
import { ExportButtonComponent } from '../../../../shared/components/export-button/export-button.component';
import { PendingButtonDirective } from '../../../../shared/directives/pending-button.directive';
import { AuthService } from '../../../../auth/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ExportService } from '../../../../services/export/export.service';

function makeReport(overrides: Partial<EodSalesReportDto> = {}): EodSalesReportDto {
  return {
    date: '2026-07-11',
    timezone: 'Asia/Bangkok',
    salespersons: [
      {
        salespersonId: 42,
        salespersonName: 'Somchai Jai',
        salesPointId: 7,
        salesPointLabel: 'bkk_hub',
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
        salesPointId: null,
        salesPointLabel: null,
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

    expect((component as any).formatMoney('not-a-number')).toBe('THB 0');
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

    // OBRS-1403: the backend attributes a row to the counter the sale was taken at, so ONE
    // salesperson who worked two counters in a day comes back as two rows with the SAME
    // salespersonId. Keyed on salespersonId alone (the pre-card behaviour), expanding either row
    // expanded both, and `@for ... track` would reject the duplicate key outright (NG0955).
    it('keeps two rows of the SAME salesperson at different sales points independently expandable', () => {
      const twoCounters = makeReport();
      twoCounters.salespersons = [
        { ...twoCounters.salespersons[0], salesPointId: 7, salesPointLabel: 'ban_bueng' },
        { ...twoCounters.salespersons[0], salesPointId: 9, salesPointLabel: 'nong_chak' },
      ];
      const store = makeStoreStub(twoCounters);
      const component = new EodSalesReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();
      const first = (component as any).rows[0];
      const second = (component as any).rows[1];

      expect((component as any).trackByRow(0, first)).not
        .toEqual((component as any).trackByRow(1, second));

      (component as any).toggleExpand(first);

      expect((component as any).isExpanded(first)).toBeTrue();
      expect((component as any).isExpanded(second)).toBeFalse();
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

// Regression coverage for a real render-blocking bug: NgForOf's DefaultIterableDiffer stores
// and invokes `trackBy` DETACHED from the component instance. Every spec above constructs the
// component directly and calls its methods with `this` correctly bound, so none of them exercise
// the actual template-driven trackBy invocation path — this is the one that must render the real
// template via TestBed + fixture.detectChanges() to catch a `this === undefined` crash inside
// trackByRow/trackByMethod. Before the fix (bare `protected trackByRow(...)` methods passed as
// `trackBy: trackByRow`), this suite fails with a TypeError and 0 rendered rows even though the
// store has real salesperson rows.
describe('EodSalesReportPageComponent (template rendering)', () => {
  let fixture: ComponentFixture<EodSalesReportPageComponent>;
  let dataSubject: BehaviorSubject<EodSalesReportDto | null>;
  let storeStub: {
    data$: BehaviorSubject<EodSalesReportDto | null>;
    refreshing$: BehaviorSubject<boolean>;
    error$: BehaviorSubject<boolean>;
    date: string;
    hasValue: boolean;
    refresh: jasmine.Spy;
    setDate: jasmine.Spy;
  };

  beforeEach(async () => {
    dataSubject = new BehaviorSubject<EodSalesReportDto | null>(null);
    storeStub = {
      data$: dataSubject,
      refreshing$: new BehaviorSubject<boolean>(false),
      error$: new BehaviorSubject<boolean>(false),
      date: '2026-07-11',
      hasValue: false,
      refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
      setDate: jasmine.createSpy('setDate'),
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), DatePickerModule, MenuModule, AdminSharedModule],
      // OBRS-442: the template now also renders <app-export-button>, so it must be declared
      // (with its own DI deps stubbed) or this block 304s on the unknown element.
      declarations: [EodSalesReportPageComponent, ExportButtonComponent, PendingButtonDirective],
      providers: [
        { provide: EodSalesReportStore, useValue: storeStub },
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', { hasAnyRole: true }) },
        { provide: AlertService, useValue: jasmine.createSpyObj('AlertService', ['error']) },
        { provide: ExportService, useValue: jasmine.createSpyObj('ExportService', ['export']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EodSalesReportPageComponent);
  });

  it('renders one table row per salesperson via the real template (trackBy stays bound to the component)', () => {
    const report = makeReport(); // 2 salespersons: one numeric id, one null ("Unassigned")
    storeStub.hasValue = true;
    dataSubject.next(report);

    expect(() => fixture.detectChanges()).not.toThrow();

    const dataRows: NodeListOf<HTMLTableRowElement> = fixture.nativeElement.querySelectorAll(
      'tbody tr:not(.eod-report-detail-row):not(.eod-report-grand-total-row)'
    );
    expect(dataRows.length).toBe(report.salespersons.length);
  });

  it('renders the grand-total row alongside the salesperson rows', () => {
    const report = makeReport();
    storeStub.hasValue = true;
    dataSubject.next(report);

    fixture.detectChanges();

    const grandTotalRow = fixture.nativeElement.querySelector('tbody tr.eod-report-grand-total-row');
    expect(grandTotalRow).not.toBeNull();
  });
});

// OBRS-442: proves the export button is wired to the STORE's `date` getter (wire-format
// yyyy-MM-dd the displayed data was actually fetched with), never the component's `Date`
// field. Renders the real ExportButtonComponent (not NO_ERRORS_SCHEMA) so role-gated
// show/hide is proven end to end, not assumed.
describe('EodSalesReportPageComponent (export button, OBRS-442)', () => {
  let fixture: ComponentFixture<EodSalesReportPageComponent>;
  let storeStub: {
    data$: BehaviorSubject<EodSalesReportDto | null>;
    refreshing$: BehaviorSubject<boolean>;
    error$: BehaviorSubject<boolean>;
    date: string;
    hasValue: boolean;
    refresh: jasmine.Spy;
    setDate: jasmine.Spy;
  };
  let authServiceSpy: jasmine.SpyObj<AuthService>;

  function configure(hasRole: boolean): void {
    storeStub = {
      data$: new BehaviorSubject<EodSalesReportDto | null>(null),
      refreshing$: new BehaviorSubject<boolean>(false),
      error$: new BehaviorSubject<boolean>(false),
      date: '2026-07-11',
      hasValue: false,
      refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
      setDate: jasmine.createSpy('setDate'),
    };
    authServiceSpy = jasmine.createSpyObj('AuthService', ['hasAnyRole']);
    authServiceSpy.hasAnyRole.and.returnValue(hasRole);

    TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), DatePickerModule, MenuModule, AdminSharedModule],
      declarations: [EodSalesReportPageComponent, ExportButtonComponent, PendingButtonDirective],
      providers: [
        { provide: EodSalesReportStore, useValue: storeStub },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: AlertService, useValue: jasmine.createSpyObj('AlertService', ['error']) },
        { provide: ExportService, useValue: jasmine.createSpyObj('ExportService', ['export']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EodSalesReportPageComponent);
  }

  it('renders for an authorized (owner) role and requests the "owner" role', () => {
    configure(true);
    fixture.detectChanges();

    expect(authServiceSpy.hasAnyRole).toHaveBeenCalledWith(['owner']);
    // Assert the TRIGGER, not By.directive(ExportButtonComponent): the host tag renders
    // unconditionally (canExport's *ngIf is inside the child template), so a By.directive
    // assertion here passes even for an unauthorized role — vacuous. Mirrors the negative
    // spec below so the pair actually brackets the role gate.
    const trigger = fixture.nativeElement.querySelector('.export-button-trigger');
    expect(trigger).withContext('export button trigger should render for an authorized role').not.toBeNull();
  });

  it('is absent for an unauthorized role', () => {
    configure(false);
    fixture.detectChanges();

    // ExportButtonComponent's own *ngIf="canExport" is INSIDE its template (wrapping the
    // trigger button), not on the <app-export-button> host tag, so the host element always
    // renders — assert on the visible trigger, mirroring export-button.component.spec.ts.
    const trigger = fixture.nativeElement.querySelector('.export-button-trigger');
    expect(trigger).withContext('export button trigger must not render for an unauthorized role').toBeNull();
  });

  it('has datasetKey exactly "eod-salesperson"', () => {
    configure(true);
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.directive(ExportButtonComponent));
    expect((button.componentInstance as ExportButtonComponent).datasetKey).toBe('eod-salesperson');
  });

  // Load-bearing: proves [params] is bound to the STORE getter (not the component's Date
  // field) and tracks it live.
  it('[params] binds to store.date and follows it when the store date changes', () => {
    configure(true);
    fixture.detectChanges();

    let button = fixture.debugElement.query(By.directive(ExportButtonComponent));
    expect((button.componentInstance as ExportButtonComponent).params).toEqual({ date: '2026-07-11' });

    storeStub.date = '2026-08-20';
    fixture.detectChanges();

    button = fixture.debugElement.query(By.directive(ExportButtonComponent));
    expect((button.componentInstance as ExportButtonComponent).params).toEqual({ date: '2026-08-20' });
  });
});
