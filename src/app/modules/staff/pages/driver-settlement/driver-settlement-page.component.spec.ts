/**
 * OBRS-1756 — `/staff/settlement`, the day-level driver settlement screen.
 *
 * The nav half of this card (the item swap itself) is pinned in
 * `staff-nav-sections.spec.ts`, which already owns the per-role sidebar harness; only
 * the page's own behaviour lives here.
 */
import { Component, EventEmitter, Input, NO_ERRORS_SCHEMA, Output, forwardRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { By } from '@angular/platform-browser';
// The real p-datePicker, not a schema-suppressed unknown element: `[ngModel]` on an
// unknown tag has no value accessor and every test here would die at NG01203 (the
// my-earnings spec hit exactly this).
import { DatePickerModule } from 'primeng/datepicker';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { DriverSettlementPageComponent } from './driver-settlement-page.component';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { StaffSchedulesStore } from '../staff-schedules/staff-schedules.store';
import { ExpensePayeesStore } from '../../../admin/pages/expense-payees/expense-payees.store';
import { MaintenancePartsStore } from '../../../admin/pages/maintenance-parts/maintenance-parts.store';
import { toIsoDateString } from '../../../admin/pages/expenses/expenses-page.mappers';
import {
  DriverCashDayContextRespDto,
  DriverCashDayRespDto,
  DriverCashDaySettleReqDto,
} from '../../../../shared/interfaces/driver-cash.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

/** `app-admin-dropdown` is a custom element carrying `[ngModel]`, so it needs a real value
 * accessor even in a schema-suppressed TestBed — same reason the date picker is imported for real
 * above. Nothing about the dropdown's own behaviour is under test here. */
@Component({
  selector: 'app-admin-dropdown',
  template: '',
  standalone: false,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AdminDropdownStubComponent),
      multi: true,
    },
  ],
})
class AdminDropdownStubComponent implements ControlValueAccessor {
  @Input() options: unknown[] = [];
  @Input() placeholder = '';
  @Input() valueKey = 'value';
  @Input() labelKey = 'label';
  @Input() searchable = false;
  @Output() valueChange = new EventEmitter<string>();
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
}

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'ok', data };
}

function day(overrides: Partial<DriverCashDayRespDto> = {}): DriverCashDayRespDto {
  return {
    dayId: 7,
    driverId: 44,
    driverName: 'สมชาย',
    holderRole: 'DRIVER',
    businessDate: '2026-09-08',
    vehicleId: 3,
    status: 'OPEN',
    entries: [],
    advanceTotal: '500.00',
    perHeadTotal: '0.00',
    expensePaidTotal: '0.00',
    parcelRemitTotal: '0.00',
    parcelClawbackTotal: '0.00',
    expectedReturnAmount: '0.00',
    returnedAmount: null,
    returnedAt: null,
    returnedByUserId: null,
    returnedByName: null,
    discrepancy: null,
    discrepancyReason: null,
    perHeadRates: [],
    hasUnmappedSalesPointRemit: false,
    reopenCount: 0,
    reopens: [],
    ...overrides,
  };
}

function context(
  overrides: Partial<DriverCashDayContextRespDto> = {}
): DriverCashDayContextRespDto {
  return {
    businessDate: '2026-09-08',
    vehicleId: 3,
    vehiclePlate: '16-8747',
    assignedDriverId: 44,
    assignedDriverName: 'สมชาย',
    driverId: 44,
    driverName: 'สมชาย',
    schedules: [
      {
        scheduleId: 101,
        departureDateTime: '2026-09-08T06:00:00',
        routeId: 1,
        routeName: 'บ้านบึง - เอกมัย',
        firstRoundOfRoute: true,
      },
      {
        scheduleId: 102,
        departureDateTime: '2026-09-08T13:00:00',
        routeId: 1,
        routeName: 'บ้านบึง - เอกมัย',
        firstRoundOfRoute: false,
      },
    ],
    legCount: 2,
    driverWageRateConfigured: true,
    driverWageRatePerLeg: '300.00',
    driverWageTotal: '600.00',
    parkingFeeEligible: true,
    day: day(),
    alreadySettled: false,
    lastSubmission: null,
    ...overrides,
  };
}

