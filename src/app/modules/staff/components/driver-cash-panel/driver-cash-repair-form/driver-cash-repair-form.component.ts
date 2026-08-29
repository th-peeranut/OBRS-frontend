import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminExpensePayeeDto } from '../../../../../services/admin/admin-api.service';
import { ExpensePayeesStore } from '../../../../admin/pages/expense-payees/expense-payees.store';
import { sortPayeesByName } from '../../../../admin/pages/expense-payees/expense-payees.mappers';
import { buildFieldRepairBillGroup } from '../../../../admin/pages/expenses/expense-bill-card/expense-bill-card.component';
import {
  EXPENSE_ITEM_PART_NONE_SENTINEL,
  ExpenseItemFormValue,
  expenseItemsTotal,
  toNullableNumber,
} from '../../../../admin/pages/expenses/expenses-page.mappers';
import { DriverCashRepairBillItemReqDto } from '../../../../../shared/interfaces/driver-cash.interface';
import { formatDisplayDate } from '../../../../../shared/lib/display-date-time';

/**
 * OBRS-1630 — the `เพิ่มรายการซ่อม` box on the driver's cash panel.
 *
 * <p>The owner's ruling (2026-08-24) was a SEPARATE entry point rather than a seventh value in the
 * category dropdown, and that it look like the back-office bill screen: sub-lines, parts, and a
 * garage field. So the box IS `app-expense-bill-card` in its `field` variant — not a second bill
 * editor beside it, which is how the two would have drifted.
 *
 * <p>This component owns only what the card deliberately does not: the payee list, the submit, and
 * the total the button says out loud. The form group and the running total both come from the
 * card's own files, for the same reason the batch page takes them from there.
 */
@Component({
    selector: 'app-driver-cash-repair-form',
    templateUrl: './driver-cash-repair-form.component.html',
    styleUrl: './driver-cash-repair-form.component.scss',
    standalone: false
})
export class DriverCashRepairFormComponent implements OnInit, OnChanges, OnDestroy {
  /** The business date of the box this bill lands in — printed, never sent: the server reads the
   * date off the box itself, and saying so is what stops a morning bill going into today's box
   * unnoticed (the OBRS-1579 signpost, on this form too). */
  @Input() businessDate: string | null = null;
  @Input() isSubmitting = false;
  @Input() submitError: string | null = null;
  @Output() submitRepairBill = new EventEmitter<{
    payeeId: number;
    items: DriverCashRepairBillItemReqDto[];
  }>();

  protected billForm!: FormGroup;
  protected payees: AdminExpensePayeeDto[] = [];

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly payeesStore: ExpensePayeesStore
  ) {}

  ngOnInit(): void {
    this.billForm = buildFieldRepairBillGroup(this.formBuilder);
    // The SHARED registry cache, not a fetch of our own. This component sits behind the panel's
    // accordion, so it is destroyed and rebuilt on every open/close of `เพิ่มรายการซ่อม` — a
    // fetch in `ngOnInit` would hit the network on every toggle, and the SIT round trip is about
    // two seconds. `ExpensePayeesStore` is root-scoped and stale-while-revalidate, so a reopen
    // paints from cache and revalidates behind it, exactly as the back-office bill screen does.
    //
    // It always fetches the superset (every type, retired included) and each consumer filters —
    // see its javadoc for why a shared mutable filter would be wrong. Retired garages are dropped
    // here for the same reason the batch page drops them: the picker must never offer one. The
    // type narrowing is the picker's own `restrictToType`, which deliberately still finds a
    // non-garage payee by typing, and that is the behaviour the back-office screen has too.
    this.subscriptions.add(
      this.payeesStore.data$.subscribe((data) => {
        this.payees = sortPayeesByName((data ?? []).filter((payee) => payee.active));
      })
    );
    void this.payeesStore.refresh();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // A successful submit is the parent flipping isSubmitting back to false with no error — the
    // same signal the other three forms in this panel read. Start a blank bill then, never on a
    // failure: the lines the salesperson typed are what they would otherwise have to type again.
    if (
      changes['isSubmitting'] &&
      changes['isSubmitting'].previousValue === true &&
      !this.isSubmitting &&
      !this.submitError &&
      this.billForm
    ) {
      this.billForm = buildFieldRepairBillGroup(this.formBuilder);
    }
  }

  protected displayDate(value: string | null): string {
    return formatDisplayDate(value);
  }

  private get itemsArray(): FormArray {
    return this.billForm.get('items') as FormArray;
  }

  /** What the bill comes to, through the card's own helper — satang arithmetic, not float sums, so
   * the number on the button is the number the box is charged. */
  protected get billTotal(): number {
    return expenseItemsTotal(this.itemsArray.getRawValue() as ExpenseItemFormValue[]);
  }

  protected get canSubmit(): boolean {
    return !this.isSubmitting && this.billForm?.valid === true && this.billTotal > 0;
  }

  protected onSubmit(): void {
    if (!this.canSubmit) return;
    const raw = this.billForm.getRawValue() as {
      payeeId: number;
      items: ExpenseItemFormValue[];
    };
    this.submitRepairBill.emit({
      payeeId: raw.payeeId,
      items: raw.items.map((item) => ({
        // The part dropdown carries a sentinel for "no part"; the wire wants it absent — the same
        // translation `ExpenseBatchPageComponent#toBillPayload` makes on the back-office path.
        part:
          !item.part || item.part === EXPENSE_ITEM_PART_NONE_SENTINEL ? null : String(item.part),
        description: String(item.description ?? '').trim(),
        quantity: toNullableNumber(item.quantity),
        unitPrice: toNullableNumber(item.unitPrice),
        amount: toNullableNumber(item.amount) ?? 0,
      })),
    });
  }
}
