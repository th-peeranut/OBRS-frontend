import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminOwnerDto,
  AdminVehicleDto,
  CreateExpensePayload,
} from '../../../../../services/admin/admin-api.service';
import { AdminExpensePayeeDto } from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { trimmedRequiredValidator } from '../../../../../shared/validators/trimmed-required.validator';
import { AuthService } from '../../../../../auth/auth.service';
import { VehiclesStore } from '../../vehicles/vehicles.store';
import { ExpensePayeesStore } from '../../expense-payees/expense-payees.store';
import { sortPayeesByName } from '../../expense-payees/expense-payees.mappers';
import { ExpensesStore } from '../expenses.store';
import { buildBillGroup } from '../expense-bill-card/expense-bill-card.component';
import {
  ExpenseFormValue,
  ExpenseItemFormValue,
  Option,
  expenseItemsTotal,
  toExpenseCategoryOptions,
  toExpensePayload,
  toExpenseVehicleOptions,
  toOwnerOptions,
} from '../expenses-page.mappers';

/**
 * OBRS-1576: the envelope screen — `/admin/expenses/batch`.
 *
 * <p>The owner is not handed one repair bill at a time; a garage gives him the month in a stack.
 * Until this card the only way to record that was the single-bill modal, opened once per slip, with
 * the header retyped every time. This page takes the stack: N bills, one `บันทึกทั้งซอง`, one
 * transaction on the server (AC3), so the outcome is never "two of your three went in".
 *
 * <p><b>It does not replace the modal.</b> `เพิ่มค่าใช้จ่าย` on the expense log still opens it, and
 * still writes the fields this screen hides. One loose bill through a page built for a stack is
 * more work, not less.
 *
 * <p>Dumb-children split, same as `ExpensesPageComponent`: this owns the form array, the option
 * lists and the one API call; `ExpenseBillCardComponent` renders a bill and knows nothing about
 * saving.
 */
@Component({
    selector: 'app-expense-batch-page',
    templateUrl: './expense-batch-page.component.html',
    styleUrl: './expense-batch-page.component.scss',
    standalone: false
})
export class ExpenseBatchPageComponent implements OnInit, OnDestroy {
  protected readonly envelopeForm: FormGroup;

  protected vehicleOptions: Option[] = [];
  protected categoryOptions: Option[] = [];
  protected ownerOptions: Option[] = [];
  protected payeeOptions: AdminExpensePayeeDto[] = [];

  /** Which bills are folded, by position. A parallel array rather than a control, because it is
   * about the screen and not about the bill — reordering never happens here, and a `collapsed` flag
   * inside the form group would end up on the wire. */
  protected collapsed: boolean[] = [];

  protected isSubmitting = false;

  /** OBRS-808's two flags, verbatim: an ADMIN must NAME the operator (the server derives it for
   * everyone else and ignores what they send), and an ADMIN cannot CREATE a payee because
   * `getCurrentOwnerId()` throws for them. */
  protected readonly isAdmin: boolean;
  protected readonly canCreatePayee: boolean;

