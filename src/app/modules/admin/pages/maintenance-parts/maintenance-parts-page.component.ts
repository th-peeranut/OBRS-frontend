import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminMaintenancePartDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { AuthService } from '../../../../auth/auth.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { Option } from '../expenses/expenses-page.mappers';
import { MaintenancePartsStore } from './maintenance-parts.store';
import {
  MAINTENANCE_PART_KIND_CODES,
  MaintenancePartKind,
  findMaintenancePartByExactName,
  isMergedPart,
  isSeededPart,
  maintenancePartLabel,
  mergeableTargets,
  sortMaintenancePartsByName,
} from './maintenance-parts.mappers';

/**
 * OBRS-1613 AC1: the registry screen — one list of parts and labour, shared by the maintenance plan
 * and the repair bill, that the owner can edit.
 *
 * <p><b>Why the shared list is the point rather than a convenience.</b> The vocabulary used to be
 * `EMaintenancePart`, 13 values fixed in Java. Counted against real bills on 2026-08-25, exactly 1
 * of 14 lines could be named at all. A second list just for bills was the obvious fix and is the one
 * `V113__create_expense_items.sql` argued against in its own header: two lists in one system means
 * "how many times did I change the brake pads" has two answers and no way to tell which is right.
 *
 * <p><b>There is no delete, deliberately.</b> This row is the only thing tying every plan and every
 * bill line that ever named it together; deleting it would take that history with it. Retiring hides
 * it from the pickers and changes nothing else. The backend has no DELETE endpoint either — the two
 * halves agree on purpose, exactly as they do for the payee registry.
 *
 * <p><b>Renaming a SEEDED row discards its translations, and the dialog says so.</b> The 13 rows the
 * system seeded carry their old enum code, which is still the i18n key, so they read correctly in
 * en/zh. The server clears that code on rename — the translations describe the old spelling and
 * would be a lie against the new one — and nothing on any screen can put it back. The owner's ruling
 * on 2026-08-25 was that the 13 keep their translations, so the screen may not discard them quietly;
 * it may still offer the rename, because being able to fix a name is the entire reason this card
 * exists.
 */
@Component({
    selector: 'app-maintenance-parts-page',
    templateUrl: './maintenance-parts-page.component.html',
    styleUrl: './maintenance-parts-page.component.scss',
    standalone: false
})
export class MaintenancePartsPageComponent implements OnInit, OnDestroy {
  protected parts: AdminMaintenancePartDto[] = [];
  protected kindFilterOptions: Option[] = [];
  protected kindOptions: Option[] = [];

  protected selectedKindFilter = '';
  protected showRetired = false;
  protected showMerged = false;

  /**
   * OBRS-1634 AC8: merged-away rows, fetched SEPARATELY from `store.data$` — see the store's
   * `getMaintenanceParts` javadoc for why. `store` stays the plain unmerged superset every picker
   * sharing it already relies on; this page alone also asks for the merged rows via
   * `includeMerged=true` and folds them into `parts` only when `showMerged` is on.
   */
  private mergedParts: AdminMaintenancePartDto[] = [];

  protected isMergeModalOpen = false;
  protected mergeSourcePart: AdminMaintenancePartDto | null = null;
  protected mergeCandidates: AdminMaintenancePartDto[] = [];

  protected isReopenModalOpen = false;
  protected reopenTargetPart: AdminMaintenancePartDto | null = null;
  protected isReopening = false;

