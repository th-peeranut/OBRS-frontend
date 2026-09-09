import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ExpenseRow } from '../expenses-page.mappers';
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
 */
@Component({
    selector: 'app-expense-approval-lane',
    templateUrl: './expense-approval-lane.component.html',
    styleUrl: './expense-approval-lane.component.scss',
    standalone: false
})
export class ExpenseApprovalLaneComponent {
  @Input() rows: ExpenseRow[] = [];
  /** The id currently being approved/rejected — disables just that row's buttons. */
  @Input() busyId: number | null = null;

  constructor(private readonly translate: TranslateService) {}

  @Output() approve = new EventEmitter<number>();
  @Output() reject = new EventEmitter<{ id: number; rejectionReason: string }>();

  protected rejectingId: number | null = null;
  protected rejectionReason = '';

  protected startReject(id: number): void {
    this.rejectingId = id;
    this.rejectionReason = '';
  }

  protected cancelReject(): void {
    this.rejectingId = null;
    this.rejectionReason = '';
  }

  protected get canConfirmReject(): boolean {
    return this.rejectionReason.trim().length > 0;
  }

  protected confirmReject(id: number): void {
    if (!this.canConfirmReject) return;
    this.reject.emit({ id, rejectionReason: this.rejectionReason.trim() });
    this.cancelReject();
  }

  protected trackById = (_index: number, row: ExpenseRow): number => row.id;
  /** OBRS-1592: these cells printed `3,100.00` from a `| number` pipe — a fifth
   * on-screen money format, and the only one with no unit at all. `TranslateService`
   * is the one dependency this presentational component takes; it is a rendering
   * concern, not the Store/HTTP access the class comment rules out. */
  protected formatMoney(value: number | string | null | undefined): string {
    return formatMoney(value, this.translate.currentLang);
  }

}
