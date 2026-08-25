import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { PayeeSpendReportPageComponent } from './payee-spend-report-page.component';
import { PayeeSpendReportStore } from './payee-spend-report.store';
import {
  PayeeSpendReportDto,
  PayeeSpendRowDto,
} from '../../../../shared/interfaces/payee-spend-report.interface';
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
  let dataSubject: BehaviorSubject<PayeeSpendReportDto | null>;

  beforeEach(async () => {
    storeStub = makeStoreStub(null);
    dataSubject = storeStub.data$;

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), AdminSharedModule],
      declarations: [PayeeSpendReportPageComponent],
      providers: [{ provide: PayeeSpendReportStore, useValue: storeStub }],
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
    const component = new PayeeSpendReportPageComponent(storeStub as never, translate);

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
    const component = new PayeeSpendReportPageComponent(
      storeStub as never,
      createTranslateStub()
    );

    component['onYearChange']('2026');
    expect(storeStub.setYear).toHaveBeenCalledWith(2026);

    component['onYearChange']('');
    expect(storeStub.setYear).toHaveBeenCalledWith(null);
  });

  it('shows the bill lines joined, not re-interpreted into parts', () => {
    const component = new PayeeSpendReportPageComponent(
      storeStub as never,
      createTranslateStub()
    );

    expect(component['workText'](payeeRow())).toBe('ถ่ายน้ำมันเครื่อง · สายพาน');
  });

  // A period holding ONLY unrecorded bills is the case the coverage line exists for. It must not
  // fall through to the empty state, which would say "nothing was spent".
  it('does not call a period empty when its only bills have no payee', () => {
    const component = new PayeeSpendReportPageComponent(
      storeStub as never,
      createTranslateStub()
    );
    component['report'] = makeReport({ rows: [] });

    expect(component['isEmptyReport']).toBeFalse();
  });
});
