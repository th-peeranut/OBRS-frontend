import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { MenuModule } from 'primeng/menu';
import { VehiclePlReportPageComponent } from './vehicle-pl-report-page.component';
import { VehiclePlReportStore } from './vehicle-pl-report.store';
import {
  VehiclePlReportDto,
  VehiclePlRowDto,
} from '../../../../shared/interfaces/vehicle-pl-report.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminSharedModule } from '../../admin-shared.module';
import { ExportButtonComponent } from '../../../../shared/components/export-button/export-button.component';
import { AuthService } from '../../../../auth/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ExportService } from '../../../../services/export/export.service';

function vehicleRow(overrides: Partial<VehiclePlRowDto> = {}): VehiclePlRowDto {
  return {
    kind: 'VEHICLE',
    vehicleId: 1,
    numberPlate: '16-9310',
    header: '16-9310',
    status: 'active',
    inServiceFrom: '2025-01-01',
    inServiceTo: null,
    coverage: 'IN_SERVICE',
    revenue: '5000.00',
    historicalRevenue: '0.00',
    historicalRevenueConflictCount: 0,
    ranInPeriod: true,
    expensesByCategory: [
      { category: 'FUEL', amount: '1200.00', vatAmount: '84.00', entryCount: 3 },
    ],
    expenseTotal: '1200.00',
    vatTotal: '84.00',
    expenseEntryCount: 3,
    margin: '3800.00',
    ...overrides,
  };
}

function makeReport(overrides: Partial<VehiclePlReportDto> = {}): VehiclePlReportDto {
  return {
    from: '2026-08-01',
    to: '2026-08-22',
    vatIncludedInAmounts: true,
    rows: [
      vehicleRow(),
      vehicleRow({
        vehicleId: 2,
        numberPlate: '16-8747',
        header: '16-8747',
        // The two zeros this screen exists to tell apart: never ran, and no cost entered.
        coverage: 'SERVICE_WINDOW_UNKNOWN',
        inServiceFrom: null,
        revenue: '0.00',
        ranInPeriod: false,
        expensesByCategory: [],
        expenseTotal: '0.00',
        vatTotal: '0.00',
        expenseEntryCount: 0,
        margin: '0.00',
      }),
      {
        kind: 'UNASSIGNED_REVENUE',
        vehicleId: null,
        numberPlate: null,
        header: null,
        status: null,
        inServiceFrom: null,
        inServiceTo: null,
        coverage: null,
        revenue: '700.00',
        historicalRevenue: '0.00',
        historicalRevenueConflictCount: 0,
        ranInPeriod: true,
        expensesByCategory: [],
        expenseTotal: '0.00',
        vatTotal: '0.00',
        expenseEntryCount: 0,
        margin: '700.00',
      },
      {
        kind: 'CENTRAL_EXPENSE',
        vehicleId: null,
        numberPlate: null,
        header: null,
        status: null,
        inServiceFrom: null,
        inServiceTo: null,
        coverage: null,
        revenue: '0.00',
        historicalRevenue: '0.00',
        historicalRevenueConflictCount: 0,
        ranInPeriod: false,
        expensesByCategory: [
          { category: 'CENTRAL', amount: '500.00', vatAmount: '35.00', entryCount: 1 },
        ],
        expenseTotal: '500.00',
        vatTotal: '35.00',
        expenseEntryCount: 1,
        margin: '-500.00',
      },
    ],
    totals: {
      revenue: '5700.00',
      expenses: '1700.00',
      vat: '119.00',
      margin: '4000.00',
      currency: 'THB',
      pendingExpenses: '250.00',
    },
    ...overrides,
  };
}

/** `Intl.NumberFormat` separates the currency code from the amount with a NON-BREAKING
 * space (U+00A0), so a plain 'THB 700.00' never matches the rendered text. */
function visibleText(element: { textContent: string | null }): string {
  return (element.textContent ?? '').replace(/ /g, ' ');
}

function makeStoreStub(
  data: VehiclePlReportDto | null,
  range = { from: '2026-08-01', to: '2026-08-22' }
) {
  return {
    data$: new BehaviorSubject<VehiclePlReportDto | null>(data),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    range,
    hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setRange: jasmine.createSpy('setRange'),
  };
}

