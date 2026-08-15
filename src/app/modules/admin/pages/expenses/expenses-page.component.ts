import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminExpenseDto,
  AdminOwnerDto,
  AdminVehicleDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../auth/auth.service';
import { ExpensesStore } from './expenses.store';
import { VehiclesStore } from '../vehicles/vehicles.store';
import {
  ExpenseRow,
  Option,
  VEHICLE_CENTRAL_SENTINEL,
  filterExpensesByCategoryAndRange,
  toExpenseCategoryOptions,
  toExpenseRow,
  toExpenseVehicleOptions,
  toOwnerOptions,
  vehicleIdentifier,
} from './expenses-page.mappers';

/**
 * Vehicle / central expense log — OBRS-685 (Epic OBRS-684).
 *
 * Mirrors the OBRS-261 vehicles-page split: this page owns only the store
 * subscriptions, localization, option lists, the three filter mechanisms
 * (§6.2 of the UX spec — vehicle is server-side, category/date-range are
 * client-side pure functions), and modal open/close + delete orchestration.
 * `ExpenseListTableComponent` / `ExpenseFormModalComponent` /
 * `ExpenseDeleteModalComponent` are the dumb children.
 *
 * Reuses `VehiclesStore` (already root-scoped, cached) for the vehicle
 * option list rather than adding a second vehicle fetch — DRY per
 * design-system/CLAUDE.md's reuse-before-you-write gate.
 */
@Component({
    selector: 'app-expenses-page',
    templateUrl: './expenses-page.component.html',
    styleUrl: './expenses-page.component.scss',
    standalone: false
})
export class ExpensesPageComponent implements OnInit, OnDestroy {
  protected readonly VEHICLE_CENTRAL_SENTINEL = VEHICLE_CENTRAL_SENTINEL;

  protected expenses: ExpenseRow[] = [];
  protected filteredExpenses: ExpenseRow[] = [];
  protected vehicleOptions: Option[] = [];
  protected vehicleFilterOptions: Option[] = [];
  protected categoryOptions: Option[] = [];
  /** OBRS-808: only ever populated for an `admin` — the roster endpoint 403s
   * everyone else, so it is not even requested for them. */
  protected ownerOptions: Option[] = [];

  protected selectedVehicleFilter = '';
  protected selectedCategoryFilter = '';
  protected centralOnlyFilter = false;
  protected dateFrom: Date | null = null;
  protected dateTo: Date | null = null;

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected errorMessage = '';

  // OBRS-1356 — the owner's review queue. Its own fetch, not a slice of the
  // main list: the list is vehicle-filtered server-side, and a worklist that
  // empties when you filter by vehicle would look finished when it is not.
  protected pendingExpenses: ExpenseRow[] = [];
  protected approvalBusyId: number | null = null;
  private rawPendingExpenses: AdminExpenseDto[] = [];

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isDeleting = false;
  protected mode: 'create' | 'edit' = 'create';
  protected selectedExpense: ExpenseRow | null = null;

  protected readonly canWrite: boolean;
  /**
   * OBRS-808. `getRoles().includes('admin')` — the same test
   * `UsabilityReportsPageComponent` uses, deliberately NOT `canWrite` above,
   * which is `['admin', 'owner']`. An owner may write expenses and must still
   * never see the operator picker: the server derives their operator from the
   * principal and ignores any `ownerId` they send, so the control would do
   * nothing. Two different questions, two different flags.
   */
  protected readonly isAdmin: boolean;

  // Bound reloader passed to the form modal (arrow closes over `this`),
  // mirroring VehiclesPageComponent.reloadStructureBound.
  protected readonly reloadStructureBound = () => this.store.refresh();

  private readonly subscriptions = new Subscription();