describe('DriverSettlementPageComponent (OBRS-1756)', () => {
  let fixture: ComponentFixture<DriverSettlementPageComponent>;
  let component: DriverSettlementPageComponent;
  let api: jasmine.SpyObj<StaffApiService>;

  async function setUp(ctx: DriverCashDayContextRespDto | null = context()): Promise<void> {
    api = jasmine.createSpyObj<StaffApiService>('StaffApiService', [
      'getDriverCashDayContext',
      'postDriverCashDaySettle',
    ]);
    api.getDriverCashDayContext.and.returnValue(of(ok(ctx as DriverCashDayContextRespDto)));
    api.postDriverCashDaySettle.and.returnValue(of(ok(day())));

    await TestBed.resetTestingModule()
      .configureTestingModule({
        declarations: [DriverSettlementPageComponent, AdminDropdownStubComponent],
        imports: [
          CommonModule,
          FormsModule,
          ReactiveFormsModule,
          DatePickerModule,
          TranslateModule.forRoot(),
        ],
        providers: [
          { provide: StaffApiService, useValue: api },
          {
            provide: StaffSchedulesStore,
            useValue: {
              data$: new BehaviorSubject({
                schedules: [],
                routes: [],
                vehicles: [{ id: 3, numberPlate: '16-8747' }],
                vehicleTypes: [],
                drivers: [
                  { id: 44, name: 'สมชาย' },
                  { id: 45, name: 'สมหญิง' },
                ],
                lookups: [],
              }),
              refresh: () => Promise.resolve(),
            },
          },
          {
            provide: ExpensePayeesStore,
            useValue: { data$: new BehaviorSubject([]), refresh: () => Promise.resolve() },
          },
          {
            provide: MaintenancePartsStore,
            useValue: { data$: new BehaviorSubject([]), refresh: () => Promise.resolve() },
          },
        ],
        schemas: [NO_ERRORS_SCHEMA],
      })
      .compileComponents();

    fixture = TestBed.createComponent(DriverSettlementPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  /** Pick the van, which is what starts the whole screen. */
  function pickVehicle(id = '3'): void {
    component['onVehicleChange'](id);
    fixture.detectChanges();
  }

  it('defaults the date to YESTERDAY, not today (AC-3)', async () => {
    await setUp();

    const expected = new Date();
    expected.setDate(expected.getDate() - 1);

    const selected = component['selectedDate'];
    expect(selected.getFullYear()).toBe(expected.getFullYear());
    expect(selected.getMonth()).toBe(expected.getMonth());
    expect(selected.getDate()).toBe(expected.getDate());
    // Positive control: the default is genuinely NOT today, so an implementation that
    // forgot to subtract a day cannot pass the three assertions above by coincidence.
    expect(component['businessDate']).not.toBe(toIsoDateString(new Date()));
  });

  // The control above used to be decided by the hour the suite ran: a UTC "today" made it red
  // every night between 00:00 and 07:00 Bangkok and green the rest of the day. Freezing the clock
  // takes the hour out of the verdict on every machine — the first expectation below is the local
  // calendar answer and holds at any offset. 00:05 rather than any later hour because the second
  // expectation, the control itself, can only catch a relapse into a UTC comparison where the two
  // days actually differ: that is a host east of UTC, and at 00:05 an offset of minutes is enough
  // (Bangkok, +07:00, is where this was measured). A runner sitting AT UTC cannot go red here —
  // there the UTC day IS the local day, so the buggy comparison is not wrong in the first place
  // (OBRS-1819).
  it('defaults to yesterday, control included, with the clock frozen at 00:05 local (OBRS-1819)', async () => {
    jasmine.clock().install();
    try {
      // No trailing Z: parsed as local time, which is what a staff device reads off the wall.
      jasmine.clock().mockDate(new Date('2026-09-11T00:05:00'));
      await setUp();

      expect(component['businessDate']).toBe('2026-09-10');
      expect(component['businessDate']).not.toBe(toIsoDateString(new Date()));
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('asks day-context with NO driverId when a plate is picked, then prefills the driver from the answer — and the driver stays editable', async () => {
    await setUp();
    pickVehicle();

    expect(api.getDriverCashDayContext).toHaveBeenCalledTimes(1);
    // Third argument null = "you decide" — that is what makes the server answer with the
    // vehicle's assigned driver.
    expect(api.getDriverCashDayContext.calls.mostRecent().args[1]).toBe(3);
    expect(api.getDriverCashDayContext.calls.mostRecent().args[2]).toBeNull();
    expect(component['selectedDriverId']).toBe('44');

    // A DEFAULT, NOT A RESTRICTION: overriding it re-asks with the chosen id.
    component['onDriverChange']('45');
    fixture.detectChanges();
    expect(api.getDriverCashDayContext).toHaveBeenCalledTimes(2);
    expect(api.getDriverCashDayContext.calls.mostRecent().args[2]).toBe(45);
  });

  it('hides the ค่าจอดรถ row when parkingFeeEligible is false, and shows it when true', async () => {
    await setUp(context({ parkingFeeEligible: false }));
    pickVehicle();

    expect(
      fixture.debugElement.query(By.css('[data-testid="settlement-expense-row-PARKING_FEE"]'))
    ).toBeNull();
    // Positive control on the same selector — without it, a typo in the testid would read
    // as "correctly hidden" on every fixture.
    expect(
      fixture.debugElement.query(By.css('[data-testid="settlement-expense-row-FUEL"]'))
    ).not.toBeNull();

    await setUp(context({ parkingFeeEligible: true }));
    pickVehicle();
    expect(
      fixture.debugElement.query(By.css('[data-testid="settlement-expense-row-PARKING_FEE"]'))
    ).not.toBeNull();
  });

  it('renders the wage row as the NOT-CONFIGURED state on load and refuses submit — never as ฿0', async () => {
    await setUp(
      context({ driverWageRateConfigured: false, driverWageRatePerLeg: null, driverWageTotal: null })
    );
    pickVehicle();

    expect(
      fixture.debugElement.query(By.css('[data-testid="settlement-wage-not-configured"]'))
    ).not.toBeNull();
    expect(
      fixture.debugElement.query(By.css('[data-testid="settlement-wage-total"]'))
    ).toBeNull();
    expect(component['canSubmit']).toBeFalse();
    expect(component['blockedReasonKey']).toBe(
      'STAFF.DRIVER_CASH.ERROR.WAGE_RATE_NOT_CONFIGURED'
    );

    // Positive control: the very same screen with a rate configured DOES submit, so the
    // refusal above is the rate's doing and not a permanently-disabled button.
    await setUp(context());
    pickVehicle();
    expect(component['canSubmit']).toBeTrue();
  });

  it('sends ONE request carrying every typed expense row and every repair bill', async () => {
    await setUp();
    pickVehicle();

    const rows = component['expenseRows'];
    rows.find((r) => r.category === 'FUEL')!.amountInput = '1200';
    rows.find((r) => r.category === 'TOLL')!.amountInput = '80';
    rows.find((r) => r.category === 'TOLL')!.noteInput = 'ด่านชลบุรี';
    // PERMIT_FEE deliberately left blank — an untyped row is a cost that did not happen.

    component['addRepairBill']();
    const bill = component['repairBills'][0];
    bill.get('payeeId')!.setValue(9);
    const items = bill.get('items')!;
    items.get('0')!.patchValue({ description: 'เปลี่ยนยาง', amount: 3500 });
    fixture.detectChanges();

    component['onSubmit']();

    expect(api.postDriverCashDaySettle).toHaveBeenCalledTimes(1);
    const payload = api.postDriverCashDaySettle.calls.mostRecent()
      .args[0] as DriverCashDaySettleReqDto;

    expect(payload.vehicleId).toBe(3);
    expect(payload.driverId).toBe(44);
    expect(payload.expenses.map((e) => e.category)).toEqual(['DRIVER_WAGE', 'FUEL', 'TOLL']);
    // OBRS-1356: the wage carries NO amount — the server prices it per leg.
    expect(payload.expenses[0].amount).toBeNull();
    expect(payload.expenses[1].amount).toBe('1200');
    expect(payload.expenses[2].note).toBe('ด่านชลบุรี');
    expect(payload.repairBills.length).toBe(1);
    expect(payload.repairBills[0].payeeId).toBe(9);
    expect(payload.repairBills[0].items[0].amount).toBe(3500);
  });

  it('refuses an amount it cannot read instead of dropping that cost from the one submit', async () => {
    await setUp();
    pickVehicle();

    // `1,200` is what a counter clerk types. `toCents` reads only `^\d+(\.\d{1,2})?$`, so
    // buildPayload used to SKIP the row and settle the day 1,200 baht short, in silence.
    component['expenseRows'].find((r) => r.category === 'FUEL')!.amountInput = '1,200';
    fixture.detectChanges();

    expect(component['canSubmit']).toBeFalse();
    expect(component['blockedReasonKey']).toBe('STAFF.DRIVER_CASH.VALIDATION.AMOUNT_INVALID');
    expect(
      fixture.debugElement.query(By.css('[data-testid="settlement-amount-invalid-FUEL"]'))
    ).not.toBeNull();

    component['onSubmit']();
    expect(api.postDriverCashDaySettle).not.toHaveBeenCalled();

    // Positive control: the same row typed correctly clears both the message and the block, so
    // the assertions above are not passing over a screen that refuses everything.
    component['expenseRows'].find((r) => r.category === 'FUEL')!.amountInput = '1200';
    fixture.detectChanges();
    expect(component['blockedReasonKey']).toBeNull();
    expect(
      fixture.debugElement.query(By.css('[data-testid="settlement-amount-invalid-FUEL"]'))
    ).toBeNull();
    component['onSubmit']();
    expect(api.postDriverCashDaySettle).toHaveBeenCalledTimes(1);
  });

  it('reuses the SAME Idempotency-Key when the same payload is retried, and mints a new one once it changes', async () => {
    await setUp();
    api.postDriverCashDaySettle.and.returnValue(throwError(() => new Error('network')));
    pickVehicle();
    component['expenseRows'].find((r) => r.category === 'FUEL')!.amountInput = '1200';

    component['onSubmit']();
    const firstKey = api.postDriverCashDaySettle.calls.mostRecent().args[1];

    // A retry of the identical payload must REPLAY server-side, not write the day twice.
    component['onSubmit']();
    expect(api.postDriverCashDaySettle.calls.mostRecent().args[1]).toBe(firstKey);

    // A changed payload is a different settlement and must never replay the old answer.
    component['expenseRows'].find((r) => r.category === 'FUEL')!.amountInput = '1300';
    component['onSubmit']();
    expect(api.postDriverCashDaySettle.calls.mostRecent().args[1]).not.toBe(firstKey);
    expect(firstKey).toBeTruthy();
  });

  it('renders the re-opened badge and its reason for a box the owner re-opened (AC-6)', async () => {
    await setUp(
      context({
        day: day({
          reopenCount: 1,
          reopens: [
            {
              reopenedAt: '2026-09-09T09:00:00',
              reopenedByUserId: 1,
              reopenedByName: 'เจ้าของ',
              reason: 'บิลน้ำมันมาทีหลัง',
              prevReturnedAmount: '120.00',
              prevExpectedReturnAmount: '120.00',
              prevDiscrepancyReason: null,
            },
          ],
        }),
      })
    );
    // The reason travels through `| translate: { reason }`, so the assertion below is only
    // meaningful once a real translation is loaded — an unresolved key renders itself and
    // silently drops every interpolated value.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation(
      'en',
      { STAFF: { SETTLEMENT: { BANNER: { REOPEN_REASON: 'Latest reason: {{reason}}' } } } },
      true
    );
    translate.use('en');
    pickVehicle();

    expect(fixture.debugElement.query(By.css('[data-testid="settlement-reopened"]'))).not.toBeNull();
    const reason = fixture.debugElement.query(By.css('[data-testid="settlement-reopen-reason"]'))
      .nativeElement.textContent as string;
    expect(reason).toContain('บิลน้ำมันมาทีหลัง');

    // Positive control: an ordinary box renders neither, so the badge above tracks
    // reopenCount rather than always being present.
    await setUp(context());
    pickVehicle();
    expect(fixture.debugElement.query(By.css('[data-testid="settlement-reopened"]'))).toBeNull();
  });

  it('refuses to settle a day with no rounds behind it, before the server has to', async () => {
    await setUp(context({ schedules: [], legCount: 0 }));
    pickVehicle();

    expect(component['canSubmit']).toBeFalse();
    expect(component['blockedReasonKey']).toBe('STAFF.SETTLEMENT.BLOCKED.NO_SCHEDULES');
    expect(
      fixture.debugElement.query(By.css('[data-testid="settlement-rounds-empty"]'))
    ).not.toBeNull();
  });

  it('OBRS-1803: opens the form on what was LAST SENT, and the one button says it will CORRECT it', async () => {
    await setUp(
      context({
        alreadySettled: true,
        lastSubmission: {
          businessDate: '2026-09-08',
          vehicleId: 3,
          driverId: 44,
          expenses: [
            { category: 'DRIVER_WAGE', amount: null, note: null },
            { category: 'FUEL', amount: '1200.00', note: 'เติมบางจาก' },
          ],
          repairBills: [
            {
              payeeId: 7,
              note: null,
              items: [
                {
                  part: null,
                  partId: null,
                  description: 'ยางหน้า',
                  quantity: 2,
                  unit: null,
                  unitPrice: 1500,
                  amount: 3000,
                },
              ],
            },
          ],
        },
      })
    );
    pickVehicle();

    const rows = component['expenseRows'];
    expect(rows.find((row) => row.category === 'FUEL')?.amountInput).toBe('1200.00');
    expect(rows.find((row) => row.category === 'FUEL')?.noteInput).toBe('เติมบางจาก');
    // The wage row stays blank on purpose: its amount is the server's (OBRS-1356) and the
    // submission carries null for it, so there is nothing of the counter's to show back.
    expect(rows.find((row) => row.category === 'DRIVER_WAGE')?.amountInput).toBe('');
    // A category that was NOT sent stays empty rather than inheriting a neighbour's figure.
    expect(rows.find((row) => row.category === 'PARKING_FEE')?.amountInput).toBe('');

    expect(component['repairBills'].length).toBe(1);
    const bill = component['repairBills'][0].getRawValue() as {
      payeeId: number;
      items: { description: string; amount: number | string }[];
    };
    expect(bill.payeeId).toBe(7);
    expect(bill.items.length).toBe(1);
    expect(bill.items[0].description).toBe('ยางหน้า');

    expect(component['isAmending']).toBeTrue();
    expect(component['submitLabelKey']).toBe('STAFF.SETTLEMENT.SUBMIT_AMEND');
    expect(
      fixture.nativeElement.querySelector('[data-testid="settlement-already-settled"]')
    ).not.toBeNull();
  });

  it('OBRS-1803: a box with entries but NO submission behind it still warns that a submit ADDS rows', async () => {
    await setUp(context({ alreadySettled: true, lastSubmission: null }));
    pickVehicle();

    // Nothing to correct - a day settled before this card, or costs the boarding screen keyed
    // round by round. The old warning is still the true one there.
    expect(component['isAmending']).toBeFalse();
    expect(component['submitLabelKey']).toBe('STAFF.SETTLEMENT.SUBMIT');
    expect(
      fixture.nativeElement.querySelector('[data-testid="settlement-entries-exist"]')
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="settlement-already-settled"]')
    ).toBeNull();
  });

  it('OBRS-1803: the cost fields are locked while the day is loading, so an arriving prefill cannot wipe them', async () => {
    await setUp();
    pickVehicle();

    // The context answer REPLACES these rows (it may carry a previous submission to open on), so
    // anything typed during the ~2s the call takes would otherwise vanish without a word.
    component['isContextLoading'] = true;
    fixture.detectChanges();
    // NgModel applies a [disabled] binding through a resolved promise, not synchronously, so one
    // detectChanges() is not enough to see it on the DOM node.
    await fixture.whenStable();
    fixture.detectChanges();

    const amount: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="settlement-amount-FUEL"]'
    );
    const note: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="settlement-note-FUEL"]'
    );
    const addBill: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="settlement-add-bill"]'
    );
    expect(amount.disabled).toBeTrue();
    expect(note.disabled).toBeTrue();
    expect(addBill.disabled).toBeTrue();

    // Positive control: they are editable again the moment the answer has landed.
    component['isContextLoading'] = false;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement.querySelector('[data-testid="settlement-amount-FUEL"]') as HTMLInputElement)
        .disabled
    ).toBeFalse();
  });
  it('OBRS-1903 AC-1/AC-2: opens with NO อื่น ๆ row, and the button is how every one of them arrives', async () => {
    await setUp();
    pickVehicle();

    // AC-1: the five fixed costs and not one OTHER among them. The sixth row OBRS-1896 put on this
    // screen permanently is gone from the table - the owner's ruling (1) is that a row nobody
    // asked for is a row the counter has to notice and clear before the day will submit.
    expect(component['visibleExpenseRows'].map((r) => r.category)).toEqual([
      'DRIVER_WAGE',
      'FUEL',
      'TOLL',
      'PERMIT_FEE',
      'PARKING_FEE',
    ]);
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid^="settlement-other-row-"]').length
    ).toBe(0);

    const add: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="settlement-add-other"]'
    );
    expect(add).not.toBeNull();
    expect(add.disabled).toBeFalse();

    add.click();
    fixture.detectChanges();

    // AC-2: one press, one EMPTY row, at the end of the table and not inside the fixed list.
    expect(component['otherExpenseRows'].length).toBe(1);
    expect(component['visibleExpenseRows'].map((r) => r.category).slice(-1)).toEqual(['OTHER']);
    const label: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="settlement-other-label-0"]'
    );
    expect(label.value).toBe('');
    // AC-3: the server's own @Size(max = 100) (OBRS-1363), said on the box so a long name cannot
    // take the whole day's all-or-nothing submit down with it.
    expect(label.maxLength).toBe(100);

    add.click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid^="settlement-other-row-"]').length
    ).toBe(2);
  });

  it('OBRS-1903 AC-5: two rows send two lines, each under its OWN name, and an empty one is dropped', async () => {
    await setUp();
    pickVehicle();

    component['addOtherRow']();
    component['addOtherRow']();
    component['addOtherRow']();
    const [wash, parcel, blank] = component['otherExpenseRows'];
    wash.otherLabelInput = 'ค่าล้างรถ';
    wash.amountInput = '300';
    parcel.otherLabelInput = 'ค่าส่งของ';
    parcel.amountInput = '120.50';
    expect(blank.amountInput).toBe('');
    fixture.detectChanges();

    expect(component['blockedReasonKey']).toBeNull();
    // Read BEFORE the submit: a success clears the screen (`resetEntryState`), so this total only
    // has an answer while the day is still up. Both amounts reach it: wage 600 + 300 + 120.50.
    expect(component['settlementTotal']).toBe(1020.5);

    component['onSubmit']();

    const payload = api.postDriverCashDaySettle.calls.mostRecent()
      .args[0] as DriverCashDaySettleReqDto;
    const others = payload.expenses.filter((e) => e.category === 'OTHER');
    // The whole card in one assertion: two free-text costs the report can tell apart, rather than
    // one lump with both of them explained in a note.
    expect(others.map((e) => [e.categoryOtherLabel, e.amount])).toEqual([
      ['ค่าล้างรถ', '300'],
      ['ค่าส่งของ', '120.50'],
    ]);
    // The blank row is a cost that did not happen, not a zero-baht one.
    expect(others.length).toBe(2);
    // The label rides ONLY the rows allowed to carry one - `isCategoryOtherLabelValid` 400s the
    // whole submit if any other row has it.
    expect(
      payload.expenses.every((e) => (e.category === 'OTHER' ? true : !e.categoryOtherLabel))
    ).toBeTrue();
  });

  it('OBRS-1903 AC-3: the X takes out the row it sits on - the FIRST one included - down to none', async () => {
    await setUp();
    pickVehicle();

    component['addOtherRow']();
    component['addOtherRow']();
    component['otherExpenseRows'][0].otherLabelInput = 'ค่าล้างรถ';
    component['otherExpenseRows'][1].otherLabelInput = 'ค่าส่งของ';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // The first row's X. A table keyed by category could not tell this row from the second, and
    // whichever it removed, the survivor would come back holding the wrong name.
    (
      fixture.nativeElement.querySelector(
        '[data-testid="settlement-other-remove-0"]'
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component['otherExpenseRows'].map((r) => r.otherLabelInput)).toEqual(['ค่าส่งของ']);
    expect(
      (
        fixture.nativeElement.querySelector(
          '[data-testid="settlement-other-label-0"]'
        ) as HTMLInputElement
      ).value
    ).toBe('ค่าส่งของ');

    (
      fixture.nativeElement.querySelector(
        '[data-testid="settlement-other-remove-0"]'
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    // Down to zero, which is the AC-1 screen again.
    expect(component['otherExpenseRows'].length).toBe(0);
    expect(component['visibleExpenseRows'].some((r) => r.category === 'OTHER')).toBeFalse();
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid^="settlement-other-row-"]').length
    ).toBe(0);
  });

  it('OBRS-1903 AC-4: the button stops at 15 - the quota the server actually leaves, not 16', async () => {
    await setUp();
    pickVehicle();

    for (let i = 0; i < 15; i += 1) {
      component['addOtherRow']();
    }
    fixture.detectChanges();

    expect(component['otherExpenseRows'].length).toBe(15);
    expect(component['canAddOtherRow']).toBeFalse();
    expect(
      (
        fixture.nativeElement.querySelector(
          '[data-testid="settlement-add-other"]'
        ) as HTMLButtonElement
      ).disabled
    ).toBeTrue();
    expect(fixture.nativeElement.querySelector('[data-testid="settlement-other-full"]')).not.toBeNull();

    // A press that lands anyway - a stale click, a keyboard repeat - adds nothing.
    component['addOtherRow']();
    expect(component['otherExpenseRows'].length).toBe(15);

    // WHY 15 and not the 16 the card estimated: `DriverCashDaySettleReqDto.expenses` is
    // @Size(max = 20) over the WHOLE list, and a day that used every fixed row has already spent
    // five of those slots - DRIVER_WAGE travels on every submit even though the server is what
    // prices it (OBRS-1356). Filling the screen right up proves the payload lands ON the bound.
    component['otherExpenseRows'].forEach((row, index) => {
      row.otherLabelInput = `รายการที่ ${index + 1}`;
      row.amountInput = '10';
    });
    for (const category of ['FUEL', 'TOLL', 'PERMIT_FEE', 'PARKING_FEE']) {
      component['expenseRows'].find((r) => r.category === category)!.amountInput = '50';
    }
    fixture.detectChanges();
    expect(component['blockedReasonKey']).toBeNull();

    component['onSubmit']();
    const payload = api.postDriverCashDaySettle.calls.mostRecent()
      .args[0] as DriverCashDaySettleReqDto;
    expect(payload.expenses.length).toBe(20);
    expect(payload.expenses.filter((e) => e.category === 'OTHER').length).toBe(15);
  });

  it('OBRS-1903 AC-6: a half-filled row ANYWHERE in the list blocks the submit, and says which row', async () => {
    await setUp();
    pickVehicle();

    component['addOtherRow']();
    component['addOtherRow']();
    const [first, second] = component['otherExpenseRows'];
    first.otherLabelInput = 'ค่าล้างรถ';
    first.amountInput = '300';
    // The SECOND row is the broken one. A gate that asks only the first row - the shape this
    // screen had while there was only ever one - passes this day straight into the server's 400,
    // which refuses the WHOLE submit rather than the row.
    second.amountInput = '120';
    fixture.detectChanges();

    expect(component['blockedReasonKey']).toBe('STAFF.SETTLEMENT.EXPENSES.OTHER_INCOMPLETE');
    expect(
      fixture.nativeElement.querySelector('[data-testid="settlement-other-incomplete-1"]')
    ).not.toBeNull();
    // Named on the row that is wrong, and only there.
    expect(
      fixture.nativeElement.querySelector('[data-testid="settlement-other-incomplete-0"]')
    ).toBeNull();

    // The other direction of the same rule: a name with no amount is refused too.
    second.amountInput = '';
    second.otherLabelInput = 'ค่าส่งของ';
    fixture.detectChanges();
    expect(component['blockedReasonKey']).toBe('STAFF.SETTLEMENT.EXPENSES.OTHER_INCOMPLETE');

    second.amountInput = '120';
    fixture.detectChanges();
    expect(component['blockedReasonKey']).toBeNull();
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid^="settlement-other-incomplete-"]').length
    ).toBe(0);
  });

  it('OBRS-1903 AC-7: an amended day re-opens with ONE row per OTHER entry that was sent', async () => {
    // The failure this pins: keyed by category the two collapse into whichever arrived last, the
    // amend submit carries one line instead of two, and the day is settled 300 short with nothing
    // on the screen having said so.
    await setUp(
      context({
        alreadySettled: true,
        lastSubmission: {
          businessDate: '2026-09-08',
          vehicleId: 3,
          driverId: 44,
          expenses: [
            { category: 'DRIVER_WAGE', amount: null, note: null },
            { category: 'FUEL', amount: '500', note: null },
            { category: 'OTHER', amount: '300', note: 'จ่ายสด', categoryOtherLabel: 'ค่าล้างรถ' },
            { category: 'OTHER', amount: '120.50', note: null, categoryOtherLabel: 'ค่าส่งของ' },
          ],
          repairBills: [],
        },
      })
    );
    pickVehicle();

    expect(
      component['otherExpenseRows'].map((r) => [r.otherLabelInput, r.amountInput, r.noteInput])
    ).toEqual([
      ['ค่าล้างรถ', '300', 'จ่ายสด'],
      ['ค่าส่งของ', '120.50', ''],
    ]);
    // The fixed rows come back on their own figures and carry no label of their own - one on a
    // fixed row is the other payload the server refuses outright.
    expect(component['expenseRows'].find((r) => r.category === 'FUEL')!.amountInput).toBe('500');
    expect(component['expenseRows'].find((r) => r.category === 'FUEL')!.otherLabelInput).toBe('');
    expect(component['blockedReasonKey']).toBeNull();
    // wage 600 + fuel 500 + 300 + 120.50 - the amend charges the box every line it re-opened on,
    // and like AC-5 this is read before the submit clears the screen.
    expect(component['settlementTotal']).toBe(1520.5);

    component['onSubmit']();
    const payload = api.postDriverCashDaySettle.calls.mostRecent()
      .args[0] as DriverCashDaySettleReqDto;
    expect(
      payload.expenses.filter((e) => e.category === 'OTHER').map((e) => e.categoryOtherLabel)
    ).toEqual(['ค่าล้างรถ', 'ค่าส่งของ']);
  });
});
