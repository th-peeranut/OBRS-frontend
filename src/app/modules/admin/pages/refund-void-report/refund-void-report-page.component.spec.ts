import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { CalendarModule } from 'primeng/calendar';
import { MenuModule } from 'primeng/menu';
import { RefundVoidReportPageComponent } from './refund-void-report-page.component';
import { RefundVoidReportStore } from './refund-void-report.store';
import { RefundVoidReportDto } from '../../../../shared/interfaces/refund-void-report.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminSharedModule } from '../../admin-shared.module';
import { ExportButtonComponent } from '../../../../shared/components/export-button/export-button.component';
import { AuthService } from '../../../../auth/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ExportService } from '../../../../services/export/export.service';

function makeReport(overrides: Partial<RefundVoidReportDto> = {}): RefundVoidReportDto {
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
    daily: [
      {
        date: '2026-07-01',
        refunded: { count: 2, amount: '600.00' },
        manualRefundPending: { count: 1, amount: '300.00' },
        voided: {
          count: 2,
          amount: '600.00',
          cancelled: { count: 1, amount: '300.00' },
          expired: { count: 1, amount: '300.00' },
        },
      },
      {
        date: '2026-07-02',
        refunded: { count: 1, amount: '300.00' },
        manualRefundPending: { count: 0, amount: '0.00' },
        voided: {
          count: 2,
          amount: '600.00',
          cancelled: { count: 1, amount: '300.00' },
          expired: { count: 1, amount: '300.00' },
        },
      },
    ],
    ...overrides,
  };
}

