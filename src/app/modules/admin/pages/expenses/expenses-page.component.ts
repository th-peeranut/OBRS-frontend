import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminExpenseDto,
  AdminExpensePayeeDto,
  AdminMaintenancePartDto,
  AdminOwnerDto,
  AdminVehicleDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../auth/auth.service';
import { ExpensesStore } from './expenses.store';
import { VehiclesStore } from '../vehicles/vehicles.store';
import { ExpensePayeesStore } from '../expense-payees/expense-payees.store';
import { MaintenancePartsStore } from '../maintenance-parts/maintenance-parts.store';
import { sortMaintenancePartsByName } from '../maintenance-parts/maintenance-parts.mappers';
import { sortPayeesByName } from '../expense-payees/expense-payees.mappers';
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
  /** OBRS-1577: the ACTIVE payees, for the bill form's picker. The store caches retired ones too
   * (the registry screen needs them to un-retire) — filtering happens HERE so a retired garage can
   * never be offered on a new bill. */
  protected payeeOptions: AdminExpensePayeeDto[] = [];
  /** OBRS-1613: the ACTIVE parts/labour registry, for the bill form's line picker. Filtered HERE
   * for the same reason as the payees above - the store caches retired rows so the registry screen
   * can un-retire them, and a retired part must never be offered on a bill. */
  protected partOptions: AdminMaintenancePartDto[] = [];

  /** OBRS-1627: `''` = all operators. The operator COLUMN became this filter;
   * client-side like the category filter, never a fourth server call. */
  protected selectedOwnerFilter = '';
  protected selectedVehicleFilter = '';
  protected selectedCategoryFilter = '';
  protected centralOnlyFilter = false;
  // OBRS-1626: the date filter is one month, not a free range. Strings because
  // app-admin-dropdown emits the option's `code`; seeded in the constructor so
  // both halves come from the same `new Date()`.
  protected selectedYear: string;
  protected selectedMonth: string;
  protected yearOptions: Option[] = [];
  protected monthOptions: Option[] = [];

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
  /**
   * OBRS-1577: may this caller CREATE a payee from inside the bill form?
   *
   * `hasHeldRole(['owner'])` and NOT `hasAnyRole` — the OBRS-1498 distinction, and this is exactly
   * the case it was written for. Reading, renaming and retiring a payee all go through
   * `getCurrentOwnerScope()`, which an admin satisfies; CREATE alone goes through
   * `getCurrentOwnerId()`, which throws for an admin because they own no fleet to attach the row
   * to. `hasAnyRole(['owner'])` is true for an admin (ROLE_GRANTS maps admin→owner), so using it
   * here would render an "add" button whose only outcome is a server error.
   */
  protected readonly canCreatePayee: boolean;
  /** OBRS-1613: same flag, same reason - CREATE goes through `getCurrentOwnerId()`. */
  protected readonly canCreatePart: boolean;

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
    private readonly payeesStore: ExpensePayeesStore,
    private readonly maintenancePartsStore: MaintenancePartsStore,
    private readonly authService: AuthService
  ) {
    this.canWrite = this.authService.hasAnyRole(['admin', 'owner']);
    this.isAdmin = this.authService.getRoles().includes('admin');
    this.canCreatePayee = this.authService.hasHeldRole(['owner']);
    this.canCreatePart = this.canCreatePayee;

    const today = new Date();
    this.selectedYear = String(today.getFullYear());
    this.selectedMonth = String(today.getMonth() + 1);

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

    // OBRS-1577. A failed payee fetch is deliberately NOT surfaced as a page error and NOT alerted:
    // the expense log is fully usable without it, and the picker degrades to offering nothing —
    // the same reasoning `loadOwners`/`loadPending` below already apply to their own secondary
    // fetches.
    //
    // ⚠️ An `admin` does NOT 403 here, contrary to what "OWNER-only" suggests: WebSecurityConfig
    // declares `ROLE_ADMIN > ROLE_OWNER`, so `hasRole('OWNER')` PASSES for an admin and the GET
    // returns 200. What they get back is `findForPlatform` — every operator's payees merged — for
    // the same reason every other read on this domain does. See `canCreatePayee` below for the one
    // operation where admin is genuinely refused.
    this.subscriptions.add(
      this.payeesStore.data$.subscribe((data) => {
        this.payeeOptions = sortPayeesByName((data ?? []).filter((payee) => payee.active));
      })
    );

    this.subscriptions.add(
      this.maintenancePartsStore.data$.subscribe((data) => {
        this.partOptions = sortMaintenancePartsByName((data ?? []).filter((part) => part.active));
      })
    );

    void this.store.refresh();
    void this.vehiclesStore.refresh();
    void this.payeesStore.refresh();
    void this.maintenancePartsStore.refresh();
    void this.loadOwners();
    void this.loadPending();
  }

  /** OBRS-1577: a payee added from inside the bill form. Revalidating the shared cache is what
   * makes it available on the NEXT bill and on the registry screen without a page reload; the
   * picker has already selected it locally, so nothing on screen waits for this. */
  protected onPayeeCreated(): void {
    void this.payeesStore.refresh();
  }

  /** OBRS-1613: a part added from inside the bill form — same contract as `onPayeeCreated`. */
  protected onPartCreated(): void {
    void this.maintenancePartsStore.refresh();
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

  protected onOwnerFilterChange(value: string): void {
    this.selectedOwnerFilter = String(value ?? '').trim();
    this.applyFilters();
  }

  protected onCategoryFilterChange(value: string): void {
    this.selectedCategoryFilter = String(value ?? '').trim();
    this.applyFilters();
  }

  // `app-admin-dropdown` renders its own placeholder as a clickable option that
  // emits '' (admin-dropdown.component.html:20-32). For the vehicle and category
  // filters above, '' legitimately means "all". A month is not nullable: ''
  // would reach `Number('')` === 0 and `new Date(0, ...)` is the year 1900, so
  // the table would silently go empty. Keep the current selection instead.
  protected onYearChange(value: string): void {
    const year = String(value ?? '').trim();
    if (!year) {
      return;
    }
    this.selectedYear = year;
    this.applyFilters();
  }

  protected onMonthChange(value: string): void {
    const month = String(value ?? '').trim();
    if (!month) {
      return;
    }
    this.selectedMonth = month;
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
      parcelCompensation: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.PARCEL_COMPENSATION'),
      staffWage: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.STAFF_WAGE'),
      utility: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.UTILITY'),
      rent: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.RENT'),
      security: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.SECURITY'),
      softwareFee: this.translate.instant('ADMIN.EXPENSES.CATEGORIES.SOFTWARE_FEE'),
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
    this.rebuildYearOptions();
    this.rebuildMonthOptions();
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
    const year = Number(this.selectedYear);
    const month = Number(this.selectedMonth);
    this.filteredExpenses = filterExpensesByCategoryAndRange(this.expenses, {
      category: this.selectedCategoryFilter,
      centralOnly: this.centralOnlyFilter,
      ownerId: this.selectedOwnerFilter,
      // `new Date(year, month, 0)` is the last day of `month` - the range stays
      // inclusive on both ends, which is what the ISO string compare expects.
      from: new Date(year, month - 1, 1),
      to: new Date(year, month, 0),
    });
  }

  /**
   * OBRS-1626: the year list is built from the dates that actually exist, never
   * from a `year +- N` formula. /admin/reports uses `period.year - 2 + i`, which
   * in 2026 would offer 2027 and 2028 - two years the expense data cannot reach.
   * The current year is always included because it is the default selection.
   */
  private rebuildYearOptions(): void {
    const years = new Set(
      this.expenses.map((row) => row.expenseDate.slice(0, 4)).filter((year) => year.length === 4)
    );
    years.add(this.selectedYear);
    this.yearOptions = [...years]
      .sort((a, b) => b.localeCompare(a))
      .map((year) => ({ code: year, label: year }));
  }

  /** Month names in the active language, so the filter bar reads "สิงหาคม" and
   * not a bare "8" next to "รถ: ทั้งหมด". Rebuilt on language change with the
   * rest of applyLocalization. */
  private rebuildMonthOptions(): void {
    const formatter = new Intl.DateTimeFormat(this.translate.currentLang || 'th', {
      month: 'long',
    });
    this.monthOptions = Array.from({ length: 12 }, (_, index) => ({
      code: String(index + 1),
      label: formatter.format(new Date(2000, index, 1)),
    }));
  }
}
