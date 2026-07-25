import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ExpenseRow } from '../expenses-page.mappers';

// Presentational expenses list table (OBRS-685), mirroring the OBRS-261
// vehicles-page split (VehicleListTableComponent): no Store/HTTP access —
// data comes in via @Input, user actions go out via @Output.
@Component({
  selector: 'app-expense-list-table',
  templateUrl: './expense-list-table.component.html',
  styleUrl: './expense-list-table.component.scss',
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

  @Output() edit = new EventEmitter<ExpenseRow>();
  @Output() delete = new EventEmitter<ExpenseRow>();

  // Arrow-function field: NgForOf invokes trackBy as a free function, so a
  // regular method loses `this` (design-system DEV-GOTCHAS: a bare method
  // reference passed as trackBy is invoked detached).
  protected trackById = (_index: number, item: ExpenseRow): number => item.id;
}
