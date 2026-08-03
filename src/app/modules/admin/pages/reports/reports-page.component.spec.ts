import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { MenuModule } from 'primeng/menu';
import { ReportsPageComponent } from './reports-page.component';
import { ReportsStore } from './reports.store';
import { ReportsSummaryDto } from '../../../../shared/interfaces/reports-summary.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminSharedModule } from '../../admin-shared.module';
import { ExportButtonComponent } from '../../../../shared/components/export-button/export-button.component';
import { AuthService } from '../../../../auth/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ExportService } from '../../../../services/export/export.service';
import { ParcelShareMonthlyStore } from './parcel-share-monthly.store';

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

// OBRS-960 — ReportsPageComponent now also injects ParcelShareMonthlyStore
// (the new parcel-share monthly section below the daily table). This
// minimal stub satisfies the constructor for every pre-existing test below,
// none of which exercise the new section.
const parcelShareMonthlyStoreStub = {
  data$: new BehaviorSubject<unknown>(null),
  refreshing$: new BehaviorSubject<boolean>(false),
  period: { year: 2026, month: 1 },
  refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
  setPeriod: jasmine.createSpy('setPeriod'),
};

describe('ReportsPageComponent', () => {
  it('should create', () => {
    const store = makeStoreStub(null);
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
    expect(component).toBeTruthy();
  });

  it('seeds the two date pickers from the store range on init', () => {
    const store = makeStoreStub(null, { from: '2026-06-01', to: '2026-06-07' });
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());

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
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).isLoading).toBeTrue();
  });

  it('renders cached data immediately via the tiles/dailyRows getters', () => {
    const store = makeStoreStub(makeSummary());
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).tiles.bookingCount).toBe(20);
    expect((component as any).dailyRows.length).toBe(1);
  });

  // The Revenue tile/column render off the PRESENCE of tiles.revenue, never a
  // client-side role check — forward-compatible with OBRS-129.
  it('showRevenue reflects the presence of tiles.revenue, not a role check', () => {
    const withRevenue = makeStoreStub(makeSummary());
    const componentWith = new ReportsPageComponent(withRevenue as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
    componentWith.ngOnInit();
    expect((componentWith as any).showRevenue).toBeTrue();

    const summaryNoRevenue = makeSummary();
    delete (summaryNoRevenue.tiles as any).revenue;
    const withoutRevenue = makeStoreStub(summaryNoRevenue);
    const componentWithout = new ReportsPageComponent(withoutRevenue as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
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
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).isEmptyRange).toBeTrue();
  });

  it('does NOT flag a range with departure-date occupancy but zero bookings as empty', () => {
    // Occupancy keys on departure-date; a range can have real occupancy while
    // bookingCount/ticketsSold (booking-date basis) are 0 — that is NOT empty.
    const store = makeStoreStub(
      makeSummary({
        tiles: { bookingCount: 0, ticketsSold: 0, occupancyRatePct: 21.4 },
        daily: [
          { date: '2026-07-17', bookingCount: 0, ticketsSold: 0, occupancyRatePct: 21.4, seatsSold: 3, seatCapacity: 14 },
        ],
      })
    );
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).isEmptyRange).toBeFalse();
  });

  // contentState drives the body so a message never renders beside a stale/zero
  // table. Priority: invalid > loading > error > empty > data.
  it('contentState is "data" for a non-zero summary', () => {
    const store = makeStoreStub(makeSummary());
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
    component.ngOnInit();
    expect((component as any).contentState).toBe('data');
  });

  it('contentState is "empty" for a valid all-zero range (tiles stay, table is replaced)', () => {
    const store = makeStoreStub(
      makeSummary({
        tiles: { bookingCount: 0, ticketsSold: 0, occupancyRatePct: 0 },
        daily: [{ date: '2026-07-01', bookingCount: 0, ticketsSold: 0, occupancyRatePct: 0, seatsSold: 0, seatCapacity: 12 }],
      })
    );
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
    component.ngOnInit();
    expect((component as any).contentState).toBe('empty');
  });

  it('contentState is "invalid" (over cached data) when the range guard trips', () => {
    const store = makeStoreStub(makeSummary());
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
    component.ngOnInit();

    component['onFromDateChange'](new Date(2026, 6, 10));
    component['onToDateChange'](new Date(2026, 6, 1));

    expect((component as any).contentState).toBe('invalid');
  });

  it('contentState is "error" when a fetch fails with no cached value', () => {
    const store = makeStoreStub(null);
    store.lastErrorCode = 'SOMETHING_ELSE';
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).contentState).toBe('error');
  });

  // Client guard: from > to must show the inline warning and must NOT dispatch.
  it('shows RANGE_INVALID and does not call store.setRange when from > to', () => {
    const store = makeStoreStub(makeSummary());
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
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
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
    component.ngOnInit();

    component['onFromDateChange'](new Date(2020, 0, 1));
    component['onToDateChange'](new Date(2026, 0, 1));

    expect((component as any).rangeError).toBe('ADMIN.REPORTS.ERROR.RANGE_TOO_LARGE');
    expect(store.setRange).not.toHaveBeenCalled();
  });

  it('dispatches store.setRange with yyyy-MM-dd strings for a valid range', () => {
    const store = makeStoreStub(makeSummary());
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
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
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).loadError).toBe('ADMIN.REPORTS.ERROR.RANGE_TOO_LARGE');
  });

  it('falls back to the generic LOAD_FAILED message for an unrecognized errorCode', () => {
    const store = makeStoreStub(null);
    store.lastErrorCode = 'SOMETHING_ELSE';
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).loadError).toBe('ADMIN.REPORTS.LOAD_FAILED');
  });

  it('keeps loadError empty when a background revalidate fails but cached data remains (hasValue true)', () => {
    const store = makeStoreStub(makeSummary());
    store.hasValue = true;
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
    component.ngOnInit();

    store.error$.next(true);

    expect((component as any).loadError).toBe('');
  });

  it('unsubscribes on destroy', () => {
    const store = makeStoreStub(makeSummary());
    const component = new ReportsPageComponent(store as any, parcelShareMonthlyStoreStub as any, createTranslateStub());
    component.ngOnInit();

    component.ngOnDestroy();

    store.data$.next(makeSummary({ tiles: { bookingCount: 999, ticketsSold: 1, occupancyRatePct: 1 } }));
    expect((component as any).tiles.bookingCount).not.toBe(999);
  });
});