  private rawVehicles: AdminVehicleDto[] = [];
  private rawOwners: AdminOwnerDto[] = [];
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly expensesStore: ExpensesStore,
    private readonly vehiclesStore: VehiclesStore,
    private readonly payeesStore: ExpensePayeesStore
  ) {
    this.isAdmin = this.authService.getRoles().includes('admin');
    this.canCreatePayee = this.authService.hasHeldRole(['owner']);

    this.envelopeForm = this.formBuilder.group({
      // Registered unconditionally, validated conditionally — the control has to exist before the
      // template reads it, and one that is never rendered must never block save.
      ownerSelection: [''],
      bills: this.formBuilder.array([this.newBill()]),
    });
    if (this.isAdmin) {
      const ownerSelection = this.envelopeForm.get('ownerSelection')!;
      ownerSelection.setValidators([Validators.required]);
      // setValidators REGISTERS the rule; it does not re-run it. Without this the control keeps the
      // VALID status it was constructed with, and an admin's empty operator sails through submit to
      // the 400 this control exists to prevent.
      ownerSelection.updateValueAndValidity({ emitEvent: false });
    }

    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => this.applyLocalization())
    );
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.vehiclesStore.data$.subscribe((data) => {
        this.rawVehicles = data?.vehicles ?? [];
        this.applyLocalization();
      })
    );
    this.subscriptions.add(
      this.payeesStore.data$.subscribe((data) => {
        this.payeeOptions = sortPayeesByName((data ?? []).filter((payee) => payee.active));
      })
    );

    void this.vehiclesStore.refresh();
    void this.payeesStore.refresh();
    if (this.isAdmin) {
      void this.loadOwners();
    }
    this.collapsed = [false];
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected get billsArray(): FormArray {
    return this.envelopeForm.get('bills') as FormArray;
  }

  protected get billForms(): FormGroup[] {
    return this.billsArray.controls as FormGroup[];
  }

  /** AC1: the envelope's own running numbers, so the owner can check the screen against the stack
   * before pressing save rather than against the log afterwards. */
  protected get envelopeTotal(): number {
    return this.billForms.reduce((sum, bill) => sum + this.billTotal(bill), 0);
  }

  protected get envelopeLineCount(): number {
    return this.billForms.reduce((count, bill) => count + this.itemsOf(bill).length, 0);
  }

  protected addBill(): void {
    // Folding the one just finished is what keeps a ten-slip envelope readable; the new bill opens
    // in its place, which is where the eye already is.
    this.collapsed = this.collapsed.map(() => true);
    this.billsArray.push(this.newBill());
    this.collapsed.push(false);
  }

  protected removeBill(index: number): void {
    this.billsArray.removeAt(index);
    this.collapsed.splice(index, 1);
  }

  protected toggleCollapse(index: number): void {
    this.collapsed[index] = !this.collapsed[index];
  }

  protected onPayeeCreated(): void {
    void this.payeesStore.refresh();
  }

  protected trackByIndex(index: number): number {
    return index;
  }

  protected cancel(): void {
    void this.router.navigate(['/admin/expenses']);
  }

  /**
   * AC3: one request, one transaction. An invalid envelope never leaves the browser — the server
   * would refuse it anyway and the round trip buys nothing but a slower "no".
   *
   * <p>A failure UNFOLDS every bill before showing the message. The server's error names which bill
   * (`expense.error.batch-bill-failed`), and pointing at "bill 2" while bill 2 is a folded one-line
   * summary tells the owner where to look and then hides it.
   */
  protected async submitEnvelope(): Promise<void> {
    if (this.envelopeForm.invalid) {
      this.envelopeForm.markAllAsTouched();
      this.collapsed = this.collapsed.map(() => false);
      await this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isSubmitting = true;
    try {
      const bills = this.billForms.map((bill) => this.toBillPayload(bill));
      await firstValueFrom(this.adminApiService.createExpenseBatch({ bills }));
      await this.alertService.success(
        this.translate.instant('ADMIN.EXPENSES.BATCH.SAVED', { n: bills.length })
      );
      await this.expensesStore.refresh();
      await this.router.navigate(['/admin/expenses']);
    } catch (error) {
      this.collapsed = this.collapsed.map(() => false);
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   * One bill, on the wire. Goes through `toExpensePayload` — the same mapper the single-bill modal
   * uses — rather than assembling an object here, so the sentinel handling, the trimming and the
   * date format cannot drift between the two screens that write the same table.
   *
   * <p>The three fields this screen does not show are supplied as `null` at this boundary rather
   * than as controls nobody can reach: `receiptNo` and `vatAmount` because the owner ruled them off
   * the screen on 2026-08-24 (the COLUMNS stay), `note` because the approved mock has no place for
   * one. `amount` is the lines' total, not a typed number — see `ExpenseBillCardComponent#billTotal`.
   */
  private toBillPayload(bill: FormGroup): CreateExpensePayload {
    const raw = bill.getRawValue() as Partial<ExpenseFormValue>;
    return toExpensePayload({
      ...raw,
      ownerSelection: String(this.envelopeForm.get('ownerSelection')?.value ?? ''),
      amount: this.billTotal(bill),
      vatAmount: null,
      receiptNo: null,
      note: null,
    } as ExpenseFormValue);
  }

  private billTotal(bill: FormGroup): number {
    return expenseItemsTotal(this.itemsOf(bill));
  }

  private itemsOf(bill: FormGroup): ExpenseItemFormValue[] {
    return (bill.get('items') as FormArray).getRawValue() as ExpenseItemFormValue[];
  }

  /**
   * A fresh bill, plus the one cross-field rule it carries: `categoryOtherLabel` is required exactly
   * when `category` is OTHER and cleared the moment it is not, so stale free text can never be left
   * behind by switching away. Subscribed per bill because each bill has its own category.
   */
  private newBill(): FormGroup {
    const bill = buildBillGroup(this.formBuilder);
    this.subscriptions.add(
      bill.get('category')!.valueChanges.subscribe((category: string) => {
        const control = bill.get('categoryOtherLabel')!;
        if (category === 'OTHER') {
          control.setValidators([trimmedRequiredValidator, Validators.maxLength(100)]);
        } else {
          control.setValue('');
          control.clearValidators();
        }
        control.updateValueAndValidity({ emitEvent: false });
      })
    );
    return bill;
  }

  /**
   * OBRS-808: the operator roster, for the admin-only picker. A failure is NOT surfaced as a page
   * error — the roster is secondary and the required-validator already stops a save without one —
   * but it IS visible as an empty picker, which the template calls out rather than leaving as a
   * dropdown with nothing in it.
   */
  private async loadOwners(): Promise<void> {
    try {
      const response = await firstValueFrom(this.adminApiService.getOwners());
      this.rawOwners = response?.data ?? [];
    } catch {
      this.rawOwners = [];
    }
    this.applyLocalization();
  }

  private applyLocalization(): void {
    const centralLabel = this.translate.instant('ADMIN.EXPENSES.VEHICLE_CENTRAL_OPTION');
    this.categoryOptions = toExpenseCategoryOptions({
      fuel: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.FUEL'),
      repair: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.REPAIR'),
      vehicleTax: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.VEHICLE_TAX'),
      act: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.ACT'),
      insurance: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.INSURANCE'),
      inspection: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.INSPECTION'),
      tire: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.TIRE'),
      gps: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.GPS'),
      toll: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.TOLL'),
      permitFee: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.PERMIT_FEE'),
      driverWage: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.DRIVER_WAGE'),
      instalment: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.INSTALMENT'),
      parkingFee: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.PARKING_FEE'),
      parcelCompensation: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.PARCEL_COMPENSATION'),
      central: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.CENTRAL'),
      other: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.OTHER'),
    });
    this.vehicleOptions = toExpenseVehicleOptions(this.rawVehicles, centralLabel);
    this.ownerOptions = toOwnerOptions(this.rawOwners);
  }
}
