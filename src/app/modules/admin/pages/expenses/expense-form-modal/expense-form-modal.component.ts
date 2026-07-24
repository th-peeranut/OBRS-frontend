import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService } from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { trimmedRequiredValidator } from '../../../../../shared/validators/trimmed-required.validator';
import {
  Option,
  ExpenseRow,
  VEHICLE_CENTRAL_SENTINEL,
  toDateControlValue,
  toExpensePayload,
} from '../expenses-page.mappers';
import {
  nonNegativeAmountValidator,
  positiveAmountValidator,
  tooManyDecimalsValidator,
} from './expense-form-modal.validators';

const AMOUNT_MAX_DECIMALS = 2;

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
})
export class ExpenseFormModalComponent implements OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() selectedExpense: ExpenseRow | null = null;
  @Input() vehicleOptions: Option[] = [];
  @Input() categoryOptions: Option[] = [];
  @Input() reloadStructure!: () => Promise<void>;
  @Output() closed = new EventEmitter<void>();

  protected readonly VEHICLE_CENTRAL_SENTINEL = VEHICLE_CENTRAL_SENTINEL;
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
      note: ['', [Validators.maxLength(500)]],
    });

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
      this.expenseForm.reset();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected get showCategoryOtherLabel(): boolean {
    return this.expenseForm.get('category')?.value === 'OTHER';
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
    this.expenseForm.reset({
      vehicleSelection: '',
      category: '',
      categoryOtherLabel: '',
      amount: null,
      vatAmount: null,
      expenseDate: null,
      receiptNo: '',
      paidBy: '',
      note: '',
    });
  }

  private initEditForm(expense: ExpenseRow): void {
    this.expenseForm.reset({
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
      note: expense.note,
    });
  }
}