function makeStoreStub(
  data: RefundVoidReportDto | null,
  range = { from: '2026-07-01', to: '2026-07-07' }
) {
  const data$ = new BehaviorSubject<RefundVoidReportDto | null>(data);
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

describe('RefundVoidReportPageComponent', () => {
  it('should create', () => {
    const store = makeStoreStub(null);
    const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
    expect(component).toBeTruthy();
  });

  it('seeds the date pickers from the store range on init', () => {
    const store = makeStoreStub(null, { from: '2026-06-01', to: '2026-06-10' });
    const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).fromDate.getFullYear()).toBe(2026);
    expect((component as any).fromDate.getMonth()).toBe(5); // June, 0-indexed
    expect((component as any).fromDate.getDate()).toBe(1);
    expect((component as any).toDate.getDate()).toBe(10);
    expect(store.refresh).toHaveBeenCalled();
  });

  it('renders cached data immediately via the summary/dailyRows getters', () => {
    const store = makeStoreStub(makeReport());
    const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).summary.refunded.count).toBe(3);
    expect((component as any).dailyRows.length).toBe(2);
  });

  describe('contentState', () => {
    it('is "loading" on first ever visit (no cache yet, refresh in flight)', () => {
      const store = makeStoreStub(null);
      store.refreshing$.next(true);
      store.hasValue = false;
      const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());

      component.ngOnInit();

      expect((component as any).contentState).toBe('loading');
    });

    it('is "invalid" when the client-side range guard rejects (from > to)', () => {
      const store = makeStoreStub(makeReport());
      const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      component['onFromDateChange'](new Date(2026, 6, 10));
      component['onToDateChange'](new Date(2026, 6, 1));

      expect((component as any).contentState).toBe('invalid');
      expect(store.setRange).not.toHaveBeenCalled();
    });

    it('is "error" when a fetch fails with no cached value', () => {
      const store = makeStoreStub(null);
      const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      store.error$.next(true);

      expect((component as any).contentState).toBe('error');
      expect((component as any).loadError).toBe('ADMIN.REFUND_VOID_REPORT.LOAD_FAILED');
    });

    it('keeps loadError empty (contentState not "error") when a background revalidate fails but cached data remains', () => {
      const store = makeStoreStub(makeReport());
      store.hasValue = true;
      const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      store.error$.next(true);

      expect((component as any).loadError).toBe('');
      expect((component as any).contentState).toBe('data');
    });

    it('is "empty" when all three partitions have count 0', () => {
      const store = makeStoreStub(
        makeReport({
          summary: {
            refunded: { count: 0, amount: '0.00' },
            manualRefundPending: { count: 0, amount: '0.00' },
            voided: {
              count: 0,
              amount: '0.00',
              cancelled: { count: 0, amount: '0.00' },
              expired: { count: 0, amount: '0.00' },
            },
            currency: 'THB',
          },
          daily: [],
        })
      );
      const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      expect((component as any).contentState).toBe('empty');
    });

    it('is "data" when at least one partition has a nonzero count', () => {
      const store = makeStoreStub(makeReport());
      const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      expect((component as any).contentState).toBe('data');
    });
  });

  describe('applyRange (client guard)', () => {
    it('dispatches store.setRange with yyyy-MM-dd strings for a valid range', () => {
      const store = makeStoreStub(makeReport());
      const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      component['onFromDateChange'](new Date(2026, 5, 1));
      component['onToDateChange'](new Date(2026, 5, 10));

      expect(store.setRange).toHaveBeenCalledWith('2026-06-01', '2026-06-10');
      expect((component as any).rangeError).toBe('');
    });

    it('sets rangeError and does not dispatch when from > to', () => {
      const store = makeStoreStub(makeReport());
      const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      // Set `to` FIRST (to a date before the default fromDate seeded by ngOnInit), so
      // every intermediate state stays invalid — reversing this order would let the
      // first change alone form a momentarily-valid range and legitimately dispatch
      // setRange before the second change made it invalid.
      component['onToDateChange'](new Date(2026, 5, 1));
      component['onFromDateChange'](new Date(2026, 5, 10));

      expect(store.setRange).not.toHaveBeenCalled();
      expect((component as any).rangeError).toBe('ADMIN.REFUND_VOID_REPORT.ERROR.RANGE_INVALID');
    });

    it('sets rangeError and does not dispatch when the span exceeds 366 days', () => {
      const store = makeStoreStub(makeReport());
      const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      component['onFromDateChange'](new Date(2025, 0, 1));
      component['onToDateChange'](new Date(2026, 6, 1));

      expect(store.setRange).not.toHaveBeenCalled();
      expect((component as any).rangeError).toBe(
        'ADMIN.REFUND_VOID_REPORT.ERROR.RANGE_TOO_LARGE'
      );
    });

    it('does not dispatch when either date is cleared', () => {
      const store = makeStoreStub(makeReport());
      const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
      component.ngOnInit();

      component['onFromDateChange'](null);

      expect(store.setRange).not.toHaveBeenCalled();
    });
  });

  describe('expand toggle', () => {
    it('toggles a row in and out of expandedRows, keyed by date', () => {
      const store = makeStoreStub(makeReport());
      const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
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
      const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
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
    const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    expect((component as any).formatMoney('900.00', 'THB')).toContain('900');
  });

  it('formatMoney falls back to 0 for a non-numeric string', () => {
    const store = makeStoreStub(makeReport());
    const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    expect((component as any).formatMoney('not-a-number', 'THB')).toContain('0.00');
  });

  it('unsubscribes on destroy', () => {
    const store = makeStoreStub(makeReport());
    const component = new RefundVoidReportPageComponent(store as any, createTranslateStub());
    component.ngOnInit();

    component.ngOnDestroy();

    store.data$.next(
      makeReport({
        summary: {
          refunded: { count: 999, amount: '1.00' },
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
    );
    expect((component as any).summary.refunded.count).not.toBe(999);
  });
});

// Regression coverage for the same detached-`this` trackBy bug fixed for
// EodSalesReportPageComponent (OBRS-231): NgForOf's DefaultIterableDiffer stores and
// invokes `trackBy` DETACHED from the component instance. Every spec above constructs
// the component directly and calls its methods with `this` correctly bound, so none of
// them exercise the actual template-driven trackBy invocation path — this block renders
// the real template via TestBed + fixture.detectChanges() and asserts the DOM row count,
// which fails with a TypeError and 0 rendered rows against a bare (non-arrow-function)
// `trackByRow` method.
describe('RefundVoidReportPageComponent (template rendering)', () => {
  let fixture: ComponentFixture<RefundVoidReportPageComponent>;
  let dataSubject: BehaviorSubject<RefundVoidReportDto | null>;
  let storeStub: {
    data$: BehaviorSubject<RefundVoidReportDto | null>;
    refreshing$: BehaviorSubject<boolean>;
    error$: BehaviorSubject<boolean>;
    range: { from: string; to: string };
    hasValue: boolean;
    refresh: jasmine.Spy;
    setRange: jasmine.Spy;
  };

  beforeEach(async () => {
    dataSubject = new BehaviorSubject<RefundVoidReportDto | null>(null);
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
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), CalendarModule, MenuModule, AdminSharedModule],
      // OBRS-442: the template now also renders <app-export-button>, so it must be declared
      // (with its own DI deps stubbed) or this block 304s on the unknown element.
      declarations: [RefundVoidReportPageComponent, ExportButtonComponent],
      providers: [
        { provide: RefundVoidReportStore, useValue: storeStub },
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', { hasAnyRole: true }) },
        { provide: AlertService, useValue: jasmine.createSpyObj('AlertService', ['error']) },
        { provide: ExportService, useValue: jasmine.createSpyObj('ExportService', ['export']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RefundVoidReportPageComponent);
  });

  it('renders one table row per daily entry via the real template (trackBy stays bound to the component)', () => {
    const report = makeReport(); // 2 daily rows
    storeStub.hasValue = true;
    dataSubject.next(report);

    expect(() => fixture.detectChanges()).not.toThrow();

    const dataRows: NodeListOf<HTMLTableRowElement> = fixture.nativeElement.querySelectorAll(
      'tbody tr:not(.refund-void-detail-row)'
    );
    expect(dataRows.length).toBe(report.daily.length);
  });

  it('renders the basis and partition notes unconditionally, even before data arrives', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.refund-void-basis-note')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.refund-void-partition-note')).not.toBeNull();
  });

  it('renders no grand-total figure anywhere on the page', () => {
    const report = makeReport();
    storeStub.hasValue = true;
    dataSubject.next(report);

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('GRAND_TOTAL');
    expect(fixture.nativeElement.querySelector('.refund-void-grand-total-row')).toBeNull();
  });
});

