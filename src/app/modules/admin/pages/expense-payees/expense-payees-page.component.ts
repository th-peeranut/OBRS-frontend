import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminExpensePayeeDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { AuthService } from '../../../../auth/auth.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { Option } from '../expenses/expenses-page.mappers';
import { ExpensePayeesStore } from './expense-payees.store';
import {
  PAYEE_TYPE_CODES,
  PayeeType,
  findPayeeByExactName,
  sortPayeesByName,
} from './expense-payees.mappers';

/**
 * OBRS-1577 AC6: the registry screen — where an owner renames a garage and retires one they no
 * longer use.
 *
 * <p><b>There is no delete, and that is the point of the screen rather than an omission.</b> A
 * garage that closed still owns every bill it was ever paid, and this system has no second place
 * that history is written down; deleting the row would take the bills' payee with it and leave an
 * owner asking "who was this 30,000 baht paid to" with no way to find out. Retiring hides it from
 * the pickers and changes nothing else. The backend has no DELETE endpoint either — the two halves
 * agree on purpose.
 *
 * <p>Rename is the whole reason the FK in AC2 exists: bills store the payee's ID, never its
 * spelling, so correcting a name here corrects it on every bill at once. A rename onto a name
 * already in the registry is REFUSED by the server rather than merged, because merging moves one
 * payee's payment history onto another and cannot be undone.
 */
@Component({
    selector: 'app-expense-payees-page',
    templateUrl: './expense-payees-page.component.html',
    styleUrl: './expense-payees-page.component.scss',
    standalone: false
})
export class ExpensePayeesPageComponent implements OnInit, OnDestroy {
  protected payees: AdminExpensePayeeDto[] = [];
  protected typeFilterOptions: Option[] = [];
  protected typeOptions: Option[] = [];

