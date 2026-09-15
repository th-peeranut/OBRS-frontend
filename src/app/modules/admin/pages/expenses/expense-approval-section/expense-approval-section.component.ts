import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminVehicleDto,
  PendingExpenseGroupDto,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { VehiclesStore } from '../../vehicles/vehicles.store';
import {
  ExpenseApprovalGroupRow,
  Option,
  toExpenseApprovalGroupRow,
  toExpenseCategoryOptionsFrom,
} from '../expenses-page.mappers';

/**
 * OBRS-1727 AC-1 — the owner's expense review queue, now a section of
 * `/admin/settlements` rather than of `/admin/expenses`.
 *
 * Smart, because `ExpenseApprovalLaneComponent` is dumb and the settlements
 * page has neither the pending rows nor the vehicle/category labels they need.
 * Wrapping it here rather than folding ~70 lines of expense machinery into the
 * 769-line `SettlementsPageComponent` keeps that page about rounds and boxes,
 * which is what every other section on it is about.
 *
 * No role flag of its own: the route already carries `requiredRoles:
 * ['admin', 'owner']` (OBRS-196), which is the same audience `canWrite` gated
 * the lane with on the page it came from.
 */
@Component({
    selector: 'app-expense-approval-section',
    templateUrl: './expense-approval-section.component.html',
    styleUrl: './expense-approval-section.component.scss',
    standalone: false
})
export class ExpenseApprovalSectionComponent implements OnInit, OnDestroy {
  protected pendingExpenses: ExpenseApprovalGroupRow[] = [];
  /** The composite action key (`bill:<settleId>` / `exp:<id>`) of the row currently being ruled on. */
  protected approvalBusyId: string | null = null;

  private readonly subscriptions = new Subscription();
  private rawPendingGroups: PendingExpenseGroupDto[] = [];
  private rawVehicles: AdminVehicleDto[] = [];
  private categoryOptions: Option[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly vehiclesStore: VehiclesStore
  ) {
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => this.applyLocalization())
    );
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.vehiclesStore.data$.subscribe((data) => {
        this.rawVehicles = data?.vehicles ?? [];
        this.applyLocalization();
      })
    );
    void this.vehiclesStore.refresh();
    void this.loadPending();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /**
   * A failed fetch leaves the queue empty and is NOT alerted — the same choice
   * this method made on `/admin/expenses`: the rest of the settlements page is
   * fully usable without it, and the lane renders nothing when it has no rows.
   */
  private async loadPending(): Promise<void> {
    try {
      const response = await firstValueFrom(this.adminApiService.getPendingExpenses());
      this.rawPendingGroups = response?.data ?? [];
    } catch {
      this.rawPendingGroups = [];
    }
    this.applyLocalization();
  }

  /** OBRS-1891: a `SETTLE_BILL` row rules on `row.settleId` via the whole-bill endpoints; a
   * `SINGLE` row rules on `row.expenseId` via the pre-OBRS-1891 per-expense endpoints. */
  protected async onApproveExpense(row: ExpenseApprovalGroupRow): Promise<void> {
    const call =
      row.groupType === 'SETTLE_BILL'
        ? () => firstValueFrom(this.adminApiService.approveExpenseSettle(row.settleId as number))
        : () => firstValueFrom(this.adminApiService.approveExpense(row.expenseId as number));
    await this.ruleOnRow(row, call);
  }

  protected async onRejectExpense(event: {
    row: ExpenseApprovalGroupRow;
    rejectionReason: string;
  }): Promise<void> {
    const { row, rejectionReason } = event;
    const call =
      row.groupType === 'SETTLE_BILL'
        ? () =>
            firstValueFrom(this.adminApiService.rejectExpenseSettle(row.settleId as number, rejectionReason))
        : () => firstValueFrom(this.adminApiService.rejectExpense(row.expenseId as number, rejectionReason));
    await this.ruleOnRow(row, call);
  }

  private async ruleOnRow(row: ExpenseApprovalGroupRow, call: () => Promise<unknown>): Promise<void> {
    if (this.approvalBusyId !== null) return;
    this.approvalBusyId = row.actionKey;
    try {
      await call();
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      await this.loadPending();
    } catch (error) {
      // The backend's own message when it sent one (EXPENSE_NOT_PENDING names
      // the status it is already in), the generic line when it did not.
      this.alertService.error(
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.EXPENSES.APPROVAL.FAILED')
      );
    } finally {
      this.approvalBusyId = null;
    }
  }

  private applyLocalization(): void {
    this.categoryOptions = toExpenseCategoryOptionsFrom((key) => this.translate.instant(key));
    const centralLabel = this.translate.instant('ADMIN.EXPENSES.VEHICLE_CENTRAL_OPTION');
    const gasBillLabel = this.translate.instant('ADMIN.EXPENSES.APPROVAL.GAS_BILL');

    this.pendingExpenses = this.rawPendingGroups.map((dto) =>
      toExpenseApprovalGroupRow(
        dto,
        this.rawVehicles,
        this.categoryOptions,
        centralLabel,
        gasBillLabel,
        this.translate.currentLang
      )
    );
  }
}
