import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
// The real p-datePicker, not a schema-suppressed unknown element: [ngModel] on an
// unknown tag has no value accessor and every test in this file dies at NG01203.
import { DatePickerModule } from 'primeng/datepicker';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { MyEarningsPageComponent } from './my-earnings-page.component';
import { MyEarningsStore } from './my-earnings.store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { PerHeadEarningsRespDto } from '../../../../shared/interfaces/driver-cash.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok(data: PerHeadEarningsRespDto): ResponseAPI<PerHeadEarningsRespDto> {
  return { code: 200, message: 'ok', data };
}

function earnings(overrides: Partial<PerHeadEarningsRespDto> = {}): PerHeadEarningsRespDto {
  return {
    granularity: 'MONTH',
    from: '2026-01-01',
    to: '2026-08-08',
    totalHeadCount: 20,
    totalAmount: '200.00',
    buckets: [
      { bucketKey: '2026-08', bucketStart: '2026-08-01', headCount: 12, amount: '120.00', effectiveRate: '10.00' },
      { bucketKey: '2026-07', bucketStart: '2026-07-01', headCount: 8, amount: '80.00', effectiveRate: '10.00' },
    ],
    holders: null,
    ...overrides,
  };
}

describe('MyEarningsPageComponent (OBRS-1147)', () => {
  let fixture: ComponentFixture<MyEarningsPageComponent>;
  let component: MyEarningsPageComponent;
  let api: jasmine.SpyObj<StaffApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<StaffApiService>('StaffApiService', ['getDriverCashMyEarnings']);
    api.getDriverCashMyEarnings.and.returnValue(of(ok(earnings())));

    await TestBed.configureTestingModule({
      declarations: [MyEarningsPageComponent],
      imports: [CommonModule, FormsModule, DatePickerModule, TranslateModule.forRoot()],
      providers: [
        MyEarningsStore,
        { provide: StaffApiService, useValue: api },
        { provide: AuthService, useValue: { authStatus$: new BehaviorSubject<boolean>(true) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(MyEarningsPageComponent);
    component = fixture.componentInstance;
  });

  it('asks for this year to date, grouped by month, without naming any user', async () => {
    const thisYear = new Date().getFullYear();

    fixture.detectChanges();
    await fixture.whenStable();

    expect(api.getDriverCashMyEarnings).toHaveBeenCalledTimes(1);
    const [from, , granularity] = api.getDriverCashMyEarnings.calls.mostRecent().args;
    expect(from).toBe(`${thisYear}-01-01`);
    expect(granularity).toBe('MONTH');
    // The endpoint takes no holder id at all — the guarantee that one staff
    // member cannot read another's pay is that there is no parameter for it.
    expect(api.getDriverCashMyEarnings.calls.mostRecent().args.length).toBe(3);
  });

  // OBRS-1593: the owner's standing rule is Gregorian years EVERYWHERE. This row was the last
  // place in the app that disagreed - `th-TH` defaults to the Buddhist calendar, so a bucket that
  // every other screen calls 2026 printed here as 2569. The assertion is on the RENDERED cell, not
  // on the formatter, because the bug was visible only after the locale reached Intl.
  it('prints the Gregorian year in Thai, never the Buddhist one', async () => {
    TestBed.inject(TranslateService).currentLang = 'th';

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const label = fixture.debugElement
      .query(By.css('[data-testid="bucket-2026-08"] td'))
      .nativeElement.textContent as string;

    expect(label).toContain('2026');
    // 2569 is 2026 in the Buddhist era - the exact number this card exists to stop rendering.
    expect(label).not.toContain('2569');
    // The month name still comes out in Thai: this is a calendar change, not a language change.
    expect(label).toContain('สิงหาคม');
  });

  it('renders one row per bucket, most recent first', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('[data-testid^="bucket-"]'));
    expect(rows.length).toBe(2);
    expect(rows[0].nativeElement.getAttribute('data-testid')).toBe('bucket-2026-08');
    expect(rows[1].nativeElement.getAttribute('data-testid')).toBe('bucket-2026-07');
  });

  it('shows the totals the server sent, not a client-side re-sum', async () => {
    // A client-side sum would agree here and diverge the moment the server
    // rounds differently — the money figure on screen must be the server's.
    api.getDriverCashMyEarnings.and.returnValue(
      of(ok(earnings({ totalAmount: '199.99', totalHeadCount: 20 })))
    );

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // OBRS-1592: the figure now carries its unit. This screen had its own
    // `formatMoney` doing a bare two-decimal Intl — same name as the shared
    // formatter, different output, no unit at all. `TranslateModule.forRoot()`
    // here leaves `currentLang` unset, which is the code-leads-the-number form.
    const total = fixture.debugElement.query(By.css('[data-testid="my-earnings-total"]'));
    expect(total.nativeElement.textContent.trim()).toBe('THB 199.99');
  });

  it('switching the grouping refetches with the new granularity', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    component['onGranularityChange']('YEAR');
    await fixture.whenStable();

    expect(api.getDriverCashMyEarnings.calls.mostRecent().args[2]).toBe('YEAR');
  });

  it('a reversed range is refused client-side and never dispatched', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const callsBefore = api.getDriverCashMyEarnings.calls.count();

    component['fromDate'] = new Date(2026, 7, 31);
    component['onToDateChange'](new Date(2026, 7, 1));
    await fixture.whenStable();

    expect(api.getDriverCashMyEarnings.calls.count()).toBe(callsBefore);
    expect(component['contentState']).toBe('invalid');
  });

  it('an empty period is a note, not an error — earning nothing is a fact', async () => {
    api.getDriverCashMyEarnings.and.returnValue(
      of(ok(earnings({ buckets: [], totalAmount: '0.00', totalHeadCount: 0 })))
    );

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component['contentState']).toBe('empty');
    expect(component['loadError']).toBe('');
  });

  it('a failed fetch replaces the table rather than sitting beside stale numbers', async () => {
    api.getDriverCashMyEarnings.and.returnValue(throwError(() => new Error('boom')));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component['contentState']).toBe('error');
    expect(fixture.debugElement.query(By.css('[data-testid="my-earnings-section"]'))).toBeNull();
  });

  it('a null rate renders an em dash, never 0.00 — the data has no rate to show', async () => {
    api.getDriverCashMyEarnings.and.returnValue(
      of(ok(earnings({
          buckets: [
            { bucketKey: '2026-08', bucketStart: '2026-08-01', headCount: 0, amount: '0.00', effectiveRate: null },
          ],
        })))
    );

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const row = fixture.debugElement.query(By.css('[data-testid="bucket-2026-08"]'));
    expect(row.nativeElement.textContent).toContain('—');
  });

  /**
   * OBRS-1751. This screen had the order check and no CAP, so a staff member could ask the
   * backend for an unbounded span — the one thing every report page guards. The boundary is what
   * matters: 366 goes through, 367 does not, and a refusal must NOT dispatch.
   */
  describe('the 366-day cap (OBRS-1751)', () => {
    async function settle(): Promise<void> {
      fixture.detectChanges();
      await fixture.whenStable();
    }

    it('dispatches a span of exactly 366 days', async () => {
      await settle();
      api.getDriverCashMyEarnings.calls.reset();

      // 2026-01-01 -> 2027-01-02 is 366 days (2026 is not a leap year).
      component['onFromDateChange'](new Date(2026, 0, 1));
      api.getDriverCashMyEarnings.calls.reset();
      component['onToDateChange'](new Date(2027, 0, 2));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['rangeError']).toBe('');
      const [from, to] = api.getDriverCashMyEarnings.calls.mostRecent().args;
      expect(from).toBe('2026-01-01');
      expect(to).toBe('2027-01-02');
    });

    it('refuses one day past the cap, and asks the backend for nothing', async () => {
      await settle();

      component['onFromDateChange'](new Date(2026, 0, 1));
      api.getDriverCashMyEarnings.calls.reset();
      component['onToDateChange'](new Date(2027, 0, 3));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['rangeError']).toBe('STAFF.MY_EARNINGS.ERROR.RANGE_TOO_LARGE');
      expect(api.getDriverCashMyEarnings).not.toHaveBeenCalled();
      expect(component['contentState']).toBe('invalid');
    });

    it('still refuses a reversed range, and says THAT rather than the cap', async () => {
      await settle();

      component['onToDateChange'](new Date(2026, 5, 1));
      api.getDriverCashMyEarnings.calls.reset();
      component['onFromDateChange'](new Date(2026, 5, 10));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['rangeError']).toBe('STAFF.MY_EARNINGS.ERROR.RANGE_INVALID');
      expect(api.getDriverCashMyEarnings).not.toHaveBeenCalled();
    });
  });
});