  protected selectedTypeFilter = '';
  protected showRetired = false;

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 4 });

  protected isModalOpen = false;
  protected modalMode: 'create' | 'rename' = 'create';
  protected editingPayee: AdminExpensePayeeDto | null = null;
  protected formName = '';
  protected formType: PayeeType = 'GARAGE';
  protected isSubmitting = false;
  protected busyId: number | null = null;

  /**
   * OBRS-1577: may this caller ADD a payee?
   *
   * ⚠️ This page is reachable by an `admin`, and that is not a gap in the route: the FE's
   * ROLE_GRANTS map admin→owner, and the backend's `ROLE_ADMIN > ROLE_OWNER` hierarchy means
   * `hasRole('OWNER')` passes for them, so the GET returns 200. Rename and retire also work for
   * them — both resolve the row through `getCurrentOwnerScope()`, which an admin satisfies.
   *
   * CREATE is the single exception: it needs `getCurrentOwnerId()`, which throws for an admin
   * because they own no fleet for the new row to belong to. `hasHeldRole` (OBRS-1498) rather than
   * `hasAnyRole` is what tells the two apart — `hasAnyRole(['owner'])` is TRUE for an admin, so it
   * would leave a button here whose only outcome is a server error.
   */
  protected readonly canCreate: boolean;

  private allPayees: AdminExpensePayeeDto[] = [];
  private hasLoadedOnce = false;
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: ExpensePayeesStore,
    authService: AuthService
  ) {
    this.canCreate = authService.hasHeldRole(['owner']);
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => this.applyLocalization())
    );
  }

  ngOnInit(): void {
    this.applyLocalization();

    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        // OBRS-506 honor-null convention: clear() (e.g. logout) emits null. Returning early here
        // left the previous session's payee names on screen; `hasLoadedOnce` has to go back with
        // them, because after a clear there IS nothing cached and a later failure is a full-page
        // error again, not a background refresh hint.
        this.hasLoadedOnce = data !== null;
        this.allPayees = data === null ? [] : sortPayeesByName(data);
        this.applyFilters();
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        this.refreshFailed = failed;
        // Only a failure with NOTHING cached is a full-page error; a failed revalidate over cached
        // rows is the refresh hint's job, not a wall that hides data the owner can still read.
        this.errorMessage =
          failed && !this.hasLoadedOnce
            ? this.translate.instant('ADMIN.MESSAGES.LOAD_FAILED')
            : '';
      })
    );

    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected get isLoading(): boolean {
    return !this.hasLoadedOnce && this.isRefreshing;
  }

  protected get isEmpty(): boolean {
    return this.hasLoadedOnce && this.allPayees.length === 0;
  }

  protected get isFilteredEmpty(): boolean {
    return this.hasLoadedOnce && this.allPayees.length > 0 && this.payees.length === 0;
  }

  protected onTypeFilterChange(code: string): void {
    this.selectedTypeFilter = code;
    this.applyFilters();
  }

  protected onShowRetiredChange(show: boolean): void {
    this.showRetired = show;
    this.applyFilters();
  }

  protected openCreateModal(): void {
    if (!this.canCreate) {
      return;
    }
    this.modalMode = 'create';
    this.editingPayee = null;
    this.formName = '';
    this.formType = 'GARAGE';
    this.isModalOpen = true;
  }

  protected openRenameModal(payee: AdminExpensePayeeDto): void {
    this.modalMode = 'rename';
    this.editingPayee = payee;
    this.formName = payee.name;
    this.formType = payee.type;
    this.isModalOpen = true;
  }

  protected closeModal(): void {
    if (this.isSubmitting) {
      return;
    }
    this.isModalOpen = false;
    this.editingPayee = null;
  }

  /**
   * The client-side half of AC5's duplicate guard. The SERVER is the authority — it holds
   * `uq_expense_payees_owner_name` and refuses a rename onto a taken name with a 409 — and this
   * check exists so the common mistake is answered in the dialog the owner is already looking at
   * instead of as an error after they press save.
   */
  protected get nameAlreadyTaken(): boolean {
    const match = findPayeeByExactName(this.allPayees, this.formName);
    return !!match && match.id !== this.editingPayee?.id;
  }

  protected get canSubmit(): boolean {
    if (this.modalMode === 'create' && !this.canCreate) {
      return false;
    }
    return this.formName.trim().length > 0 && !this.nameAlreadyTaken && !this.isSubmitting;
  }

  protected async submitModal(): Promise<void> {
    if (!this.canSubmit) {
      return;
    }

    this.isSubmitting = true;
    const payload = { name: this.formName.trim(), type: this.formType };
    try {
      if (this.modalMode === 'rename' && this.editingPayee) {
        await firstValueFrom(
          this.adminApiService.updateExpensePayee(this.editingPayee.id, payload)
        );
      } else {
        await firstValueFrom(this.adminApiService.createExpensePayee(payload));
      }
      this.isModalOpen = false;
      this.editingPayee = null;
      await this.alertService.success(
        this.translate.instant(
          this.modalMode === 'rename' ? 'ADMIN.MESSAGES.UPDATED' : 'ADMIN.MESSAGES.CREATED'
        )
      );
      await this.store.refresh();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
  }

  /** AC6: retire / restore. Not a delete — see the class javadoc. */
  protected async toggleActive(payee: AdminExpensePayeeDto): Promise<void> {
    if (this.busyId !== null) {
      return;
    }

    this.busyId = payee.id;
    try {
      await firstValueFrom(this.adminApiService.setExpensePayeeActive(payee.id, !payee.active));
      await this.store.refresh();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.busyId = null;
    }
  }

  protected typeLabel(type: PayeeType): string {
    return this.translate.instant(`ADMIN.EXPENSES.PAYEE.TYPES.${type}`);
  }

  protected trackById(_index: number, payee: AdminExpensePayeeDto): number {
    return payee.id;
  }

  private applyLocalization(): void {
    this.typeOptions = PAYEE_TYPE_CODES.map((code) => ({ code, label: this.typeLabel(code) }));
    this.typeFilterOptions = [
      { code: '', label: this.translate.instant('ADMIN.EXPENSES.PAYEE.FILTER_TYPE_ALL') },
      ...this.typeOptions,
    ];
  }

  /** Both filters are client-side over the one list the store holds — see `ExpensePayeesStore` for
   * why it fetches retired rows even though most callers hide them. */
  private applyFilters(): void {
    this.payees = this.allPayees.filter(
      (payee) =>
        (this.showRetired || payee.active) &&
        (!this.selectedTypeFilter || payee.type === this.selectedTypeFilter)
    );
  }
}
