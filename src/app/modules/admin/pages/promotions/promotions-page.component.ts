import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { AdminApiService, PromotionRespDto } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { PromotionsListStore } from './promotions-list.store';
import {
  Option,
  PromotionRow,
  buildPromotionOptionLists,
  toRow,
} from './promotions-page.mappers';

/**
 * Promotions list + CRUD (OBRS-109 / #37). Hosts RoundTripPromotionCardComponent
 * (unchanged singleton edit surface, moved verbatim) at the top, and the
 * general promotions list/create/edit/soft-delete below — modeled on
 * VehiclesPageComponent's skeleton (list + create/edit modal + confirm modal,
 * AdminCollectionStore-backed).
 *
 * OBRS-251 (Phase 2 split, mirroring routes OBRS-212/213): thinned down to
 * an orchestrator. The list table, the create/edit form modal, and the
 * deactivate-confirm modal are now child components
 * (PromotionListTableComponent / PromotionFormModalComponent /
 * PromotionDeactivateModalComponent) — this page owns only the store
 * subscriptions, localization, option lists, and the modal open/close +
 * soft-delete orchestration state.
 */
@Component({
  selector: 'app-promotions-page',
  templateUrl: './promotions-page.component.html',
  styleUrl: './promotions-page.component.scss',
})
export class PromotionsPageComponent implements OnInit, OnDestroy {
  protected rows: PromotionRow[] = [];
  protected discountTypeOptions: Option[] = [];
  protected statusOptions: Option[] = [];
  protected autoApplyOptions: Option[] = [];

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected errorMessage = '';

  protected isFormModalOpen = false;
  protected isDeactivateModalOpen = false;
  protected isDeactivating = false;
  protected mode: 'create' | 'edit' = 'create';
  protected selectedPromotion: PromotionRow | null = null;

  // Bound reloader passed to the form modal so it can refresh the list after
  // it closes and shows its own success alert (arrow closes over `this`,
  // mirroring RoutesPageComponent's reloadStructureBound). Called LAST in
  // the child's submitPromotion, after close + alert — same order as the
  // pre-split store.refresh() call.
  protected readonly reloadStructureBound = () => this.store.refresh();

  private readonly subscriptions = new Subscription();

  private rawPromotions: PromotionRespDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: PromotionsListStore
  ) {
    // Language change only swaps displayed translations; data is already
    // loaded, so re-derive the view locally instead of re-fetching.
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.buildOptionLists();
        this.applyLocalization();
      })
    );
  }

  ngOnInit(): void {
    this.buildOptionLists();

    this.subscriptions.add(
      // OBRS-506: honor a null emission (OBRS-467 shape) — clear() (e.g.
      // logout) DISCARDS the cached value; the old `if (data)` guard kept the
      // previous session's rows on screen. applyLocalization() is safe over
      // an empty array (map of []).
      this.store.data$.subscribe((data) => {
        this.rawPromotions = data ?? [];
        this.applyLocalization();
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        this.refreshFailed = failed && this.store.hasValue;
        this.errorMessage =
          failed && !this.store.hasValue
            ? this.translate.instant('ADMIN.MESSAGES.LOAD_PROMOTIONS_FAILED')
            : '';
      })
    );
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Skeletons only while loading with no cached data yet. */
  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  // design-system.md §3.1: create starts every select empty (field-name
  // placeholder) — no pre-seeded default, unlike the round-trip card's
  // documented singleton-edit exception above. (Enforced inside
  // PromotionFormModalComponent.initCreateForm.)
  protected openCreateModal(): void {
    this.mode = 'create';
    this.selectedPromotion = null;
    this.isFormModalOpen = true;
  }

  protected openEditModal(row: PromotionRow): void {
    this.mode = 'edit';
    this.selectedPromotion = row;
    this.isFormModalOpen = true;
  }

  protected onFormModalClosed(): void {
    this.isFormModalOpen = false;
    this.selectedPromotion = null;
  }

  protected openDeactivateModal(row: PromotionRow): void {
    this.selectedPromotion = row;
    this.isDeactivateModalOpen = true;
  }

  protected closeDeactivateModal(force = false): void {
    if (this.isDeactivating && !force) {
      return;
    }

    this.isDeactivateModalOpen = false;
    this.selectedPromotion = null;
  }

  // Soft-delete: DELETE /{id} flips the row to Inactive server-side — the
  // row is never removed from the list (see docs/handoff.md Contract
  // Request). Optimistically reflect that locally before the background
  // revalidate lands.
  protected async confirmDeactivate(): Promise<void> {
    if (!this.selectedPromotion) {
      return;
    }

    this.isDeactivating = true;
    try {
      const id = this.selectedPromotion.id;
      await firstValueFrom(this.adminApiService.deletePromotion(id));
      this.store.mutate((list) =>
        list.map((promotion) => (promotion.id === id ? { ...promotion, status: 'inactive' } : promotion))
      );
      this.closeDeactivateModal(true);
      const refresh = this.store.refresh();
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      await refresh;
    } catch (error) {
      this.closeDeactivateModal(true);
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isDeactivating = false;
    }
  }

  // Re-derive every locale-dependent view field from the DTOs already in
  // memory. Runs on initial load and on each language change — no backend
  // round-trip.
  private applyLocalization(): void {
    const locale = this.getCurrentLocale();
    this.rows = this.rawPromotions.map((promotion) =>
      toRow(promotion, locale, this.discountTypeOptions)
    );
  }

  private buildOptionLists(): void {
    const { discountTypeOptions, statusOptions, autoApplyOptions } = buildPromotionOptionLists({
      discountTypePercentage: this.translate.instant('ADMIN.PROMOTIONS.DISCOUNT_TYPE_PERCENTAGE'),
      discountTypeFixedAmount: this.translate.instant(
        'ADMIN.PROMOTIONS.DISCOUNT_TYPE_FIXED_AMOUNT'
      ),
      statusActive: this.translate.instant('ADMIN.PROMOTIONS.STATUS_ACTIVE'),
      statusInactive: this.translate.instant('ADMIN.PROMOTIONS.STATUS_INACTIVE'),
      autoApplyYes: this.translate.instant('ADMIN.PROMOTIONS.AUTO_APPLY_YES'),
      autoApplyNo: this.translate.instant('ADMIN.PROMOTIONS.AUTO_APPLY_NO'),
    });
    this.discountTypeOptions = discountTypeOptions;
    this.statusOptions = statusOptions;
    this.autoApplyOptions = autoApplyOptions;
  }

  // NOTE: `||` short-circuit is deliberate — translate.getDefaultLang() must
  // only be called when currentLang is falsy (some TranslateService stubs
  // don't implement it). Kept un-extracted for the same reason
  // RoleManagementPageComponent/UserManagementPageComponent keep their
  // getCurrentLocale private rather than moving it to the mappers file.
  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }
}