  // mirroring RoleManagementPageComponent.reloadStructureBound / the vehicle/promotion/user
  // form-modal precedent — an arrow field so `this` survives being passed as a template value.
  protected readonly reloadMaintenancePartsBound = async (): Promise<void> => {
    await this.store.refresh();
    await this.refreshMergedParts();
  };

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 4 });

  protected isModalOpen = false;
  protected modalMode: 'create' | 'rename' = 'create';
  protected editingPart: AdminMaintenancePartDto | null = null;
  protected formName = '';
  protected formKind: MaintenancePartKind = 'PART';
  protected isSubmitting = false;
  protected busyId: number | null = null;

  /**
   * OBRS-1613: may this caller ADD an entry?
   *
   * The same split the payee registry has, for the same reason. An `admin` reaches this page — the
   * FE's ROLE_GRANTS map admin→owner and the backend's ROLE_ADMIN > ROLE_OWNER hierarchy means
   * `hasRole('OWNER')` passes — and rename and retire work for them, because both resolve the row
   * through `getCurrentOwnerScope()`. CREATE is the exception: it needs `getCurrentOwnerId()`, which
   * throws for an admin because they own no fleet for the new row to belong to. `hasHeldRole`
   * (OBRS-1498) is what tells the two apart; `hasAnyRole(['owner'])` is TRUE for an admin and would
   * leave a button here whose only outcome is a server error.
   */
  protected readonly canCreate: boolean;

  private allParts: AdminMaintenancePartDto[] = [];
  private hasLoadedOnce = false;
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: MaintenancePartsStore,
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
        // OBRS-506 honor-null convention: clear() (e.g. logout) emits null, and `hasLoadedOnce` has
        // to go back with the rows — after a clear there IS nothing cached, so a later failure is a
        // full-page error again rather than a background refresh hint.
        this.hasLoadedOnce = data !== null;
        this.allParts = data === null ? [] : sortMaintenancePartsByName(data);
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
        // rows is the refresh hint's job, not a wall over data the owner can still read.
        this.errorMessage =
          failed && !this.hasLoadedOnce
            ? this.translate.instant('ADMIN.MESSAGES.LOAD_FAILED')
            : '';
      })
    );

    void this.store.refresh();
    void this.refreshMergedParts();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected get isLoading(): boolean {
    return !this.hasLoadedOnce && this.isRefreshing;
  }

  protected get isEmpty(): boolean {
    return this.hasLoadedOnce && this.allParts.length === 0;
  }

  protected get isFilteredEmpty(): boolean {
    return this.hasLoadedOnce && this.allParts.length > 0 && this.parts.length === 0;
  }

  protected onKindFilterChange(code: string): void {
    this.selectedKindFilter = code;
    this.applyFilters();
  }

  protected onShowRetiredChange(show: boolean): void {
    this.showRetired = show;
    this.applyFilters();
  }

  protected onShowMergedChange(show: boolean): void {
    this.showMerged = show;
    this.applyFilters();
  }

  protected openCreateModal(): void {
    if (!this.canCreate) {
      return;
    }
    this.modalMode = 'create';
    this.editingPart = null;
    this.formName = '';
    this.formKind = 'PART';
    this.isModalOpen = true;
  }

  protected openRenameModal(part: AdminMaintenancePartDto): void {
    this.modalMode = 'rename';
    this.editingPart = part;
    // The row's OWN name, not its translation: renaming edits what is stored, and pre-filling an
    // English label would have an owner on the en locale save "Engine oil" as the Thai name.
    this.formName = part.name;
    this.formKind = part.kind;
    this.isModalOpen = true;
  }

  protected closeModal(): void {
    if (this.isSubmitting) {
      return;
    }
    this.isModalOpen = false;
    this.editingPart = null;
  }

  /** Is the row being renamed one of the 13 the system seeded — i.e. does saving discard en/zh? */
  protected get isRenamingSeededPart(): boolean {
    return this.modalMode === 'rename' && !!this.editingPart && isSeededPart(this.editingPart);
  }

  /**
   * OBRS-1613 AC2, client side, and it says two DIFFERENT things depending on the mode — because the
   * server does two different things.
   *
   * <p>On CREATE a name already on record is not an error at all: the endpoint is idempotent by
   * normalized name and hands back the row that exists (reactivating it if it was retired). The
   * dialog says "we will use the existing one" and leaves the button enabled, because disabling it
   * would be a lie about what pressing it does.
   *
   * <p>On RENAME the same collision is a 409 and the save genuinely cannot go through, so the button
   * is disabled. Renaming onto an existing name would be a merge, and a merge re-points one entry's
   * price history onto another with no undo.
   *
   * <p>And on CREATE there is a third case, which `kindConflict` below answers: the reuse only
   * happens when the KIND matches too.
   */
  protected get nameCollision(): AdminMaintenancePartDto | null {
    const match = findMaintenancePartByExactName(this.allParts, this.formName);
    return match && match.id !== this.editingPart?.id ? match : null;
  }

  /**
    * The collision that is a real error on BOTH paths: one name cannot be a part and a labour item
    * at once, so `createPart` runs `assertSameKind` before its idempotent-reuse branch and 409s.
    *
    * <p>Found by review, not by me. Without this the create dialog showed "we will use the existing
    * one" for a same-name-other-kind entry and left the button enabled, so the owner pressed save on
    * a promise the server then refused — the exact class of lie the reuse message exists to avoid.
    */
  protected get kindConflict(): boolean {
    const match = this.nameCollision;
    return this.modalMode === 'create' && !!match && match.kind !== this.formKind;
  }

  protected get canSubmit(): boolean {
    if (this.modalMode === 'create' && !this.canCreate) {
      return false;
    }
    if (this.modalMode === 'rename' && this.nameCollision) {
      return false;
    }
    if (this.kindConflict) {
      return false;
    }
    return this.formName.trim().length > 0 && !this.isSubmitting;
  }

  protected async submitModal(): Promise<void> {
    if (!this.canSubmit) {
      return;
    }

    this.isSubmitting = true;
    const payload = { name: this.formName.trim(), kind: this.formKind };
    try {
      if (this.modalMode === 'rename' && this.editingPart) {
        await firstValueFrom(
          this.adminApiService.updateMaintenancePart(this.editingPart.id, payload)
        );
      } else {
        await firstValueFrom(this.adminApiService.createMaintenancePart(payload));
      }
      this.isModalOpen = false;
      this.editingPart = null;
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

  /** Retire / restore. Not a delete — see the class javadoc. */
  protected async toggleActive(part: AdminMaintenancePartDto): Promise<void> {
    if (this.busyId !== null) {
      return;
    }

    this.busyId = part.id;
    try {
      await firstValueFrom(this.adminApiService.setMaintenancePartActive(part.id, !part.active));
      await this.store.refresh();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.busyId = null;
    }
  }

  /** The owner's 2026-08-25 ruling, rendered: seeded rows through the bundle, typed rows verbatim. */
  protected partLabel(part: AdminMaintenancePartDto): string {
    return maintenancePartLabel(part, (key) => this.translate.instant(key));
  }

  protected isSeeded(part: AdminMaintenancePartDto): boolean {
    return isSeededPart(part);
  }

  protected isMerged(part: AdminMaintenancePartDto): boolean {
    return isMergedPart(part);
  }

  /** OBRS-1634 AC8: the winner's display name for a merged-away row. The winner is never itself
   * merged (no chains), so it is always in `allParts` — the plain unmerged superset. */
  protected mergedIntoLabel(part: AdminMaintenancePartDto): string {
    if (part.mergedIntoId === null) {
      return '';
    }
    const target = this.allParts.find((candidate) => candidate.id === part.mergedIntoId);
    return target ? this.partLabel(target) : '';
  }

  /** OBRS-1634 AC1/AC4: opens the merge dialog for `part` — the entry about to be folded away.
   * `mergeCandidates` is computed here (from the plain unmerged superset) rather than inside the
   * modal, so the modal stays a pure consumer of its inputs. */
  protected openMergeModal(part: AdminMaintenancePartDto): void {
    this.mergeSourcePart = part;
    this.mergeCandidates = mergeableTargets(this.allParts, part);
    this.isMergeModalOpen = true;
  }

  protected onMergeModalClosed(): void {
    this.isMergeModalOpen = false;
    this.mergeSourcePart = null;
    this.mergeCandidates = [];
  }

  /** OBRS-1634 AC8: opens the "เปิดใช้ชื่อนี้อีกครั้ง" confirm for a merged-away row. */
  protected openReopenModal(part: AdminMaintenancePartDto): void {
    this.reopenTargetPart = part;
    this.isReopenModalOpen = true;
  }

  protected closeReopenModal(): void {
    if (this.isReopening) {
      return;
    }
    this.isReopenModalOpen = false;
    this.reopenTargetPart = null;
  }

  protected async confirmReopen(): Promise<void> {
    if (!this.reopenTargetPart || this.isReopening) {
      return;
    }
    const id = this.reopenTargetPart.id;
    this.isReopening = true;
    try {
      await firstValueFrom(this.adminApiService.unmergeMaintenancePart(id));
      this.isReopenModalOpen = false;
      this.reopenTargetPart = null;
      await this.alertService.success(
        this.translate.instant('ADMIN.MAINTENANCE_PARTS.REOPEN_SUCCESS')
      );
      await this.store.refresh();
      await this.refreshMergedParts();
    } catch (error) {
      // AC9: a name clash is a 409 whose body names the blocking entry — rendered as-is, never a
      // generic message, so the owner knows which name is in the way.
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isReopening = false;
    }
  }

  protected kindLabel(kind: MaintenancePartKind): string {
    return this.translate.instant(`ADMIN.MAINTENANCE_PARTS.KINDS.${kind}`);
  }

  protected trackById(_index: number, part: AdminMaintenancePartDto): number {
    return part.id;
  }

  private applyLocalization(): void {
    this.kindOptions = MAINTENANCE_PART_KIND_CODES.map((code) => ({
      code,
      label: this.kindLabel(code),
    }));
    this.kindFilterOptions = [
      { code: '', label: this.translate.instant('ADMIN.MAINTENANCE_PARTS.FILTER_KIND_ALL') },
      ...this.kindOptions,
    ];
  }

  /** Both filters are client-side over the one list the store holds — see `MaintenancePartsStore`
   * for why it fetches retired rows even though most callers hide them. OBRS-1634: `showMerged`
   * folds `mergedParts` (fetched separately, never through the shared store) into the same table
   * on request — the active/retired filter does not apply to a merged row, because "merged" is a
   * separate, stronger state than "retired" and whatever `active` happens to be underneath it is
   * not what the toggle means to the owner. */
  private applyFilters(): void {
    const byKind = (part: AdminMaintenancePartDto): boolean =>
      !this.selectedKindFilter || part.kind === this.selectedKindFilter;
    const normal = this.allParts.filter((part) => (this.showRetired || part.active) && byKind(part));
    const merged = this.showMerged ? this.mergedParts.filter(byKind) : [];
    this.parts = sortMaintenancePartsByName([...normal, ...merged]);
  }

  /** OBRS-1634 AC8: the merged-away rows, asked for explicitly (`includeMerged=true`) and kept out
   * of `store`/`allParts` — see the class javadoc on `mergedParts`. A fetch failure here degrades
   * to "no merged rows shown" rather than a page error: this is a supplementary view, and the
   * primary registry (via `store`) is unaffected either way. */
  private async refreshMergedParts(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.adminApiService.getMaintenanceParts(null, true, true)
      );
      this.mergedParts = (response?.data ?? []).filter((part) => isMergedPart(part));
    } catch {
      this.mergedParts = [];
    }
    this.applyFilters();
  }
}
