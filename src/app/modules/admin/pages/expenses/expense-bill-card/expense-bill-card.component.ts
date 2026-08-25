import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { AdminExpensePayeeDto } from '../../../../../services/admin/admin-api.service';
import { MAINTENANCE_PART_CODES } from '../../vehicles/vehicle-maintenance-plan/vehicle-maintenance-plan.mappers';
import {
  ExpenseItemFormValue,
  Option,
  EXPENSE_ITEM_PART_NONE_SENTINEL,
  expenseItemsTotal,
} from '../expenses-page.mappers';
import {
  nonNegativeAmountValidator,
  positiveAmountValidator,
  tooManyDecimalsValidator,
} from '../expense-form-modal/expense-form-modal.validators';

const AMOUNT_MAX_DECIMALS = 2;

// OBRS-1374 (schema.sql expense_items.description VARCHAR(255)).
const ITEM_DESCRIPTION_MAX_LENGTH = 255;

/**
 * OBRS-1576: ONE bill inside the envelope — its own header, its own lines, its own total.
 *
 * <p>It renders a `FormGroup` the parent owns rather than holding state of its own. The parent is
 * the one that has to submit N of these in a single request, so it must be able to read and
 * validate all of them at once; a card that kept its own values would make the envelope's validity
 * something the page could only discover by asking each child.
 *
 * <p><b>The header did not disappear, it collapsed.</b> The owner's first proposal was to delete the
 * header box entirely and keep a flat table. Measured 2026-08-23, every field in it is read by
 * something: `category` is the axis OBRS-841's per-vehicle P&L groups by, `paid_by` says which
 * pocket the money left. What was actually wrong was that the header repeated per BILL when the
 * owner had a stack of them — so it is one short row here, and `วันที่`/`ทะเบียนรถ` sit on it
 * rather than on every line, because one repair bill is one van on one day (owner ruling
 * 2026-08-23) and repeating them per line is asking for the same two facts N times.
 *
 * <p><b>Two fields are deliberately absent</b> (owner ruling 2026-08-24): `receiptNo` and
 * `vatAmount`. Hidden on this screen only — the columns stay, the single-bill modal still shows
 * them, and no migration drops anything. See `buildBillGroup` for what the payload sends instead.
 */
@Component({
    selector: 'app-expense-bill-card',
    templateUrl: './expense-bill-card.component.html',
    styleUrl: './expense-bill-card.component.scss',
    standalone: false
})
export class ExpenseBillCardComponent {
  @Input() billForm!: FormGroup;
  /** 0-based position in the envelope; the heading shows `index + 1`, and so does the server's
   * error when this bill is the one that fails. */
  @Input() index = 0;
  @Input() vehicleOptions: Option[] = [];
  @Input() categoryOptions: Option[] = [];
  @Input() payees: AdminExpensePayeeDto[] = [];
  @Input() canCreatePayee = true;
  /**
   * Folded to a one-line summary. AC1: a stack can be 8–10 slips, and a page of fully-expanded
   * bills is one the owner has to scroll to find the row they are typing into. Owned by the parent
   * so that "collapse the one I just finished" is a decision the page can make on `เพิ่มบิล`.
   */
  @Input() collapsed = false;
  /** False when this is the only bill left: an envelope with no bills in it is not a state the
   * screen can do anything with, and a remove button that refuses is worse than none. */
  @Input() removable = true;

  @Output() remove = new EventEmitter<void>();
  @Output() toggleCollapse = new EventEmitter<void>();
  @Output() payeeCreated = new EventEmitter<AdminExpensePayeeDto>();

  protected readonly ITEM_DESCRIPTION_MAX_LENGTH = ITEM_DESCRIPTION_MAX_LENGTH;

  constructor(
    private readonly translate: TranslateService,
    private readonly formBuilder: FormBuilder
  ) {}

  /**
   * OBRS-1374 AC10: the part labels come from OBRS-1333's OWN i18n keys, never a second set minted
   * here — one code must not read as two different things on two screens. A getter rather than a
   * field so a language switch is picked up without the page rebuilding its cards.
   */
  protected get partOptions(): Option[] {
    return [
      {
        code: EXPENSE_ITEM_PART_NONE_SENTINEL,
        label: this.translate.instant('ADMIN.EXPENSES.ITEMS.PART_NONE'),
      },
      ...MAINTENANCE_PART_CODES.map((code) => ({
        code,
        label: this.translate.instant(`ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.${code}`),
      })),
    ];
  }

  protected get itemsArray(): FormArray {
    return this.billForm.get('items') as FormArray;
  }

