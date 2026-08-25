import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { toCents } from '../../../../../shared/lib/money-cents';
import { formatDisplayDate } from '../../../../../shared/lib/display-date-time';

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
 *
 * OBRS-1363 — `OTHER` was in this list from the start and the backend refused
 * it, so picking it 400'd with nothing on screen to warn you. The owner's
 * ruling (2026-08-15) keeps it AND adds `PARKING_FEE` (the overnight park
 * before the first round). This list must stay a subset of the backend's
 * `DriverCashExpensePaidReqDto.ALLOWED_CATEGORIES`; nothing in either build
 * can see both, so `verify-field-expense-categories.ps1` in the office reads
 * the two files at `origin/dev` and is what fails on a one-sided edit.
 */
export const DRIVER_CASH_EXPENSE_CATEGORIES: readonly string[] = [
  'FUEL',
  'TOLL',
  'PERMIT_FEE',
  'DRIVER_WAGE',
  'REPAIR',
  'PARKING_FEE',
  'OTHER',
];

/** OBRS-1356 — the one category the SERVER prices, from the owner's rate. */
const WAGE_CATEGORY = 'DRIVER_WAGE';

/** OBRS-1363 — the one category that carries a free-text label of its own. */
const OTHER_CATEGORY = 'OTHER';

/** OBRS-960 — dumb: the field-expense action's inline form. */
@Component({
    selector: 'app-driver-cash-expense-form',
    templateUrl: './driver-cash-expense-form.component.html',
    styleUrl: './driver-cash-expense-form.component.scss',
    standalone: false
})
export class DriverCashExpenseFormComponent implements OnChanges, OnDestroy {
  /**
   * OBRS-1579 — the business date of the cash box this entry lands in
   * (`yyyy-MM-dd`), resolved by the panel. Null only while it is still being
   * resolved, or when the schedule fetch failed.
   */
  @Input() businessDate: string | null = null;
  @Input() isSubmitting = false;
  @Input() submitError: string | null = null;
  @Output() submitExpense = new EventEmitter<{
    category: string;
    amount?: string;
    note?: string;
    categoryOtherLabel?: string;
  }>();

  // app-admin-dropdown renders `option[labelKey]` verbatim, with no
  // translate pipe of its own (admin-dropdown.component.html) — so this
  // dumb form resolves the label TEXT itself (same reasoning
  // `SettlementsListComponent` already has for injecting `TranslateService`
  // for a pure formatting concern, not Store/HTTP access).
  protected categoryOptions: { value: string; label: string }[] = [];

  protected selectedCategory = '';
  protected amountInput = '';
  protected noteInput = '';
  protected otherLabelInput = '';
  /**
   * OBRS-1579 — the date printed on the bill in the salesperson's hand.
   *
   * ⛔ Deliberately NOT sent to the server and NOT persisted. The owner's
   * ruling (2026-08-25) was one field, and what that field has to do is make
   * the person LOOK at the bill's date before they key it: the driver's fuel
   * bill reaches the counter the morning after the round it paid for, and
   * nothing here used to say which day's box was about to receive it. Storing
   * it would mean writing `expenses.expense_date`, which the OBRS-841 P&L
   * groups on - a different, larger decision that was not asked for.
   *
   * Starts equal to the box's own date, so the ordinary same-day entry costs
   * nobody a keystroke and the warning fires only when someone says the bill
   * is from another day.
   */
  protected billDateInput = '';

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
    // Seed (and re-seed on a round change) from the box's own date. Never
    // overwrites a date the user has already typed for THIS box.
    if (changes['businessDate'] && this.businessDate) {
      const previous = changes['businessDate'].previousValue as string | null;
      if (this.billDateInput === '' || this.billDateInput === previous) {
        this.billDateInput = this.businessDate;
      }
    }
    if (
      changes['isSubmitting'] &&
      changes['isSubmitting'].previousValue === true &&
      !this.isSubmitting &&
      !this.submitError
    ) {
      this.selectedCategory = '';
      this.amountInput = '';
      this.noteInput = '';
      this.otherLabelInput = '';
      this.billDateInput = this.businessDate ?? '';
    }
  }

  /**
   * OBRS-1579 — the whole point of the field. A WARNING, never a block: a bill
   * from another day is sometimes exactly what is being keyed on purpose (the
   * owner has re-opened that day's box and this is the correction). What must
   * not happen is keying it without noticing.
   */
  protected get hasBillDateMismatch(): boolean {
    return (
      this.billDateInput !== '' &&
      this.businessDate !== null &&
      this.billDateInput !== this.businessDate
    );
  }

  protected displayDate(value: string | null | undefined): string {
    return formatDisplayDate(value, this.translate.currentLang);
  }

  protected get amountCents(): number | null {
    return toCents(this.amountInput);
  }

  /** OBRS-1356 — the wage is priced by the owner's rate, so there is no amount to type. */
  protected get isWageCategory(): boolean {
    return this.selectedCategory === WAGE_CATEGORY;
  }

  /** OBRS-1363 — the one category that has to say what it actually was. */
  protected get isOtherCategory(): boolean {
    return this.selectedCategory === OTHER_CATEGORY;
  }

  protected get canSubmit(): boolean {
    if (this.isSubmitting || this.selectedCategory === '') return false;
    // OBRS-1363: the backend refuses OTHER with no label (same rule the admin
    // entry point has always had), so submitting without one is a guaranteed
    // 400 — the button says so instead of the server saying it afterwards.
    if (this.isOtherCategory && this.otherLabelInput.trim() === '') return false;
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
    if (!this.isOtherCategory) {
      // Same reasoning, and here the backend enforces it too: a label sent with
      // a non-OTHER category is itself a 400.
      this.otherLabelInput = '';
    }
  }

  protected onSubmit(): void {
    if (!this.canSubmit) return;
    const note = this.noteInput.trim();
    this.submitExpense.emit({
      category: this.selectedCategory,
      ...(this.isWageCategory ? {} : { amount: this.amountInput.trim() }),
      ...(note ? { note } : {}),
      ...(this.isOtherCategory ? { categoryOtherLabel: this.otherLabelInput.trim() } : {}),
    });
  }
}