// OBRS-442: proves the export button is wired to the STORE's `range` getter (wire-format
// yyyy-MM-dd strings the displayed data was actually fetched with), never the component's
// `Date` fields — applyRange() deliberately skips dispatch on an invalid range, so the two
// can diverge. Renders the real ExportButtonComponent (not NO_ERRORS_SCHEMA) so role-gated
// show/hide is proven end to end, not assumed.
describe('ReportsPageComponent (export button, OBRS-442)', () => {
  let fixture: ComponentFixture<ReportsPageComponent>;
  let storeStub: {
    data$: BehaviorSubject<ReportsSummaryDto | null>;
    refreshing$: BehaviorSubject<boolean>;
    error$: BehaviorSubject<boolean>;
    range: { from: string; to: string };
    lastErrorCode: string | null;
    hasValue: boolean;
    refresh: jasmine.Spy;
    setRange: jasmine.Spy;
  };
  let authServiceSpy: jasmine.SpyObj<AuthService>;

  function configure(hasRole: boolean): void {
    storeStub = {
      data$: new BehaviorSubject<ReportsSummaryDto | null>(null),
      refreshing$: new BehaviorSubject<boolean>(false),
      error$: new BehaviorSubject<boolean>(false),
      range: { from: '2026-07-01', to: '2026-07-07' },
      lastErrorCode: null,
      hasValue: false,
      refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
      setRange: jasmine.createSpy('setRange'),
    };
    authServiceSpy = jasmine.createSpyObj('AuthService', ['hasAnyRole']);
    authServiceSpy.hasAnyRole.and.returnValue(hasRole);

    TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), DatePickerModule, MenuModule, AdminSharedModule],
      declarations: [ReportsPageComponent, ExportButtonComponent],
      providers: [
        { provide: ReportsStore, useValue: storeStub },
        // OBRS-960: ReportsPageComponent now also injects ParcelShareMonthlyStore
        // (the new parcel-share monthly section) — override it too, same as
        // ReportsStore above, so DI doesn't construct a REAL store needing a
        // real AuthService/AdminApiService.
        { provide: ParcelShareMonthlyStore, useValue: parcelShareMonthlyStoreStub },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: AlertService, useValue: jasmine.createSpyObj('AlertService', ['error']) },
        { provide: ExportService, useValue: jasmine.createSpyObj('ExportService', ['export']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsPageComponent);
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

  it('has datasetKey exactly "revenue-daily"', () => {
    configure(true);
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.directive(ExportButtonComponent));
    expect((button.componentInstance as ExportButtonComponent).datasetKey).toBe('revenue-daily');
  });

  // OBRS-668: a second, sibling export button for the revenue-per-vehicle
  // dataset — same requiredRole="owner" and store.range-derived params as
  // the revenue-daily button above, matched deliberately rather than a new
  // scheme.
  it('renders a second export button for datasetKey "revenue-per-vehicle" with the same role and params', () => {
    configure(true);
    fixture.detectChanges();

    const buttons = fixture.debugElement.queryAll(By.directive(ExportButtonComponent));
    expect(buttons.length).toBe(2);

    const perVehicleButton = buttons[1].componentInstance as ExportButtonComponent;
    expect(perVehicleButton.datasetKey).toBe('revenue-per-vehicle');
    expect(perVehicleButton.requiredRole).toBe('owner');
    expect(perVehicleButton.params).toEqual({ from: '2026-07-01', to: '2026-07-07' });
  });

  // OBRS-668 (scrutinize follow-up): both buttons pass a distinct `label` i18n
  // key so they no longer read as two identical "Export" buttons.
  it('passes distinct label keys to the two export buttons', () => {
    configure(true);
    fixture.detectChanges();

    const buttons = fixture.debugElement.queryAll(By.directive(ExportButtonComponent));
    expect((buttons[0].componentInstance as ExportButtonComponent).label).toBe(
      'ADMIN.REPORTS.EXPORT_REVENUE_DAILY'
    );
    expect((buttons[1].componentInstance as ExportButtonComponent).label).toBe(
      'ADMIN.REPORTS.EXPORT_REVENUE_PER_VEHICLE'
    );
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
