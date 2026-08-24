import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ExpenseRow } from '../expenses-page.mappers';
import { formatMoney } from '../../../../../shared/lib/money-display';

// Presentational expenses list table (OBRS-685), mirroring the OBRS-261
// vehicles-page split (VehicleListTableComponent): no Store/HTTP access —
// data comes in via @Input, user actions go out via @Output.
@Component({
    selector: 'app-expense-list-table',
    templateUrl: './expense-list-table.component.html',
    styleUrl: './expense-list-table.component.scss',
    standalone: false
})
export class ExpenseListTableComponent {
  @Input() rows: ExpenseRow[] = [];
  @Input() isLoading = false;
  @Input() skeletonRows: unknown[] = Array.from({ length: 5 });
  /** True on a genuine fetch error with no cached rows to show — replaces
   * the table (design-system §12 full-section empty-state family). */
  @Input() hasError = false;
  @Input() errorMessage = '';
  /** True 200+[] with NO filters active — the true "no expenses yet" empty
   * state (§8). A populated list narrowed to zero rows by filters is a
   * DIFFERENT, lighter inline message (`rows.length === 0 && !isEmpty` in
   * the template) — never the same copy, so an admin filtering a populated
   * list to nothing isn't told "ยังไม่มีรายการ" (a false claim). */
  @Input() isEmpty = false;
  @Input() canWrite = false;
  /**
   * OBRS-808: show the operator column. True only for an `admin`, whose list
   * spans every operator — for an `owner` every row is theirs by construction
   * (the backend confines the query to `expenses.owner_id`), so a column
   * repeating their own name on every line would be pure noise. The caller
   * passes their role; this component does not infer it from the data, because
   * a one-operator admin view is indistinguishable from an owner view.
   */
  @Input() showOwnerColumn = false;

  constructor(private readonly translate: TranslateService) {}

  @Output() edit = new EventEmitter<ExpenseRow>();
  @Output() delete = new EventEmitter<ExpenseRow>();

  /**
   * Column count for the "no rows match the filters" row. Derived rather than
   * literal: the previous hard-coded `canWrite ? 9 : 8` was already one edit
   * away from being wrong, and a colspan that undercounts silently leaves a
   * ragged cell rather than failing.
   */
  protected get columnCount(): number {
    // OBRS-960: +1 for the always-rendered Source column.
    return 9 + (this.showOwnerColumn ? 1 : 0) + (this.canWrite ? 1 : 0);
  }

  // Arrow-function field: NgForOf invokes trackBy as a free function, so a
  // regular method loses `this` (design-system DEV-GOTCHAS: a bare method
  // reference passed as trackBy is invoked detached).
  protected trackById = (_index: number, item: ExpenseRow): number => item.id;
  /** OBRS-1592: these cells printed `3,100.00` from a `| number` pipe — a fifth
   * on-screen money format, and the only one with no unit at all. `TranslateService`
   * is the one dependency this presentational component takes; it is a rendering
   * concern, not the Store/HTTP access the class comment rules out. */
  protected formatMoney(value: number | string | null | undefined): string {
    return formatMoney(value, this.translate.currentLang);
  }

}
