import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminExpensePayeeDto,
  AdminMaintenancePartDto,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { trimmedRequiredValidator } from '../../../../../shared/validators/trimmed-required.validator';
import {
  Option,
  ExpenseItemFormValue,
  ExpenseItemRow,
  ExpenseRow,
  VEHICLE_CENTRAL_SENTINEL,
  expenseItemsTotal,
  toDateControlValue,
  toExpensePayload,
} from '../expenses-page.mappers';
import {
  itemsTotalMatchesAmountValidator,
  nonNegativeAmountValidator,
  positiveAmountValidator,
  tooManyDecimalsValidator,
} from './expense-form-modal.validators';

const AMOUNT_MAX_DECIMALS = 2;

// OBRS-1374 (schema.sql expense_items.description VARCHAR(255)).
const ITEM_DESCRIPTION_MAX_LENGTH = 255;

// OBRS-1613 (schema.sql expense_items.unit VARCHAR(20)).
const ITEM_UNIT_MAX_LENGTH = 20;

// Smart create/edit form modal (OBRS-685), mirroring VehicleFormModalComponent
// (OBRS-261) / AppVehicleMaintenancePanelComponent's modal (OBRS-209). Owns
// its own FormGroup and API calls; driven by @Input (isOpen/mode/
// selectedExpense) — ngOnChanges reacts only to `isOpen` transitions.
//
// Edit opens SYNCHRONOUSLY from the row already in hand — the list endpoint
// (GET /expenses) already returns the full record, so unlike vehicles-page
// there is no second detail fetch to gate on (§4.2 of the UX spec, same
// reasoning as vehicle-maintenance-panel.openEditModal).
@Component({
    selector: 'app-expense-form-modal',
    templateUrl: './expense-form-modal.component.html',
    styleUrl: './expense-form-modal.component.scss',
    standalone: false
})
export class ExpenseFormModalComponent implements OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() selectedExpense: ExpenseRow | null = null;
  @Input() vehicleOptions: Option[] = [];
  @Input() categoryOptions: Option[] = [];
  /** OBRS-808: the operator roster. Empty for every non-admin caller — they
   * never fetch it (`GET /api/private/owners` 403s them) and never see the
   * picker. */
  @Input() ownerOptions: Option[] = [];
  /**
   * OBRS-808: whether the caller holds the `admin` role.
   *
   * Deliberately a separate input rather than being derived from
   * `ownerOptions.length > 0`. The derived form would hide the picker whenever
   * the roster FETCH FAILED — exactly the state in which an admin most needs to
   * see it, because they would then submit with no operator and get the 400
   * this card exists to prevent, with nothing on screen to explain it. Role and
   * roster are different facts; conflating them turns one failure into a
   * silent, worse one.
   */
  @Input() isAdmin = false;
  /** OBRS-1577: the ACTIVE rows of the payee registry, for the "จ่ายให้ใคร" picker. Empty is a
   * working state, not a broken one — an operator with no payees on record yet gets a picker whose
   * only offer is "add the one I am typing", which is exactly how the registry gets populated. */
  @Input() payeeOptions: AdminExpensePayeeDto[] = [];
  /** OBRS-1577: whether this caller may CREATE a payee from here. False for an admin — the backend
   * refuses that one operation alone (see `ExpensesPageComponent.canCreatePayee`). */
  @Input() canCreatePayee = true;
  /** OBRS-1613: the parts/labour registry, ACTIVE rows only - the page filters. */
  @Input() partOptions: AdminMaintenancePartDto[] = [];
  @Input() canCreatePart = true;
  @Input() reloadStructure!: () => Promise<void>;
  @Output() closed = new EventEmitter<void>();
  /** OBRS-1577: forwarded up from the picker so the page can revalidate the shared registry cache —
   * a payee added from inside one bill must be offered on the next bill without a page reload. */
  @Output() payeeCreated = new EventEmitter<AdminExpensePayeeDto>();
  @Output() partCreated = new EventEmitter<AdminMaintenancePartDto>();

  protected readonly VEHICLE_CENTRAL_SENTINEL = VEHICLE_CENTRAL_SENTINEL;
  protected readonly ITEM_DESCRIPTION_MAX_LENGTH = ITEM_DESCRIPTION_MAX_LENGTH;
  protected readonly ITEM_UNIT_MAX_LENGTH = ITEM_UNIT_MAX_LENGTH;
  protected isSubmitting = false;
  protected readonly expenseForm: FormGroup;

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.expenseForm = this.formBuilder.group({
      // OBRS-808: registered unconditionally, validated conditionally. The
      // control has to exist before ngOnChanges runs (inputs are not readable
      // in a constructor), and a control that exists but is never shown must
      // never block submit — so the required validator is applied in
      // initCreateForm, where `isAdmin` and `mode` are both known.
      ownerSelection: [''],
      // design-system §3.1 + UX-OBRS-685 §4.1.1: placeholder-first, no
      // pre-seeded default, REQUIRED — an untouched placeholder blocks
      // submit, distinguishing "forgot to pick" from "chose central".
      vehicleSelection: ['', [Validators.required]],
      category: ['', [Validators.required]],
      categoryOtherLabel: [''],
      amount: [
        null,
        [Validators.required, positiveAmountValidator, tooManyDecimalsValidator(AMOUNT_MAX_DECIMALS)],
      ],
      vatAmount: [null, [nonNegativeAmountValidator, tooManyDecimalsValidator(AMOUNT_MAX_DECIMALS)]],
      expenseDate: [null, [Validators.required]],
      receiptNo: ['', [Validators.maxLength(100)]],
      paidBy: ['', [Validators.maxLength(255)]],
      // OBRS-1577 AC1: optional by design. Every bill written before this card has no payee, and an
      // owner who cannot remember who a bill went to must be able to say so by leaving it alone —
      // a required field here would be answered with whichever name is nearest the top.
      payeeId: [null],
      note: ['', [Validators.maxLength(500)]],
      // OBRS-1374 AC4: starts EMPTY and may stay empty - a bill with no breakdown must save
      // exactly as it did before this card.
      items: this.formBuilder.array([]),
    }, { validators: [itemsTotalMatchesAmountValidator] });

    // §4.1 field table: the instant `category` leaves 'OTHER', clear BOTH
    // the visible control's value AND its validator state in the same tick
    // — never left stale for a component that re-shows OTHER later. This
    // fires on every category valueChange, including the ones FormGroup.reset()
    // triggers per-child during initCreateForm/initEditForm below; in both
    // paths the loop-order there (category registered before
    // categoryOtherLabel) means the explicit value initEditForm/initCreateForm
    // pass for categoryOtherLabel is applied AFTER this callback runs, so the
    // final state after reset always reflects the caller's intended value.
    this.subscriptions.add(
      this.expenseForm.get('category')!.valueChanges.subscribe((category: string) => {
        const control = this.expenseForm.get('categoryOtherLabel');
        if (!control) {
          return;
        }
        if (category === 'OTHER') {
          control.setValidators([trimmedRequiredValidator, Validators.maxLength(100)]);
        } else {
          control.setValue('');
          control.clearValidators();
        }
        control.updateValueAndValidity({ emitEvent: false });
      })
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isOpen']) {
      return;
    }

    if (this.isOpen) {
      if (this.mode === 'edit' && this.selectedExpense) {
        this.initEditForm(this.selectedExpense);
      } else {
        this.initCreateForm();
      }
    } else {
      // FormGroup.reset() blanks the controls a FormArray HOLDS, it does not remove them - a
      // four-line bill would leave four empty rows behind for the next open. Clear it first.
      this.itemsArray.clear();
      this.expenseForm.reset();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected get showCategoryOtherLabel(): boolean {
    return this.expenseForm.get('category')?.value === 'OTHER';
  }

  /** OBRS-1577: the bill's category, fed live to the picker so the type it would create is always
   * the one the bill is actually filed under (owner decision 1, 2026-08-24). */
  protected get selectedCategory(): string {
    return String(this.expenseForm.get('category')?.value ?? '');
  }

  /** OBRS-1577: the payee name carried on the row being edited. The picker offers ACTIVE payees
   * only, so without this a bill paid to a since-retired garage would render as an empty field —
   * which reads as "no payee" and is one save away from becoming true. */
  protected get editingPayeeName(): string {
    return this.selectedExpense?.payeeName ?? '';
  }

  protected get itemsArray(): FormArray {
    return this.expenseForm.get('items') as FormArray;
  }

  /** OBRS-1374 AC9: what the lines add up to, shown live under the repeater. */
  protected get itemsTotal(): number {
    return expenseItemsTotal(this.itemsArray.getRawValue() as ExpenseItemFormValue[]);
  }

  /** OBRS-1374 AC9: the warning, and the reason submit is blocked. Deliberately NOT gated on
   * dirty/touched like `isFieldInvalid` - an edit that opens on an already-mismatched bill must
   * say so immediately, not wait for the owner to touch something. */
  protected get itemsTotalMismatch(): boolean {
    return this.expenseForm.hasError('itemsTotalMismatch');
  }

  protected addItem(): void {
    this.itemsArray.push(this.buildItemGroup());
  }

  protected removeItem(index: number): void {
    this.itemsArray.removeAt(index);
  }

  protected trackByIndex(index: number): number {
    return index;
  }

  private buildItemGroup(item?: ExpenseItemRow): FormGroup {
    return this.formBuilder.group({
      // OBRS-1613: the registry id is the line's part now, on this screen as on the multi-bill one.
      // It is NOT a hidden value carried past a dropdown the owner can still change: this modal's
      // save is a full replace (ExpenseService#replaceItems deletes and reinserts the whole set),
      // so a line loaded here and saved back must round-trip everything it arrived with - and a
      // carried id would also WIN over the dropdown server-side (resolvePartForOwner takes partId
      // first), silently discarding the change the owner just made.
      partId: [item?.partId ?? null],
      // OBRS-1613: display only, never sent - `toExpensePayload` names the fields it puts on the
      // wire. It is the picker's fallback label for a part that has since been RETIRED: the picker
      // is offered ACTIVE rows only, so without this the field renders blank on a line whose link
      // is intact and the owner's natural repair is to overwrite it.
      partName: [item?.partName ?? ''],
      // AC3: blank is a real answer (labour, service, sundry), so no required validator - the
      // "not a part" option is what lets an owner take a part back off a line.
      //
      // OBRS-1613: `part` is no longer a control. The enum it was picked from is frozen history;
      // the payload sends the id and the server writes the code from the row it resolved. Keeping a
      // second, narrower vocabulary on this screen is the "two lists in one system" the card's
      // constraint 1 forbids - V113 wrote down why: the same question then has two answers.
      // OBRS-1613: free text, and carried on edit for the same round-trip reason as partId above.
      unit: [item?.unit ?? '', [Validators.maxLength(ITEM_UNIT_MAX_LENGTH)]],
      description: [
        item?.description ?? '',
        [Validators.required, Validators.maxLength(ITEM_DESCRIPTION_MAX_LENGTH)],
      ],
      quantity: [item?.quantity ?? null, [positiveAmountValidator, tooManyDecimalsValidator(AMOUNT_MAX_DECIMALS)]],
      unitPrice: [item?.unitPrice ?? null, [nonNegativeAmountValidator, tooManyDecimalsValidator(AMOUNT_MAX_DECIMALS)]],
      amount: [
        item?.amount ?? null,
        [Validators.required, positiveAmountValidator, tooManyDecimalsValidator(AMOUNT_MAX_DECIMALS)],
      ],
    });
  }

  private setItems(items: ExpenseItemRow[]): void {
    this.itemsArray.clear();
    items.forEach((item) => this.itemsArray.push(this.buildItemGroup(item)));
  }

  /**
   * OBRS-808 AC2: the picker is admin-only, and CREATE-only.
   *
   * Not shown on edit for anyone, because the backend ignores `ownerId` on PUT
   * for every caller — re-attributing an expense is a delete-and-recreate, not
   * a field edit. A live dropdown there would offer a change the server
   * silently discards, which is a worse failure than not offering it: the user
   * would believe the cost had moved. The edit modal shows the operator as
   * read-only text instead (see the template).
   */
  protected get showOwnerPicker(): boolean {
    return this.isAdmin && this.mode === 'create';
  }

  /** OBRS-808: the operator on the row being edited, for the read-only line
   * that replaces the picker in edit mode. Empty when unresolvable, which the
   * template tests directly rather than rendering a blank labelled field. */
  protected get editingOwnerLabel(): string {
    return this.selectedExpense?.ownerLabel ?? '';
  }

  /**
   * OBRS-808: an admin whose roster came back empty. Distinct from "not an
   * admin" — this one gets a visible warning, because the alternative is a
   * dropdown with nothing in it and a submit that fails at the server with a
   * message about a field the user could not have filled in.
   */
  protected get ownerRosterUnavailable(): boolean {
    return this.showOwnerPicker && this.ownerOptions.length === 0;
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.expenseForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  // Mirrors VehicleFormModalComponent.errorKey — a distinct key per failure
  // reason. `POSITIVE_NUMBER` is reused verbatim per the UX spec (§4.1); no
  // dedicated "must be zero or more" key exists yet, so vatAmount's
  // out-of-range case reuses the same message rather than inventing one.
  protected amountErrorKey(fieldName: 'amount' | 'vatAmount'): string {
    const field = this.expenseForm.get(fieldName);
    if (field?.hasError('required')) {
      return 'ADMIN.VALIDATION.REQUIRED';
    }
    if (field?.hasError('tooManyDecimals')) {
      return 'ADMIN.VALIDATION.CARGO_CAPACITY_TOO_MANY_DECIMALS';
    }
    return 'ADMIN.VALIDATION.POSITIVE_NUMBER';
  }

  protected requestClose(): void {
    if (this.isSubmitting) {
      return;
    }
    this.closed.emit();
  }

  protected async submitExpense(): Promise<void> {
    if (this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      // design-system DEV-GOTCHAS: an invalid early-return must give a
      // visible signal, not silently no-op.
      await this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = toExpensePayload(this.expenseForm.getRawValue());

      if (this.mode === 'edit' && this.selectedExpense) {
        await firstValueFrom(this.adminApiService.updateExpense(this.selectedExpense.id, payload));
        this.closed.emit();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createExpense(payload));
        this.closed.emit();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      // The server assigns id/audit fields — revalidate rather than
      // optimistic-splice, same ordering as every sibling form modal:
      // API call -> emit closed -> await the success alert -> reloadStructure LAST.
      await this.reloadStructure();
    } catch (error) {
      this.closed.emit();
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
  }

  private initCreateForm(): void {
    this.applyOwnerValidator();
    this.expenseForm.reset({
      ownerSelection: '',
      vehicleSelection: '',
      category: '',
      categoryOtherLabel: '',
      amount: null,
      vatAmount: null,
      expenseDate: null,
      receiptNo: '',
      paidBy: '',
      payeeId: null,
      note: '',
    });
    this.setItems([]);
  }

  /**
   * OBRS-808 AC3: required exactly when the field is rendered, and unvalidated
   * the rest of the time.
   *
   * The two halves are one method on purpose. A component instance is reused
   * across opens — the same modal serves create then edit then create — so
   * setting the validator without ever clearing it leaves an owner-less edit
   * form permanently invalid with no visible field to fix, and clearing without
   * setting is the 400 this card is about. `showOwnerPicker` is the single
   * predicate both the validator and the template read, so they cannot drift.
   */
  private applyOwnerValidator(): void {
    const control = this.expenseForm.get('ownerSelection');
    if (!control) {
      return;
    }
    if (this.showOwnerPicker) {
      control.setValidators([Validators.required]);
    } else {
      control.clearValidators();
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  private initEditForm(expense: ExpenseRow): void {
    this.applyOwnerValidator();
    this.expenseForm.reset({
      // Never sent on PUT (the backend ignores it for everyone) — reset to
      // blank so a create that follows this edit cannot inherit a stale value.
      ownerSelection: '',
      // §4.1.1: an already-saved central expense prefills to the EXPLICIT
      // sentinel option (a real prior choice), never back to blank.
      vehicleSelection:
        expense.vehicleId === null ? VEHICLE_CENTRAL_SENTINEL : String(expense.vehicleId),
      category: expense.category,
      categoryOtherLabel: expense.categoryOtherLabel,
      amount: expense.amount,
      vatAmount: expense.vatAmount,
      expenseDate: toDateControlValue(expense.expenseDate),
      receiptNo: expense.receiptNo,
      paidBy: expense.paidBy,
      payeeId: expense.payeeId,
      note: expense.note,
    });
    this.setItems(expense.items ?? []);
  }
}