  private rawExpenses: AdminExpenseDto[] = [];
  private rawVehicles: AdminVehicleDto[] = [];
  private rawOwners: AdminOwnerDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: ExpensesStore,
    private readonly vehiclesStore: VehiclesStore,
    private readonly authService: AuthService
  ) {
    this.canWrite = this.authService.hasAnyRole(['admin', 'owner']);
    this.isAdmin = this.authService.getRoles().includes('admin');

    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.applyLocalization();
      })
    );
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        // OBRS-506 honor-null convention: clear() (e.g. logout) emits null —
        // fall back to [] rather than keeping a previous session's rows.
        this.rawExpenses = data ?? [];
        this.applyLocalization();
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        this.refreshFailed = failed && this.store.hasValue;
        if (failed && !this.store.hasValue) {
          this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_EXPENSES_FAILED');
        } else {
          this.errorMessage = '';
        }
      })
    );
    this.subscriptions.add(
      this.vehiclesStore.data$.subscribe((data) => {
        this.rawVehicles = data?.vehicles ?? [];
        this.applyLocalization();
      })
    );

    void this.store.refresh();
    void this.vehiclesStore.refresh();
    void this.loadOwners();
    void this.loadPending();
  }

  /**
   * OBRS-1356. A failure here is NOT alerted and NOT surfaced as a page error:
   * the expense log itself is unaffected, and the lane renders nothing when it
   * has no rows — the same reasoning `loadOwners` above already applies to the
   * operator roster.
   */
  private async loadPending(): Promise<void> {
    if (!this.canWrite) {
      return;
    }
    try {
      const response = await firstValueFrom(this.adminApiService.getPendingExpenses());
      this.rawPendingExpenses = response?.data ?? [];
    } catch {
      this.rawPendingExpenses = [];
    }
    this.applyLocalization();
  }

  protected async onApproveExpense(id: number): Promise<void> {
    await this.ruleOnExpense(id, () => firstValueFrom(this.adminApiService.approveExpense(id)));
  }

  protected async onRejectExpense(event: { id: number; rejectionReason: string }): Promise<void> {
    await this.ruleOnExpense(event.id, () =>
      firstValueFrom(this.adminApiService.rejectExpense(event.id, event.rejectionReason))
    );
  }

  /**
   * Both verdicts refresh the expense LIST as well as the queue: an approved
   * row changes what the P&L counts, and leaving the list stale would show the
   * owner the state they just left.
   */
  private async ruleOnExpense(id: number, call: () => Promise<unknown>): Promise<void> {
    if (this.approvalBusyId !== null) return;
    this.approvalBusyId = id;
    try {
      await call();
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      await this.loadPending();
      await this.store.refresh();
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

  /**
   * OBRS-808: fetch the operator roster, admin only.
   *
   * Guarded on the role rather than attempted-and-caught: for an `owner` the
   * endpoint answers 403 by design, so calling it would be requesting a refusal
   * on every page load and teaching anyone reading the network tab that the
   * refusal is normal. A failure here is NOT alerted — the page still loads and
   * lists expenses fine; the consequence is confined to the create modal, which
   * says so itself (`ownerRosterUnavailable`). Alerting on page load for a
   * control the user may not even open would be noise.
   */
  private async loadOwners(): Promise<void> {
    if (!this.isAdmin) {
      return;
    }
    try {
      const response = await firstValueFrom(this.adminApiService.getOwners());
      this.rawOwners = response?.data ?? [];
    } catch {
      this.rawOwners = [];
    }
    this.applyLocalization();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Skeletons only while loading with no cached data yet. */
  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  /** True 200 + [] — the true "no expenses yet" empty state (§8), independent
   * of whatever category/date filter is currently set (that distinction is
   * `rows.length === 0 && !isEmpty` inside the list table). */
  protected get isEmpty(): boolean {
    return !this.isLoading && !this.errorMessage && this.expenses.length === 0;
  }

  protected onVehicleFilterChange(value: string): void {
    const raw = String(value ?? '').trim();
    this.selectedVehicleFilter = raw;
    this.centralOnlyFilter = raw === VEHICLE_CENTRAL_SENTINEL;
    // §6.2: "All" (raw === '') and "central only" (raw === sentinel) both
    // fetch the UNFILTERED set — the sentinel choice narrows client-side
    // only, never a fourth server call. A specific vehicle id scopes the
    // server fetch itself.
    const vehicleId = raw === '' || raw === VEHICLE_CENTRAL_SENTINEL ? null : Number(raw);
    this.store.setVehicleFilter(vehicleId);
    this.applyFilters();
  }

  protected onCategoryFilterChange(value: string): void {
    this.selectedCategoryFilter = String(value ?? '').trim();
    this.applyFilters();
  }

  protected onFromDateChange(value: Date | null): void {
    this.dateFrom = value;
    this.applyFilters();
  }

  protected onToDateChange(value: Date | null): void {
    this.dateTo = value;
    this.applyFilters();
  }

  protected openCreateModal(): void {
    this.mode = 'create';
    this.selectedExpense = null;
    this.isFormModalOpen = true;
  }

  protected openEditModal(expense: ExpenseRow): void {
    this.mode = 'edit';
    this.selectedExpense = expense;
    this.isFormModalOpen = true;
  }

  protected onFormModalClosed(): void {
    this.isFormModalOpen = false;
    this.selectedExpense = null;
  }

  protected openDeleteModal(expense: ExpenseRow): void {
    this.selectedExpense = expense;
    this.isDeleteModalOpen = true;
  }

  protected closeDeleteModal(force = false): void {
    if (this.isDeleting && !force) {
      return;
    }
    this.isDeleteModalOpen = false;
    this.selectedExpense = null;
  }

  protected async confirmDelete(): Promise<void> {
    if (!this.selectedExpense) {
      return;
    }

    this.isDeleting = true;
    try {
      await firstValueFrom(this.adminApiService.deleteExpense(this.selectedExpense.id));
      const id = this.selectedExpense.id;
      // Optimistic row removal (§5) — updates synchronously without waiting
      // on the background revalidate.
      this.store.mutate((rows) => rows.filter((row) => row.id !== id));
      this.closeDeleteModal(true);
      const refresh = this.store.refresh();
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      await refresh;
    } catch (error) {
      this.closeDeleteModal(true);
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isDeleting = false;
    }
  }

  // Re-derive every locale-dependent view field from the DTOs already in
  // memory. Runs on initial load, vehicle-list arrival, and language change.
  private applyLocalization(): void {
    const locale = this.getCurrentLocale();
    const centralLabel = this.translate.instant('ADMIN.EXPENSES.VEHICLE_CENTRAL_OPTION');

    this.categoryOptions = toExpenseCategoryOptions({
      fuel: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.FUEL'),
      repair: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.REPAIR'),
      vehicleTax: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.VEHICLE_TAX'),
      act: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.ACT'),
      insurance: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.INSURANCE'),
      inspection: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.INSPECTION'),
      tire: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.TIRE'),
      gps: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.GPS'),
      toll: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.TOLL'),
      permitFee: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.PERMIT_FEE'),
      driverWage: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.DRIVER_WAGE'),
      instalment: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.INSTALMENT'),
      parkingFee: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.PARKING_FEE'),
      central: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.CENTRAL'),
      other: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.OTHER'),
    });

    this.vehicleOptions = toExpenseVehicleOptions(this.rawVehicles, centralLabel);
    this.vehicleFilterOptions = [
      ...this.rawVehicles.map((vehicle) => ({
        code: String(vehicle.id),
        label: vehicleIdentifier(vehicle),
      })),
      {
        code: VEHICLE_CENTRAL_SENTINEL,
        label: this.translate.instant('ADMIN.EXPENSES.FILTER_VEHICLE_CENTRAL_ONLY'),
      },
    ];

    this.ownerOptions = toOwnerOptions(this.rawOwners);

    this.expenses = this.rawExpenses.map((dto) =>
      toExpenseRow(
        dto,
        this.rawVehicles,
        this.categoryOptions,
        centralLabel,
        this.translate.currentLang,
        this.rawOwners
      )
    );
    // OBRS-1356: the review queue is mapped through the SAME toExpenseRow, so
    // a vehicle/category label can never read one way in the lane and another
    // way in the log below it.
    this.pendingExpenses = this.rawPendingExpenses.map((dto) =>
      toExpenseRow(
        dto,
        this.rawVehicles,
        this.categoryOptions,
        centralLabel,
        this.translate.currentLang,
        this.rawOwners
      )
    );
    this.applyFilters();
  }

  // NOTE: `||` short-circuit is deliberate — see vehicles-page.component.ts's
  // identical private getCurrentLocale for why.
  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();
    return rawLocale.startsWith('en') ? 'en' : 'th';
  }

  private applyFilters(): void {
    this.filteredExpenses = filterExpensesByCategoryAndRange(this.expenses, {
      category: this.selectedCategoryFilter,
      centralOnly: this.centralOnlyFilter,
      from: this.dateFrom,
      to: this.dateTo,
    });
  }
}
