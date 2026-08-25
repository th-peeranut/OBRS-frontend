import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { PayeeSpendReportPageComponent } from './payee-spend-report-page.component';
import { PayeeSpendReportStore } from './payee-spend-report.store';
import {
  PayeeSpendReportDto,
  PayeeSpendRowDto,
} from '../../../../shared/interfaces/payee-spend-report.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminSharedModule } from '../../admin-shared.module';

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

  it('offers every year first and prints what each year would cost to choose', () => {
    renderReport(makeReport());

    const options = fixture.nativeElement.querySelectorAll('#payeeSpendYear option');
    expect(options.length).toBe(3);
    expect(options[0].value).toBe('');
    expect(options[1].value).toContain('2026');
  });

  // The ruling of 2026-08-25: "January of every year" is not a report this screen produces.
  //
  // Awaited, because `[disabled]` next to `ngModel` binds NgModel's own `disabled` INPUT rather
  // than the DOM property, and NgModel applies it through the form control on a resolved promise —
  // so one detectChanges() is genuinely too early to read `select.disabled` and asserting there
  // would pass or fail on timing rather than on behaviour.
  it('leaves the month control inert while every year is selected', async () => {
    renderReport(makeReport());
    await fixture.whenStable();
    fixture.detectChanges();

    const month: HTMLSelectElement = fixture.nativeElement.querySelector('#payeeSpendMonth');
    expect(month.disabled).toBeTrue();
  });

  it('enables the month control once a year is picked', async () => {
    storeStub.filter = { year: 2026, month: null, category: null };
    renderReport(makeReport({ year: 2026 }));
    await fixture.whenStable();
    fixture.detectChanges();

    const month: HTMLSelectElement = fixture.nativeElement.querySelector('#payeeSpendMonth');
    expect(month.disabled).toBeFalse();
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