  /** What this bill comes to. NOT a control: on the single-bill modal the owner types the total and
   * the lines have to agree with it, which is a mismatch waiting to happen; here the lines ARE the
   * bill, so the total is read off them and the whole class of error is gone. */
  protected get billTotal(): number {
    return expenseItemsTotal(this.itemsArray.getRawValue() as ExpenseItemFormValue[]);
  }

  protected get showCategoryOtherLabel(): boolean {
    return this.billForm.get('category')?.value === 'OTHER';
  }

  /** OBRS-1577: fed live to the picker so the type a payee added from here would be created as is
   * always the one this bill is actually filed under. */
  protected get selectedCategory(): string {
    return String(this.billForm.get('category')?.value ?? '');
  }

  /** The collapsed line: what this bill is, in the order the eye needs it to find the right slip. */
  protected get summaryVehicleLabel(): string {
    const code = String(this.billForm.get('vehicleSelection')?.value ?? '');
    return this.vehicleOptions.find((option) => option.code === code)?.label ?? '';
  }

  protected get summaryCategoryLabel(): string {
    const code = this.selectedCategory;
    return this.categoryOptions.find((option) => option.code === code)?.label ?? '';
  }

  protected get summaryPayeeName(): string {
    const payeeId = this.billForm.get('payeeId')?.value as number | null;
    return this.payees.find((payee) => payee.id === payeeId)?.name ?? '';
  }

  protected get summaryDate(): Date | null {
    return (this.billForm.get('expenseDate')?.value as Date | null) ?? null;
  }

  protected addItem(): void {
    this.itemsArray.push(buildItemGroup(this.formBuilder));
  }

  protected removeItem(index: number): void {
    this.itemsArray.removeAt(index);
  }

  protected trackByIndex(index: number): number {
    return index;
  }

  protected isControlInvalid(controlName: string): boolean {
    const control = this.billForm.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }
}

/**
 * OBRS-1576: the shape of one bill, in one place, so the page that builds them and the card that
 * renders them cannot drift.
 *
 * <p>`receiptNo`, `vatAmount` and `note` are NOT controls here. They exist on `expenses` and on the
 * single-bill modal; on this screen the owner ruled them off (2026-08-24) and the payload sends
 * `null` for each rather than an empty control nobody can reach — see
 * `ExpenseBatchPageComponent#toBillPayload`.
 *
 * <p>There is no `amount` control either, for the reason `ExpenseBillCardComponent#billTotal`
 * gives: on this screen the lines are the bill.
 */
export function buildBillGroup(formBuilder: FormBuilder): FormGroup {
  return formBuilder.group({
    // §4.1.1 placeholder-first: an untouched placeholder blocks submit, which is what tells
    // "forgot to pick" apart from "chose ส่วนกลาง".
    vehicleSelection: ['', [Validators.required]],
    category: ['', [Validators.required]],
    categoryOtherLabel: [''],
    expenseDate: [null, [Validators.required]],
    paidBy: ['', [Validators.maxLength(255)]],
    // OBRS-1577 AC1 keeps this optional on the general form; here it is REQUIRED, because the field
    // is the reason this screen can answer "how much did I pay this garage" at all and a stack of
    // repair bills always came from someone.
    payeeId: [null, [Validators.required]],
    // AC3: at least one line. A bill with no breakdown is a legitimate row elsewhere (the modal
    // still writes them), but on the envelope screen the lines are what produces the total, so a
    // bill with none has an amount of 0 and the server would refuse it with a message about a field
    // this screen does not show.
    items: formBuilder.array([buildItemGroup(formBuilder)], [Validators.minLength(1)]),
  });
}

/** One line of a bill. Mirrors the single-bill modal's row: `part` optional (AC3 — labour and
 * sundry lines are not a part at all), `quantity`/`unitPrice` optional (measured on the owner's own
 * bill: 2 of its 4 lines carry neither), `description` and `amount` required. */
export function buildItemGroup(formBuilder: FormBuilder): FormGroup {
  return formBuilder.group({
    part: [EXPENSE_ITEM_PART_NONE_SENTINEL],
    description: ['', [Validators.required, Validators.maxLength(ITEM_DESCRIPTION_MAX_LENGTH)]],
    quantity: [null, [positiveAmountValidator, tooManyDecimalsValidator(AMOUNT_MAX_DECIMALS)]],
    unitPrice: [null, [nonNegativeAmountValidator, tooManyDecimalsValidator(AMOUNT_MAX_DECIMALS)]],
    // OBRS-1576/V124: zero is allowed. A garage that does a job and does not charge for it writes
    // the line with nothing against it, and the alternatives were to drop the line or invent a
    // price — one loses the work, the other stops the bill matching the paper.
    amount: [null, [Validators.required, nonNegativeAmountValidator, tooManyDecimalsValidator(AMOUNT_MAX_DECIMALS)]],
  });
}
