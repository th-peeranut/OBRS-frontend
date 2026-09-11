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
    expect(component['businessDate']).not.toBe(
      new Date().toISOString().slice(0, 10)
    );
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
});
