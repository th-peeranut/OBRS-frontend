import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { catchError, map, switchMap, takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';

import { StaffApiService } from '../../../../services/staff/staff-api.service';
import {
  AdminExpensePayeeDto,
  AdminMaintenancePartDto,
  AdminVehicleDto,
  DriverDto,
} from '../../../../services/admin/admin-api.service';
import { StaffSchedulesStore } from '../staff-schedules/staff-schedules.store';
import { ExpensePayeesStore } from '../../../admin/pages/expense-payees/expense-payees.store';
import { sortPayeesByName } from '../../../admin/pages/expense-payees/expense-payees.mappers';
import { MaintenancePartsStore } from '../../../admin/pages/maintenance-parts/maintenance-parts.store';
import { sortMaintenancePartsByName } from '../../../admin/pages/maintenance-parts/maintenance-parts.mappers';
import {
  buildFieldRepairBillGroup,
  toFieldRepairBillItems,
} from '../../../admin/pages/expenses/expense-bill-card/expense-bill-card.component';
import {
  ExpenseItemFormValue,
  expenseItemsTotal,
  toIsoDateString,
} from '../../../admin/pages/expenses/expenses-page.mappers';
import {
  DriverCashDayContextRespDto,
  DriverCashDayContextScheduleDto,
  DriverCashDayRespDto,
  DriverCashDaySettleExpenseReqDto,
  DriverCashDaySettleReqDto,
  DriverCashDaySettleRepairBillReqDto,
  DRIVER_CASH_NO_SCHEDULES_ERROR_CODE,
} from '../../../../shared/interfaces/driver-cash.interface';
import { extractApiErrorCode, mapApiErrorCode } from '../../../../shared/lib/api-error-code';
import { generateIdempotencyKey } from '../../../../shared/lib/idempotency-key';
import { toCents } from '../../../../shared/lib/money-cents';
import { formatMoney } from '../../../../shared/lib/money-display';
import { formatDisplayDate, formatDisplayTime } from '../../../../shared/lib/display-date-time';

/** OBRS-1356 — the one category the SERVER prices, from the owner's rate per leg. Row #1 and
 * read-only: the client sends no amount at all for it. */
const WAGE_CATEGORY = 'DRIVER_WAGE';

/** OBRS-1363 — the overnight park, and the one conditional row: offered only when the day's
 * `parkingFeeEligible` is true (owner: "ค่าจอดรถขึ้นเฉพาะรถที่ออกเที่ยวแรก"). */
const PARKING_FEE_CATEGORY = 'PARKING_FEE';

/**
 * OBRS-1756 — the settlement screen's expense rows, in the owner's order.
 *
 * <p>A FIXED SET, deliberately not a category dropdown. The per-round form
 * (`driver-cash-expense-form`) asks "which cost is this?" because it records one cost at a time;
 * this screen settles a whole day, where the question is "how much of each?", and a dropdown would
 * make the salesperson re-open the same control four times to answer it.
 *
 * <p>Every code here is already in that form's `DRIVER_CASH_EXPENSE_CATEGORIES`, so the backend's
 * `ALLOWED_CATEGORIES` accepts all five and the office's `verify-field-expense-categories.ps1`
 * comparison is unaffected. `OTHER` and `REPAIR` are absent on purpose: `REPAIR` has the bill box
 * below (OBRS-1630), and `OTHER` needs a free-text label this screen's fixed rows have nowhere to
 * put.
 */
const SETTLEMENT_EXPENSE_CATEGORIES: readonly string[] = [
  WAGE_CATEGORY,
  'FUEL',
  'TOLL',
  'PERMIT_FEE',
  PARKING_FEE_CATEGORY,
];

/**
 * Codes worth naming. `GENERIC`'s "please try again" is advice that cannot work for any of these:
 * the rate is the owner's to set, the box is signed off, the day has no rounds behind it at all.
 * Every key but the last already exists — reused rather than duplicated under `STAFF.SETTLEMENT.*`.
 */
const SETTLE_ERROR_KEYS: Record<string, string> = {
  DRIVER_WAGE_RATE_NOT_CONFIGURED: 'STAFF.DRIVER_CASH.ERROR.WAGE_RATE_NOT_CONFIGURED',
  DRIVER_CASH_SALES_POINT_FORBIDDEN: 'STAFF.DRIVER_CASH.ERROR.SALES_POINT_FORBIDDEN',
  DRIVER_CASH_DAY_ALREADY_RETURNED: 'STAFF.DRIVER_CASH.ERROR.DAY_ALREADY_RETURNED',
  DRIVER_CASH_REPAIR_BILL_ZERO_TOTAL: 'STAFF.DRIVER_CASH.ERROR.REPAIR_BILL_ZERO_TOTAL',
  [DRIVER_CASH_NO_SCHEDULES_ERROR_CODE]: 'STAFF.SETTLEMENT.ERROR.NO_SCHEDULES',
};

/** One editable cost line. Plain fields rather than a FormGroup: these rows have no cross-field
 * rule, and a form rebuilt on every context load is how mid-edit values get orphaned. */
interface SettlementExpenseRow {
  category: string;
  amountInput: string;
  noteInput: string;
}

interface DayContextRequest {
  businessDate: string;
  vehicleId: number;
  driverId: number | null;
}

/** Yesterday, as a LOCAL calendar Date. AC-3: the counter settles the day that has finished, and
 * a staff device runs on Bangkok time — `toISOString()` would shift the date back for the whole
 * evening (the `todayBusinessDate` precedent on `driver-cash-panel`). */
function yesterday(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * OBRS-1756 — `/staff/settlement`: settle a driver's whole day for one van in one submit.
 *
 * <p>Replaces the "งานประจำรอบ" nav item. The `/staff/boarding` routes it used to open are
 * untouched and still reached from ตารางเดินรถ and ตารางของฉัน — this screen is about money for a
 * DAY, that one is about passengers on a ROUND, and the owner's ruling was that the counter never
 * wanted the round-by-round door for the settling job.
 *
 * <p><b>Nothing here re-implements what already exists.</b> The pill bar is
 * `app-driver-cash-day-summary`, each repair bill is `app-expense-bill-card` in its `field`
 * variant (the same component `driver-cash-repair-form` embeds, with the same
 * `buildFieldRepairBillGroup`/`toFieldRepairBillItems` pair), the plate/driver lists come from the
 * root-scoped `StaffSchedulesStore` that already answers exactly that question for a salesperson,
 * and the garage/part registries come from their own shared stores. The multi-row expense table is
 * the one genuinely new piece of form, and the owner acknowledged it as such — the per-round
 * `driver-cash-expense-form` submits one row at a time and stays untouched for
 * `/staff/boarding/:scheduleId`.
 */
@Component({
  selector: 'app-driver-settlement-page',
  templateUrl: './driver-settlement-page.component.html',
  styleUrl: './driver-settlement-page.component.scss',
  standalone: false,
})
export class DriverSettlementPageComponent implements OnInit, OnDestroy {
  // ── Selection ────────────────────────────────────────────────────────────
  protected selectedDate: Date = yesterday();
  /** Stringified ids: `app-admin-dropdown` is a string-valued control (the per-head form's
   * `selectedStopId` is the precedent). Converted back with `Number()` at request time. */
  protected selectedVehicleId = '';
  protected selectedDriverId = '';

  protected vehicles: AdminVehicleDto[] = [];
  protected drivers: DriverDto[] = [];

  // ── Day context ──────────────────────────────────────────────────────────
  protected context: DriverCashDayContextRespDto | null = null;
  protected isContextLoading = false;
  protected contextError: string | null = null;

  // ── Expense rows + repair bills ──────────────────────────────────────────
  protected expenseRows: SettlementExpenseRow[] = [];
  protected repairBills: FormGroup[] = [];
  protected payees: AdminExpensePayeeDto[] = [];
  protected parts: AdminMaintenancePartDto[] = [];

  // ── Submit ───────────────────────────────────────────────────────────────
  protected isSubmitting = false;
  protected submitError: string | null = null;
  protected settleSuccess = false;
  protected settledDay: DriverCashDayRespDto | null = null;

  /**
   * The key in flight, and the payload it belongs to.
   *
   * <p>One key per ATTEMPT OF THE SAME CONTENT (owner ruling, spec §4): minted when submit is
   * first pressed, REUSED verbatim when the same payload is submitted again — so a network retry
   * replays the server's stored response instead of writing the day twice — and dropped after a
   * success or whenever the payload changes.
   *
   * <p>The signature is `JSON.stringify` over a payload whose optional values are explicit `null`.
   * That is load-bearing: `JSON.stringify` DROPS `undefined` keys, so a payload built with
   * `undefined` for "no note" would serialize identically to one built without the field, and two
   * materially different days could share one key.
   */
  private pendingIdempotencyKey: string | null = null;
  private pendingPayloadSignature: string | null = null;

  private readonly contextRequest$ = new Subject<DayContextRequest>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly staffApiService: StaffApiService,
    private readonly schedulesStore: StaffSchedulesStore,
    private readonly payeesStore: ExpensePayeesStore,
    private readonly partsStore: MaintenancePartsStore,
    private readonly formBuilder: FormBuilder,
    private readonly translate: TranslateService
  ) {
    this.resetExpenseRows();
  }

  ngOnInit(): void {
    // The shared, root-scoped store the sell page and ตารางเดินรถ already use — stale-while-
    // revalidate, so a salesperson who has opened either this session paints from cache. Its
    // drivers come from the SALESPERSON-readable /private/users/drivers, which is why this screen
    // does not reach for AdminApiService.getUsers().
    this.schedulesStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.vehicles = data?.vehicles ?? [];
      this.drivers = data?.drivers ?? [];
    });
    void this.schedulesStore.refresh();

    this.payeesStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.payees = sortPayeesByName((data ?? []).filter((payee) => payee.active));
    });
    void this.payeesStore.refresh();

    this.partsStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.parts = sortMaintenancePartsByName((data ?? []).filter((part) => part.active));
    });
    void this.partsStore.refresh();

    // switchMap, not mergeMap: changing the van while the previous answer is in flight must
    // CANCEL it, or the later, slower response for the old van overwrites the new one's.
    this.contextRequest$
      .pipe(
        switchMap((request) =>
          this.staffApiService
            .getDriverCashDayContext(request.businessDate, request.vehicleId, request.driverId)
            .pipe(
              map((response) => ({
                context: response?.data ?? null,
                error: null as unknown,
              })),
              catchError((error: unknown) => of({ context: null, error }))
            )
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(({ context, error }) => this.applyContext(context, error));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Options ──────────────────────────────────────────────────────────────

  /**
   * ⛔ The BARE stored `number_plate` (`16-8747`), never re-formatted and never given a province.
   * It is a unique key and the back-dated bill importer matches on it, so a plate this screen
   * "tidied" would stop matching the row it names.
   */
  protected get vehicleOptions(): { value: string; label: string }[] {
    return this.vehicles
      .filter((vehicle) => !!vehicle.numberPlate)
      .map((vehicle) => ({ value: String(vehicle.id), label: String(vehicle.numberPlate) }));
  }

  protected get driverOptions(): { value: string; label: string }[] {
    return this.drivers.map((driver) => ({ value: String(driver.id), label: driver.name }));
  }

  // ── Selection handlers ───────────────────────────────────────────────────

  protected onDateChange(value: Date | null): void {
    this.selectedDate = value ?? yesterday();
    // A different day is a different set of numbers; keeping what was typed would silently file
    // yesterday's fuel against today. The DRIVER choice survives, though — the same person is
    // usually being settled for several days in a row, and re-deriving the van's default here
    // would throw away an override the salesperson had just made on purpose.
    this.resetEntryState();
    this.requestContext(this.selectedDriverId ? Number(this.selectedDriverId) : null);
  }

  /**
   * A new van drops the driver choice and asks the server who drives it — the answer prefills the
   * dropdown. `vehicles.assigned_driver_id` is "A DEFAULT, NOT A RESTRICTION" (V88, OBRS-1332), so
   * the field stays fully editable afterwards; design-system §3.1's no-pre-seeded-default rule
   * yields here because the spec explicitly requires the prefill.
   */
  protected onVehicleChange(value: string): void {
    this.selectedVehicleId = value;
    this.selectedDriverId = '';
    this.resetEntryState();
    this.requestContext(null);
  }

  protected onDriverChange(value: string): void {
    this.selectedDriverId = value;
    this.resetEntryState();
    this.requestContext(value ? Number(value) : null);
  }

  private requestContext(driverId: number | null): void {
    if (!this.selectedVehicleId) {
      this.context = null;
      this.contextError = null;
      this.isContextLoading = false;
      return;
    }
    this.isContextLoading = true;
    this.contextError = null;
    this.contextRequest$.next({
      businessDate: this.businessDate,
      vehicleId: Number(this.selectedVehicleId),
      driverId,
    });
  }

  private applyContext(context: DriverCashDayContextRespDto | null, error: unknown): void {
    this.isContextLoading = false;
    this.context = context;
    if (error) {
      this.contextError = this.mapError(error);
      return;
    }
    this.contextError = null;
    // The server resolved the driver (the vehicle's assigned one when we sent none). Assigned
    // directly rather than pushed through onDriverChange, which would fire a second request for
    // the answer we are already holding.
    if (context?.driverId != null) {
      this.selectedDriverId = String(context.driverId);
    }
  }

  // ── Derived view state ───────────────────────────────────────────────────

  protected get businessDate(): string {
    return toIsoDateString(this.selectedDate);
  }

  protected get schedules(): DriverCashDayContextScheduleDto[] {
    return this.context?.schedules ?? [];
  }

  /** The box as it stands: the settle response once there is one, else the context's own copy. */
  protected get day(): DriverCashDayRespDto | null {
    return this.settledDay ?? this.context?.day ?? null;
  }

  /** OBRS-960 — the advance is READ ONLY here; it is taken at the round, not at settlement. */
  protected get advanceEntries() {
    return (this.day?.entries ?? []).filter((entry) => entry.type === 'ADVANCE');
  }

  /**
   * OBRS-1579 — a box the owner re-opened after signing it off must NEVER read as an ordinary one
   * (AC-6). `driver-cash-panel` renders nothing for this, so the badge and the reason line are
   * this screen's, built from the `reopens[]` the day response already carries.
   */
  protected get isReopened(): boolean {
    return (this.day?.reopenCount ?? 0) > 0;
  }

  /** Newest re-open — `reopens` is oldest first. */
  protected get latestReopenReason(): string | null {
    const reopens = this.day?.reopens ?? [];
    return reopens.length > 0 ? reopens[reopens.length - 1].reason : null;
  }

  protected get isDayReturned(): boolean {
    return this.day?.status === 'RETURNED';
  }

  protected get isWageRateMissing(): boolean {
    return this.context !== null && !this.context.driverWageRateConfigured;
  }

  protected get hasNoSchedules(): boolean {
    return this.context !== null && this.context.legCount === 0;
  }

  /** Rows the day actually offers: the parking fee only where the van ran a route's first round. */
  protected get visibleExpenseRows(): SettlementExpenseRow[] {
    const parkingEligible = this.context?.parkingFeeEligible === true;
    return this.expenseRows.filter(
      (row) => row.category !== PARKING_FEE_CATEGORY || parkingEligible
    );
  }

  protected isWageRow(row: SettlementExpenseRow): boolean {
    return row.category === WAGE_CATEGORY;
  }

  /**
   * Typed something that is not a money value. `toCents` accepts only
   * `^\d+(\.\d{1,2})?$`, so `1,200`, `฿1200`, `12.345` and `-50` all read as null — and
   * `buildPayload` SKIPS a null row. Without this the one submit would settle the day with that
   * cost silently missing, and `alreadySettled` then stands in the way of a clean redo. Said the
   * same way the per-round `driver-cash-expense-form` has always said it (OBRS-960:
   * `VALIDATION.AMOUNT_INVALID` under the field plus a refused button), reusing that key rather
   * than minting a second wording for the same rule.
   */
  protected isAmountInvalid(row: SettlementExpenseRow): boolean {
    return row.amountInput.trim().length > 0 && toCents(row.amountInput) === null;
  }

  protected categoryLabel(category: string): string {
    return this.translate.instant(`ADMIN.EXPENSES.CATEGORIES.${category}`);
  }

  protected billTotal(bill: FormGroup): number {
    const items = (bill.get('items') as FormArray).getRawValue() as ExpenseItemFormValue[];
    return expenseItemsTotal(items);
  }

  protected formatMoney(value: number | string | null | undefined): string {
    return formatMoney(value, this.translate.currentLang);
  }

  protected displayDate(value: string | null | undefined): string {
    return formatDisplayDate(value, this.translate.currentLang);
  }

  protected displayTime(value: string | null | undefined): string {
    return formatDisplayTime(value);
  }

  // ── Repair bills ─────────────────────────────────────────────────────────

  /** 0..N, and it starts at 0: most days have no repair at all, and a blank bill on screen is a
   * bill the salesperson has to notice and delete. */
  protected addRepairBill(): void {
    this.repairBills = [...this.repairBills, buildFieldRepairBillGroup(this.formBuilder)];
  }

  protected removeRepairBill(index: number): void {
    this.repairBills = this.repairBills.filter((_bill, position) => position !== index);
  }

  /** Keeps the OTHER bills' pickers in step with a garage/part added from one of them. */
  protected onPayeeCreated(): void {
    void this.payeesStore.refresh();
  }

  protected onPartCreated(): void {
    void this.partsStore.refresh();
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  /**
   * Every reason the ONE button on this screen is refused, all of them things the server would
   * refuse too — said before the press rather than after it.
   */
  protected get blockedReasonKey(): string | null {
    if (!this.selectedVehicleId || !this.selectedDriverId) {
      return 'STAFF.SETTLEMENT.BLOCKED.PICK_VEHICLE_DRIVER';
    }
    if (this.hasNoSchedules) {
      return 'STAFF.SETTLEMENT.BLOCKED.NO_SCHEDULES';
    }
    if (this.isWageRateMissing) {
      return 'STAFF.DRIVER_CASH.ERROR.WAGE_RATE_NOT_CONFIGURED';
    }
    if (this.isDayReturned) {
      return 'STAFF.DRIVER_CASH.ERROR.DAY_ALREADY_RETURNED';
    }
    // Before the repair check, because an unparseable amount is the silent one: the row would be
    // dropped from the payload and from the total, and the day would settle short.
    if (this.visibleExpenseRows.some((row) => this.isAmountInvalid(row))) {
      return 'STAFF.DRIVER_CASH.VALIDATION.AMOUNT_INVALID';
    }
    if (this.repairBills.some((bill) => !bill.valid || this.billTotal(bill) <= 0)) {
      return 'STAFF.SETTLEMENT.BLOCKED.INVALID_REPAIR_BILL';
    }
    return null;
  }

  protected get canSubmit(): boolean {
    return (
      !this.isSubmitting &&
      !this.isContextLoading &&
      this.contextError === null &&
      this.blockedReasonKey === null
    );
  }

  /** What the counter is about to charge the box, wage included. */
  protected get settlementTotal(): number {
    const wage = Number(this.context?.driverWageTotal ?? 0);
    const typed = this.visibleExpenseRows
      .filter((row) => !this.isWageRow(row))
      .reduce((sum, row) => sum + (toCents(row.amountInput) ?? 0), 0);
    const bills = this.repairBills.reduce((sum, bill) => sum + this.billTotal(bill), 0);
    return wage + typed / 100 + bills;
  }

  protected onSubmit(): void {
    if (!this.canSubmit) return;
    const payload = this.buildPayload();
    if (!payload) return;

    const signature = JSON.stringify(payload);
    if (this.pendingIdempotencyKey === null || this.pendingPayloadSignature !== signature) {
      this.pendingIdempotencyKey = generateIdempotencyKey();
      this.pendingPayloadSignature = signature;
    }

    this.isSubmitting = true;
    this.submitError = null;
    this.staffApiService
      .postDriverCashDaySettle(payload, this.pendingIdempotencyKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isSubmitting = false;
          // resetEntryState() drops the spent key — the next submit is a NEW settlement and must
          // not replay this one — so the settled box is recorded AFTER it, not before.
          this.resetEntryState();
          this.settledDay = response?.data ?? null;
          this.settleSuccess = true;
          this.requestContext(this.selectedDriverId ? Number(this.selectedDriverId) : null);
        },
        error: (error: unknown) => {
          this.isSubmitting = false;
          // The key and its signature are KEPT: pressing submit again on the same payload replays
          // the server's answer rather than writing the day a second time.
          this.submitError = this.mapError(error);
        },
      });
  }

  /** Null only when the guards above were bypassed — the button cannot reach it. */
  private buildPayload(): DriverCashDaySettleReqDto | null {
    if (!this.selectedVehicleId || !this.selectedDriverId) return null;

    const expenses: DriverCashDaySettleExpenseReqDto[] = [];
    for (const row of this.visibleExpenseRows) {
      if (this.isWageRow(row)) {
        // OBRS-1356: no amount. The server writes one entry per schedule at the rate in force,
        // and a number sent here is a number it discards.
        expenses.push({ category: row.category, amount: null, note: null });
        continue;
      }
      const cents = toCents(row.amountInput);
      // An untyped row is not a zero-baht cost — it is a cost that did not happen, and writing it
      // would put a 0.00 line into the per-vehicle P&L that nobody can tell from a real one.
      if (cents === null || cents <= 0) continue;
      const note = row.noteInput.trim();
      expenses.push({
        category: row.category,
        amount: row.amountInput.trim(),
        note: note || null,
      });
    }

    const repairBills: DriverCashDaySettleRepairBillReqDto[] = this.repairBills.map((bill) => {
      const raw = bill.getRawValue() as { payeeId: number; items: ExpenseItemFormValue[] };
      return {
        payeeId: raw.payeeId,
        note: null,
        items: toFieldRepairBillItems(raw.items),
      };
    });

    return {
      businessDate: this.businessDate,
      vehicleId: Number(this.selectedVehicleId),
      driverId: Number(this.selectedDriverId),
      expenses,
      repairBills,
    };
  }

  private resetExpenseRows(): void {
    this.expenseRows = SETTLEMENT_EXPENSE_CATEGORIES.map((category) => ({
      category,
      amountInput: '',
      noteInput: '',
    }));
  }

  /** Everything typed for the previous (date, van, driver) — never carried across a selection. */
  private resetEntryState(): void {
    this.resetExpenseRows();
    this.repairBills = [];
    this.submitError = null;
    this.settleSuccess = false;
    this.settledDay = null;
    this.pendingIdempotencyKey = null;
    this.pendingPayloadSignature = null;
  }

  private mapError(error: unknown): string {
    return mapApiErrorCode(
      extractApiErrorCode(error, null),
      SETTLE_ERROR_KEYS,
      'STAFF.DRIVER_CASH.ERROR.GENERIC'
    );
  }
}