// OBRS-442: proves the export button is wired to the STORE's `range` getter (wire-format
// yyyy-MM-dd strings the displayed data was actually fetched with), never the component's
// `Date` fields — applyRange() deliberately skips dispatch on an invalid range, so the two
// can diverge. Renders the real ExportButtonComponent (not NO_ERRORS_SCHEMA) so role-gated
// show/hide is proven end to end, not assumed.
describe('RefundVoidReportPageComponent (export button, OBRS-442)', () => {
  let fixture: ComponentFixture<RefundVoidReportPageComponent>;
  let storeStub: {
    data$: BehaviorSubject<RefundVoidReportDto | null>;
    refreshing$: BehaviorSubject<boolean>;
    error$: BehaviorSubject<boolean>;
    range: { from: string; to: string };
    hasValue: boolean;
    refresh: jasmine.Spy;
    setRange: jasmine.Spy;
  };
  let authServiceSpy: jasmine.SpyObj<AuthService>;

  function configure(hasRole: boolean): void {
    storeStub = {
      data$: new BehaviorSubject<RefundVoidReportDto | null>(null),
      refreshing$: new BehaviorSubject<boolean>(false),
      error$: new BehaviorSubject<boolean>(false),
      range: { from: '2026-07-01', to: '2026-07-07' },
      hasValue: false,
      refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
      setRange: jasmine.createSpy('setRange'),
    };
    authServiceSpy = jasmine.createSpyObj('AuthService', ['hasAnyRole']);
    authServiceSpy.hasAnyRole.and.returnValue(hasRole);

    TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), CalendarModule, MenuModule, AdminSharedModule],
      declarations: [RefundVoidReportPageComponent, ExportButtonComponent],
      providers: [
        { provide: RefundVoidReportStore, useValue: storeStub },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: AlertService, useValue: jasmine.createSpyObj('AlertService', ['error']) },
        { provide: ExportService, useValue: jasmine.createSpyObj('ExportService', ['export']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RefundVoidReportPageComponent);
  }

  it('renders for an authorized (owner) role and requests the "owner" role', () => {
    configure(true);
    fixture.detectChanges();

    expect(authServiceSpy.hasAnyRole).toHaveBeenCalledWith(['owner']);
    const button = fixture.debugElement.query(By.directive(ExportButtonComponent));
    expect(button).withContext('export button should render for an authorized role').not.toBeNull();
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

  it('has datasetKey exactly "refund-void"', () => {
    configure(true);
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.directive(ExportButtonComponent));
    expect((button.componentInstance as ExportButtonComponent).datasetKey).toBe('refund-void');
  });

  // Load-bearing: proves [params] is bound to the STORE getter (not the component's Date
  // fields) and tracks it live — a test only checking the initial default range would pass
  // even if bound to the wrong source.
  it('[params] binds to store.range and follows it when the store range changes', () => {
    configure(true);
    fixture.detectChanges();

    let button = fixture.debugElement.query(By.directive(ExportButtonComponent));
    expect((button.componentInstance as ExportButtonComponent).params).toEqual({
      from: '2026-07-01',
      to: '2026-07-07',
    });

    storeStub.range = { from: '2026-08-15', to: '2026-08-20' };
    fixture.detectChanges();

    button = fixture.debugElement.query(By.directive(ExportButtonComponent));
    expect((button.componentInstance as ExportButtonComponent).params).toEqual({
      from: '2026-08-15',
      to: '2026-08-20',
    });
  });
});