describe('VehiclePlReportPageComponent', () => {
  it('seeds the date pickers from the store range on init', () => {
    const store = makeStoreStub(null, { from: '2026-06-01', to: '2026-06-30' });
    const component = new VehiclePlReportPageComponent(store as any, createTranslateStub());

    component.ngOnInit();

    expect((component as any).fromDate.getFullYear()).toBe(2026);
    expect((component as any).fromDate.getMonth()).toBe(5); // June, 0-indexed
    expect((component as any).fromDate.getDate()).toBe(1);
    expect((component as any).toDate.getDate()).toBe(30);
    expect(store.refresh).toHaveBeenCalled();
  });

  // The split the whole screen rests on: the fleet table shows vehicles only, and the two
  // vehicle-less lines are found by `kind`, never by position in the array.
  it('splits the rows into the fleet table and the two vehicle-less lines', () => {
    const component = new VehiclePlReportPageComponent(
      makeStoreStub(makeReport()) as any,
      createTranslateStub()
    );

    component.ngOnInit();

    expect((component as any).vehicleRows.length).toBe(2);
    expect((component as any).unassignedRevenueRow.revenue).toBe('700.00');
    expect((component as any).centralExpenseRow.expenseTotal).toBe('500.00');
  });

  describe('the reason behind a zero', () => {
    it('separates "ran and took nothing" from "never ran"', () => {
      const component = new VehiclePlReportPageComponent(
        makeStoreStub(null) as any,
        createTranslateStub()
      );

      expect(
        (component as any).zeroRevenueReasonKey(vehicleRow({ revenue: '0.00', ranInPeriod: true }))
      ).toBe('ADMIN.VEHICLE_PL_REPORT.ZERO.RAN_NO_REVENUE');
      expect(
        (component as any).zeroRevenueReasonKey(vehicleRow({ revenue: '0.00', ranInPeriod: false }))
      ).toBe('ADMIN.VEHICLE_PL_REPORT.ZERO.DID_NOT_RUN');
    });

    it('separates "entered as zero" from "nobody entered anything"', () => {
      const component = new VehiclePlReportPageComponent(
        makeStoreStub(null) as any,
        createTranslateStub()
      );

      expect(
        (component as any).zeroExpenseReasonKey(
          vehicleRow({ expenseTotal: '0.00', expenseEntryCount: 2 })
        )
      ).toBe('ADMIN.VEHICLE_PL_REPORT.ZERO.ENTERED_AS_ZERO');
      expect(
        (component as any).zeroExpenseReasonKey(
          vehicleRow({ expenseTotal: '0.00', expenseEntryCount: 0 })
        )
      ).toBe('ADMIN.VEHICLE_PL_REPORT.ZERO.NO_ENTRIES');
    });

    it('says nothing at all when the figure is NOT zero', () => {
      const component = new VehiclePlReportPageComponent(
        makeStoreStub(null) as any,
        createTranslateStub()
      );

      expect((component as any).zeroRevenueReasonKey(vehicleRow())).toBeNull();
      expect((component as any).zeroExpenseReasonKey(vehicleRow())).toBeNull();
    });

    it('warns on an unknown or contradicted service window, and stays silent on a known one', () => {
      const component = new VehiclePlReportPageComponent(
        makeStoreStub(null) as any,
        createTranslateStub()
      );

      expect(
        (component as any).coverageWarningKey(vehicleRow({ coverage: 'SERVICE_WINDOW_UNKNOWN' }))
      ).toBe('ADMIN.VEHICLE_PL_REPORT.COVERAGE.SERVICE_WINDOW_UNKNOWN');
      expect(
        (component as any).coverageWarningKey(vehicleRow({ coverage: 'OUTSIDE_SERVICE_WINDOW' }))
      ).toBe('ADMIN.VEHICLE_PL_REPORT.COVERAGE.OUTSIDE_SERVICE_WINDOW');
      expect((component as any).coverageWarningKey(vehicleRow({ coverage: 'IN_SERVICE' }))).toBeNull();
    });
  });

  describe('contentState', () => {
    it('is "loading" on a first visit with no cache and a refresh in flight', () => {
      const store = makeStoreStub(null);
      store.refreshing$.next(true);
      const component = new VehiclePlReportPageComponent(store as any, createTranslateStub());

      component.ngOnInit();

      expect((component as any).contentState).toBe('loading');
    });

    it('is "empty" for a 200 with no rows at all', () => {
      const store = makeStoreStub(makeReport({ rows: [] }));
      const component = new VehiclePlReportPageComponent(store as any, createTranslateStub());

      component.ngOnInit();

      expect((component as any).contentState).toBe('empty');
    });

    // A fleet of quiet buses is real data, not an empty report — each of those zeros
    // carries a different reason and the owner has to see them.
    it('is "data" when every figure is zero but the rows exist', () => {
      const store = makeStoreStub(
        makeReport({
          rows: [vehicleRow({ revenue: '0.00', expenseTotal: '0.00', margin: '0.00' })],
        })
      );
      const component = new VehiclePlReportPageComponent(store as any, createTranslateStub());

      component.ngOnInit();

      expect((component as any).contentState).toBe('data');
    });
  });
});

