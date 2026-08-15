import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { toCents } from '../../../../../shared/lib/money-cents';

/**
 * OBRS-960 — the field-expense categories a driver plausibly pays for AT
 * the vehicle, reusing the EXISTING `ADMIN.EXPENSES.CATEGORIES.*` i18n keys
 * (the card: "`PERMIT_FEE` ... reuse the existing key ... do not mint a
 * `STAFF.*` duplicate") rather than a second category list. Deliberately a
 * subset of the full admin category list — `VEHICLE_TAX`/`INSURANCE`/
 * `INSTALMENT`/`CENTRAL` are back-office categories a driver never pays
 * roadside.
 *
 * OBRS-1356 — `DRIVER_WAGE` was in that excluded list and is now IN, on the
 * owner's ruling (2026-08-14): the wage per leg is one of the four costs a
 * salesperson settles with the driver at the counter. It is the one entry
 * with no amount box — see `isWageCategory` below.
 */
export const DRIVER_CASH_EXPENSE_CATEGORIES: readonly string[] = [
  'FUEL',
  'TOLL',
  'PERMIT_FEE',
  'DRIVER_WAGE',
  'REPAIR',
  'OTHER',
];

/** OBRS-1356 — the one category the SERVER prices, from the owner's rate. */
const WAGE_CATEGORY = 'DRIVER_WAGE';

/** OBRS-960 — dumb: the field-expense action's inline form. */
@Component({
    selector: 'app-driver-cash-expense-form',
    templateUrl: './driver-cash-expense-form.component.html',
    styleUrl: './driver-cash-expense-form.component.scss',
    standalone: false
})
export class DriverCashExpenseFormComponent implements OnChanges, OnDestroy {
  @Input() isSubmitting = false;
  @Input() submitError: string | null = null;
  @Output() submitExpense = new EventEmitter<{ category: string; amount?: string; note?: string }>();

  // app-admin-dropdown renders `option[labelKey]` verbatim, with no
  // translate pipe of its own (admin-dropdown.component.html) — so this
  // dumb form resolves the label TEXT itself (same reasoning
  // `SettlementsListComponent` already has for injecting `TranslateService`
  // for a pure formatting concern, not Store/HTTP access).
  protected categoryOptions: { value: string; label: string }[] = [];

  protected selectedCategory = '';
  protected amountInput = '';
  protected noteInput = '';

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly translate: TranslateService) {
    this.buildCategoryOptions();
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.buildCategoryOptions();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private buildCategoryOptions(): void {
    this.categoryOptions = DRIVER_CASH_EXPENSE_CATEGORIES.map((code) => ({
      value: code,
      label: this.translate.instant(`ADMIN.EXPENSES.CATEGORIES.${code}`),
    }));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['isSubmitting'] &&
      changes['isSubmitting'].previousValue === true &&
      !this.isSubmitting &&
      !this.submitError
    ) {
      this.selectedCategory = '';
      this.amountInput = '';
      this.noteInput = '';
    }
  }

  protected get amountCents(): number | null {
    return toCents(this.amountInput);
  }

  /** OBRS-1356 — the wage is priced by the owner's rate, so there is no amount to type. */
  protected get isWageCategory(): boolean {
    return this.selectedCategory === WAGE_CATEGORY;
  }

  protected get canSubmit(): boolean {
    if (this.isSubmitting || this.selectedCategory === '') return false;
    if (this.isWageCategory) return true;
    return this.amountCents !== null && this.amountCents > 0;
  }

  protected onCategoryChange(value: string): void {
    this.selectedCategory = value;
    if (this.isWageCategory) {
      // Clearing rather than hiding-and-keeping: a stale number left behind the
      // hidden field would be sent the moment the user switched back.
      this.amountInput = '';
    }
  }

  protected onSubmit(): void {
    if (!this.canSubmit) return;
    const note = this.noteInput.trim();
    this.submitExpense.emit({
      category: this.selectedCategory,
      ...(this.isWageCategory ? {} : { amount: this.amountInput.trim() }),
      ...(note ? { note } : {}),
    });
  }
}
