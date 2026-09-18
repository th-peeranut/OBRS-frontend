import { BehaviorSubject, of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { PayeeSpendReportPageComponent } from './payee-spend-report-page.component';
import { PayeeSpendReportStore } from './payee-spend-report.store';
import {
  PayeeBillListDto,
  PayeeSpendReportDto,
  PayeeSpendRowDto,
} from '../../../../shared/interfaces/payee-spend-report.interface';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { MenuModule } from 'primeng/menu';
import { ExportButtonComponent } from '../../../../shared/components/export-button/export-button.component';
import { PendingButtonDirective } from '../../../../shared/directives/pending-button.directive';
import { AuthService } from '../../../../auth/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ExportService } from '../../../../services/export/export.service';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminSharedModule } from '../../admin-shared.module';
import { AdminDropdownComponent } from '../../components/admin-dropdown/admin-dropdown.component';

function payeeRow(overrides: Partial<PayeeSpendRowDto> = {}): PayeeSpendRowDto {
  return {
    payeeId: 1,
    payeeName: 'อู่ช่างปุ้น',
    payeeType: 'GARAGE',
    workDone: ['ถ่ายน้ำมันเครื่อง', 'สายพาน'],
    billCount: 2,
    totalAmount: '5410.00',
    ...overrides,
  };
}

function makeReport(overrides: Partial<PayeeSpendReportDto> = {}): PayeeSpendReportDto {
  return {
    year: null,
    month: null,
    category: null,
    yearOptions: [
      { year: 2026, billCount: 5, totalAmount: '16559.00' },
      { year: 2025, billCount: 1, totalAmount: '5530.00' },
    ],
    rows: [payeeRow({ payeeId: 2, payeeName: 'เอนกเซอร์วิส', billCount: 1, totalAmount: '5530.00' }), payeeRow()],
    unassigned: {
      payeeId: null,
      payeeName: null,
      payeeType: null,
      workDone: [],
      billCount: 31,
      totalAmount: '36051.00',
    },
    assignedBillCount: 3,
    assignedTotalAmount: '10940.00',
    totalBillCount: 34,
    totalAmount: '46991.00',
    ...overrides,
  };
}

/**
 * OBRS-1619 — the drill-down's only collaborator. `of(...)` rather than a promise so a test can
 * assert what was REQUESTED (the filter at click time) as well as what was rendered.
 */
function makeApiStub(bills: PayeeBillListDto = makeBillList()) {
  return {
    getPayeeBills: jasmine
      .createSpy('getPayeeBills')
      .and.returnValue(of({ status: 200, message: 'OK', data: bills })),
  };
}

function makeBillList(overrides: Partial<PayeeBillListDto> = {}): PayeeBillListDto {
  return {
    payeeId: 1,
    payeeName: 'อู่ช่างปุ้น',
    year: null,
    month: null,
    category: null,
    bills: [
      {
        expenseId: 11,
        expenseDate: '2026-08-14',
        receiptNo: 'A1',
        workDone: ['ถ่ายน้ำมันเครื่อง', 'สายพาน'],
        amount: '3210.00',
      },
      {
        expenseId: 12,
        expenseDate: '2026-07-28',
        receiptNo: null,
        workDone: [],
        amount: '2200.00',
      },
    ],
    billCount: 2,
    totalAmount: '5410.00',
    ...overrides,
  };
}

function makeStoreStub(
  data: PayeeSpendReportDto | null,
  filter: { year: number | null; month: number | null; category: string | null } = {
    year: null,
    month: null,
    category: null,
  }
) {
  return {
    data$: new BehaviorSubject<PayeeSpendReportDto | null>(data),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    filter,
    hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setYear: jasmine.createSpy('setYear'),
    setMonth: jasmine.createSpy('setMonth'),
    setCategory: jasmine.createSpy('setCategory'),
  };
}

describe('PayeeSpendReportPageComponent', () => {
  let fixture: ComponentFixture<PayeeSpendReportPageComponent>;
  let storeStub: ReturnType<typeof makeStoreStub>;
  let apiStub: ReturnType<typeof makeApiStub>;
  let dataSubject: BehaviorSubject<PayeeSpendReportDto | null>;

  beforeEach(async () => {
    storeStub = makeStoreStub(null);
    apiStub = makeApiStub();
    dataSubject = storeStub.data$;

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        FormsModule,
        TranslateModule.forRoot(),
        MenuModule,
        AdminSharedModule,
      ],
      // OBRS-1619: the template now also renders <app-export-button>, so it must be declared
      // (with its own DI deps stubbed) or every case in this block dies on the unknown element.
      declarations: [PayeeSpendReportPageComponent, ExportButtonComponent, PendingButtonDirective],
      providers: [
        { provide: PayeeSpendReportStore, useValue: storeStub },
        { provide: AdminApiService, useValue: apiStub },
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', { hasAnyRole: true }) },
        { provide: AlertService, useValue: jasmine.createSpyObj('AlertService', ['error']) },
        { provide: ExportService, useValue: jasmine.createSpyObj('ExportService', ['export']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PayeeSpendReportPageComponent);
  });

  function renderReport(report: PayeeSpendReportDto): void {
    storeStub.hasValue = true;
    dataSubject.next(report);
    fixture.detectChanges();
  }

  it('renders one row per payee plus the row for bills with no payee on record', () => {
    renderReport(makeReport());

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    expect(fixture.nativeElement.querySelectorAll('.payee-spend-unassigned').length).toBe(1);
  });

  // AC2. The coverage banner is the difference between a number and a misleading number.
  it('states how much of the spend it is showing when some bills have no payee', () => {
    renderReport(makeReport());

    expect(fixture.nativeElement.querySelector('.payee-spend-coverage')).not.toBeNull();
  });

  it('shows no coverage banner when every bill has a payee', () => {
    renderReport(
      makeReport({
        unassigned: null,
        assignedTotalAmount: '10940.00',
        totalAmount: '10940.00',
        assignedBillCount: 3,
        totalBillCount: 3,
      })
    );

    expect(fixture.nativeElement.querySelector('.payee-spend-coverage')).toBeNull();
  });

  /** The filter row, in template order: year, month, category. */
  function dropdowns(): AdminDropdownComponent[] {
    return fixture.debugElement
      .queryAll(By.directive(AdminDropdownComponent))
      .map((element) => element.componentInstance as AdminDropdownComponent);
  }

  // design-system.md 3.1: every filter is the shared dropdown, whose placeholder-header row IS the
  // no-filter choice. A raw <select> here would be the one on the console that looks different.
  it('builds all three filters from the shared admin dropdown', () => {
    renderReport(makeReport());

    expect(dropdowns().length).toBe(3);
  });

  it('turns every year in the response into an option', () => {
    renderReport(makeReport());

    const yearOptions = dropdowns()[0].options as { code: string; label: string }[];
    expect(yearOptions.map((option) => option.code)).toEqual(['2026', '2025']);
  });

  // The label is what makes narrowing an informed choice — it has to carry the bill count and the
  // money, not just the year. Asserted on the interpolation PARAMS, because the test bundle has no
  // translations loaded and every key resolves to itself.
  it('hands the year label its bill count and its money', () => {
    const translate = createTranslateStub();
    spyOn(translate, 'instant').and.callThrough();
    const component = new PayeeSpendReportPageComponent(storeStub as never, apiStub as never, translate);

    component['yearOptionLabel'](2026, 5, '16559.00');

    expect(translate.instant).toHaveBeenCalledWith(
      'ADMIN.PAYEE_SPEND_REPORT.YEAR_OPTION',
      jasmine.objectContaining({ year: 2026, count: 5 })
    );
  });

  // The ruling of 2026-08-25: "January of every year" is not a report this screen produces.
  it('leaves the month control inert while every year is selected', () => {
    renderReport(makeReport());

    expect(dropdowns()[1].disabled).toBeTrue();
  });

  it('enables the month control once a year is picked', () => {
    storeStub.filter = { year: 2026, month: null, category: null };
    renderReport(makeReport({ year: 2026 }));

    expect(dropdowns()[1].disabled).toBeFalse();
  });

  // The dropdowns show their FIELD NAMES when nothing is chosen, so this line is the only place the
  // reader is told that "nothing chosen" means "everything".
  it('spells out the active window in words', () => {
    renderReport(makeReport());

    expect(fixture.nativeElement.querySelector('.payee-spend-period').textContent).toContain(
      'PERIOD_ALL'
    );
  });

  it('passes a chosen year to the store as a number, and every-year as null', () => {
    const component = new PayeeSpendReportPageComponent(storeStub as never, apiStub as never, createTranslateStub());

    component['onYearChange']('2026');
    expect(storeStub.setYear).toHaveBeenCalledWith(2026);

    component['onYearChange']('');
    expect(storeStub.setYear).toHaveBeenCalledWith(null);
  });

  it('shows the bill lines joined, not re-interpreted into parts', () => {
    const component = new PayeeSpendReportPageComponent(storeStub as never, apiStub as never, createTranslateStub());

    expect(component['workText'](payeeRow())).toBe('ถ่ายน้ำมันเครื่อง · สายพาน');
  });

  // A period holding ONLY unrecorded bills is the case the coverage line exists for. It must not
  // fall through to the empty state, which would say "nothing was spent".
  it('does not call a period empty when its only bills have no payee', () => {
    const component = new PayeeSpendReportPageComponent(storeStub as never, apiStub as never, createTranslateStub());
    component['report'] = makeReport({ rows: [] });

    expect(component['isEmptyReport']).toBeFalse();
  });

  // ---- OBRS-1619 ----

  function drillButtons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.payee-spend-drill'));
  }

  it('AC1: clicking a payee opens its bills, asked for under the filter that is on screen', async () => {
    storeStub.filter = { year: 2026, month: 8, category: 'REPAIR' };
    renderReport(makeReport());

    drillButtons()[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    // The first row is payee 2 (biggest spend first), and the window travels with it — a
    // drill-down under a different period than the report is the failure this asserts against.
    expect(apiStub.getPayeeBills).toHaveBeenCalledWith(2, 2026, 8, 'REPAIR');
    expect(fixture.nativeElement.querySelector('.payee-spend-bills')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.payee-spend-bills-table tbody tr').length).toBe(2);
  });

  it('AC1: the unassigned row drills down with no payee id, because it has none', async () => {
    renderReport(makeReport());

    const unassignedButton = fixture.nativeElement.querySelector(
      '.payee-spend-unassigned .payee-spend-drill'
    ) as HTMLButtonElement;
    unassignedButton.click();
    await fixture.whenStable();

    expect(apiStub.getPayeeBills).toHaveBeenCalledWith(null, null, null, null);
  });

  it('AC1: clicking the open row again closes the panel', async () => {
    renderReport(makeReport());

    drillButtons()[0].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.payee-spend-bills')).not.toBeNull();

    drillButtons()[0].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.payee-spend-bills')).toBeNull();
  });

  // The panel must not outlive the window it was taken under: a list of 2026 bills still on screen
  // under a report the reader has just switched to 2025 is a wrong screen, not a stale one.
  it('AC1: changing a filter closes an open drill-down', async () => {
    renderReport(makeReport());

    drillButtons()[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance['onYearChange']('2025');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.payee-spend-bills')).toBeNull();
    expect(storeStub.setYear).toHaveBeenCalledWith(2025);
  });

  it('AC2: the export button sends only the filters that are set', () => {
    const component = new PayeeSpendReportPageComponent(
      storeStub as never,
      apiStub as never,
      createTranslateStub()
    );

    storeStub.filter = { year: null, month: null, category: null };
    // "Every year" is said by sending no year at all — the same thing the screen's own fetch does.
    expect(component['exportParams']).toEqual({});

    storeStub.filter = { year: 2026, month: 8, category: 'REPAIR' };
    expect(component['exportParams']).toEqual({ year: '2026', month: '8', category: 'REPAIR' });

    // A month cannot travel without its year: the endpoint refuses that combination outright.
    storeStub.filter = { year: null, month: 8, category: null };
    expect(component['exportParams']).toEqual({});
  });
});
