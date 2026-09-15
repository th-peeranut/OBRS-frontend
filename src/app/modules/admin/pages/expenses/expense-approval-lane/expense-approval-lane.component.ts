import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ExpenseApprovalGroupRow } from '../expenses-page.mappers';
import { formatMoney } from '../../../../../shared/lib/money-display';

/**
 * OBRS-1356 — the owner's review queue, above the expense log.
 *
 * Dumb, like `ExpenseListTableComponent`: rows in via `@Input`, verdicts out
 * via `@Output`. Its own card rather than a column on that table because the
 * two answer different questions — the table is the cost history, this is a
 * short worklist that empties. It renders nothing at all when empty, so an
 * owner with nothing to review sees the page they had before.
 *
 * Rejecting reveals an inline reason box instead of opening a dialog: the
 * backend requires the reason, and a `window.prompt` would be both untestable
 * and unstyleable.
 *
 * OBRS-1891: a row is now either a `SETTLE_BILL` (one salesperson field
 * submission folded from several `AdminExpenseDto` rows) or a `SINGLE`
 * expense (this component's pre-OBRS-1891 shape, unchanged) — see
 * `ExpenseApprovalGroupRow`. The composite `actionKey` (`bill:<settleId>` /
 * `exp:<id>`) is what busy/reject state and verdict emissions key off, since
 * a `settleId` and an expense `id` are different tables' primary keys and can
 * collide. A `SETTLE_BILL` row's members expand/collapse (design-system's
 * "Expandable per-row detail" precedent) — no verdict controls of their own.
 */
@Component({
    selector: 'app-expense-approval-lane',
    templateUrl: './expense-approval-lane.component.html',
    styleUrl: './expense-approval-lane.component.scss',
    standalone: false
})
export class ExpenseApprovalLaneComponent {
  @Input() rows: ExpenseApprovalGroupRow[] = [];
  /** The composite action key (`bill:<settleId>` / `exp:<id>`) of the row currently being
   * approved/rejected — disables just that row's buttons. */
  @Input() busyId: string | null = null;

  constructor(private readonly translate: TranslateService) {}

  @Output() approve = new EventEmitter<ExpenseApprovalGroupRow>();
  @Output() reject = new EventEmitter<{ row: ExpenseApprovalGroupRow; rejectionReason: string }>();

  protected rejectingKey: string | null = null;
  protected rejectionReason = '';

  // OBRS-1891: which SETTLE_BILL rows are expanded — page-local UI state, keyed by actionKey,
  // mirroring the design-system's "Expandable per-row detail" precedent (EodSalesReportPageComponent).
  protected readonly expandedKeys = new Set<string>();

  protected startReject(row: ExpenseApprovalGroupRow): void {
    this.rejectingKey = row.actionKey;
    this.rejectionReason = '';
  }

  protected cancelReject(): void {
    this.rejectingKey = null;
    this.rejectionReason = '';
  }

  protected get canConfirmReject(): boolean {
    return this.rejectionReason.trim().length > 0;
  }

  protected confirmReject(row: ExpenseApprovalGroupRow): void {
    if (!this.canConfirmReject) return;
    this.reject.emit({ row, rejectionReason: this.rejectionReason.trim() });
    this.cancelReject();
  }

  protected isExpanded(row: ExpenseApprovalGroupRow): boolean {
    return this.expandedKeys.has(row.actionKey);
  }

  protected toggleExpand(row: ExpenseApprovalGroupRow): void {
    if (this.expandedKeys.has(row.actionKey)) {
      this.expandedKeys.delete(row.actionKey);
    } else {
      this.expandedKeys.add(row.actionKey);
    }
  }

  /** OBRS-1592: these cells printed `3,100.00` from a `| number` pipe — a fifth
   * on-screen money format, and the only one with no unit at all. `TranslateService`
   * is the one dependency this presentational component takes; it is a rendering
   * concern, not the Store/HTTP access the class comment rules out. */
  protected formatMoney(value: number | string | null | undefined): string {
    return formatMoney(value, this.translate.currentLang);
  }

}