describe('VehiclePlReportPageComponent (template rendering)', () => {
  let fixture: ComponentFixture<VehiclePlReportPageComponent>;
  let dataSubject: BehaviorSubject<VehiclePlReportDto | null>;
  let storeStub: ReturnType<typeof makeStoreStub>;

  beforeEach(async () => {
    storeStub = makeStoreStub(null);
    dataSubject = storeStub.data$;

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        FormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        MenuModule,
        AdminSharedModule,
      ],
      declarations: [VehiclePlReportPageComponent, ExportButtonComponent],
      providers: [
        { provide: VehiclePlReportStore, useValue: storeStub },
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', { hasAnyRole: true }) },
        { provide: AlertService, useValue: jasmine.createSpyObj('AlertService', ['error']) },
        { provide: ExportService, useValue: jasmine.createSpyObj('ExportService', ['export']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VehiclePlReportPageComponent);
  });

  function renderReport(report: VehiclePlReportDto): void {
    storeStub.hasValue = true;
    dataSubject.next(report);
    fixture.detectChanges();
  }

  it('puts ONLY the vehicles in the fleet table (trackBy stays bound to the component)', () => {
    renderReport(makeReport());

    const dataRows: NodeListOf<HTMLTableRowElement> = fixture.nativeElement.querySelectorAll(
      'tbody tr:not(.vehicle-pl-detail-row)'
    );
    expect(dataRows.length).toBe(2);
    expect(fixture.nativeElement.querySelector('table').textContent).not.toContain('UNASSIGNED');
  });

  // AC2 rendered, not merely computed: the two vehicle-less lines are on the page, apart
  // from the fleet, each with its own explanation.
  it('renders the unassigned-revenue and central-cost lines separately, each explained', () => {
    renderReport(makeReport());

    const asides = fixture.nativeElement.querySelectorAll('.vehicle-pl-aside');
    expect(asides.length).toBe(2);
    expect(visibleText(asides[0])).toContain('THB 700.00');
    expect(visibleText(asides[0])).toContain('ADMIN.VEHICLE_PL_REPORT.UNASSIGNED.HINT');
    expect(visibleText(asides[1])).toContain('THB 500.00');
    expect(visibleText(asides[1])).toContain('ADMIN.VEHICLE_PL_REPORT.CENTRAL.HINT');
  });

  // AC3 rendered: the quiet bus's ฿0 does NOT look like the earning bus's numbers, and it
  // says why — both the service window and the "never ran".
  it('renders a quiet vehicle’s zero with its reason and its coverage badge', () => {
    renderReport(makeReport());

    const quietRow: HTMLTableRowElement = fixture.nativeElement.querySelectorAll(
      'tbody tr:not(.vehicle-pl-detail-row)'
    )[1];

    expect(quietRow.textContent).toContain('ADMIN.VEHICLE_PL_REPORT.ZERO.DID_NOT_RUN');
    expect(quietRow.textContent).toContain('ADMIN.VEHICLE_PL_REPORT.ZERO.NO_ENTRIES');
    expect(quietRow.querySelector('.vehicle-pl-badge')?.textContent).toContain(
      'ADMIN.VEHICLE_PL_REPORT.COVERAGE.SERVICE_WINDOW_UNKNOWN'
    );
  });

  /**
   * ADR-0115 §1 on the screen: `vatTotal` is a component ALREADY INSIDE `expenseTotal`.
   * The earning vehicle's expenses are 1200.00 with 84.00 of VAT inside — 1284.00 must
   * appear nowhere, in any cell or total, because that number does not exist.
   */
  it('never renders amount + VAT anywhere on the page', () => {
    renderReport(makeReport());

    const text = visibleText(fixture.nativeElement);
    expect(text).toContain('THB 1,200.00');
    expect(text).toContain('THB 84.00');
    expect(text).not.toContain('THB 1,284.00');
    expect(text).not.toContain('THB 1,819.00'); // totals.expenses + totals.vat
  });

  it('offers the export with the dataset key and the range currently on screen', () => {
    renderReport(makeReport());

    const exportButton = fixture.debugElement.query(
      (node) => node.name === 'app-export-button'
    ).componentInstance as ExportButtonComponent;

    expect(exportButton.datasetKey).toBe('pl-per-vehicle');
    expect(exportButton.params).toEqual({ from: '2026-08-01', to: '2026-08-22' });
  });

  it('states the VAT convention on the page rather than leaving it implied', () => {
    renderReport(makeReport());

    expect(fixture.nativeElement.textContent).toContain('ADMIN.VEHICLE_PL_REPORT.VAT_NOTE');
    expect(fixture.nativeElement.textContent).toContain('ADMIN.VEHICLE_PL_REPORT.MARGIN_NOTE');
  });
});
