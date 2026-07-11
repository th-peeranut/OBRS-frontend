import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  PromotionReqDto,
  PromotionRespDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { PromotionsListStore } from './promotions-list.store';
import {
  Option,
  PromotionRow,
  buildPromotionFormValues,
  buildPromotionOptionLists,
  hasDateRangeError,
  statusClass,
  toFallbackDto,
  toPromotionPayload,
  toRow,
} from './promotions-page.mappers';

/**
 * Promotions list + CRUD (OBRS-109 / #37). Hosts RoundTripPromotionCardComponent
 * (unchanged singleton edit surface, moved verbatim) at the top, and the
 * general promotions list/create/edit/soft-delete below — modeled on
 * VehiclesPageComponent's skeleton (list + create/edit modal + confirm modal,
 * AdminCollectionStore-backed).
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
  protected isSubmitting = false;
  protected isDeactivating = false;
  protected isEditMode = false;
  protected isEditDetailLoading = false;
  protected selectedPromotion: PromotionRow | null = null;

  protected readonly promotionForm: FormGroup;
  private readonly subscriptions = new Subscription();

  private rawPromotions: PromotionRespDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: PromotionsListStore
  ) {
    this.promotionForm = this.formBuilder.group({
      slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9_-]+$/)]],
      code: ['', [Validators.required, Validators.maxLength(50)]],
      discountType: ['', [Validators.required]],
      discountValue: [null, [Validators.required, Validators.min(0)]],
      maxDiscountAmount: [null, [Validators.min(0)]],
      // Backend @NotNull: minBookingAmount/usageLimit always send a number
      // (blank -> 0, their natural "no minimum"/"unlimited" value — see
      // toPromotionPayload); startDateTime has no natural default, so it's
      // Validators.required instead.
      minBookingAmount: [null, [Validators.min(0)]],
      startDateTime: [null, [Validators.required]],
      endDateTime: [null],
      usageLimit: [null, [Validators.min(0)]],
      status: ['', [Validators.required]],
      autoApply: ['', [Validators.required]],
      enLabel: ['', [Validators.required, Validators.maxLength(255)]],
      enDescription: ['', [Validators.maxLength(500)]],
      thLabel: ['', [Validators.maxLength(255)]],
      thDescription: ['', [Validators.maxLength(500)]],
      zhLabel: ['', [Validators.maxLength(255)]],
      zhDescription: ['', [Validators.maxLength(500)]],
    });

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
      this.store.data$.subscribe((data) => {
        if (data) {
          this.rawPromotions = data;
          this.applyLocalization();
        }
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

  protected trackById(_index: number, row: PromotionRow): number {
    return row.id;
  }

  protected statusClass(statusCode: string): string {
    return statusClass(statusCode);
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.promotionForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected hasDateRangeError(): boolean {
    const raw = this.promotionForm.getRawValue();
    return hasDateRangeError(raw.startDateTime, raw.endDateTime);
  }

  // design-system.md §3.1: create starts every select empty (field-name
  // placeholder) — no pre-seeded default, unlike the round-trip card's
  // documented singleton-edit exception above.
  protected openCreateModal(): void {
    this.isEditMode = false;
    this.selectedPromotion = null;
    this.promotionForm.reset({
      slug: '',
      code: '',
      discountType: '',
      discountValue: null,
      maxDiscountAmount: null,
      minBookingAmount: null,
      startDateTime: null,
      endDateTime: null,
      usageLimit: null,
      status: '',
      autoApply: '',
      enLabel: '',
      enDescription: '',
      thLabel: '',
      thDescription: '',
      zhLabel: '',
      zhDescription: '',
    });
    this.isFormModalOpen = true;
  }

  protected async openEditModal(row: PromotionRow): Promise<void> {
    // Open immediately with the row data already in hand, then patch in the
    // server detail once it arrives (pristine controls only) — same pattern
    // as VehiclesPageComponent.openEditModal.
    this.isEditMode = true;
    this.selectedPromotion = row;
    this.isEditDetailLoading = true;
    this.applyPromotionFormValues(toFallbackDto(row), row);
    this.isFormModalOpen = true;

    try {
      const response = await firstValueFrom(this.adminApiService.getPromotionById(row.id));
      const detail = response?.data ?? null;
      if (detail && this.isFormModalOpen && this.selectedPromotion?.id === row.id) {
        this.applyPromotionFormValues(detail, row, true);
      }
    } catch {
      // Keep the fallback values already shown in the open modal.
    } finally {
      if (this.isFormModalOpen && this.selectedPromotion?.id === row.id) {
        this.isEditDetailLoading = false;
      }
    }
  }

  protected closeFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isFormModalOpen = false;
    this.isEditDetailLoading = false;
    this.selectedPromotion = null;
    this.promotionForm.reset();
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

  protected async submitPromotion(): Promise<void> {
    if (this.promotionForm.invalid || this.hasDateRangeError()) {
      this.promotionForm.markAllAsTouched();
      await this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = this.toPromotionPayload();

      if (this.isEditMode && this.selectedPromotion) {
        await firstValueFrom(
          this.adminApiService.updatePromotion(this.selectedPromotion.id, payload)
        );
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createPromotion(payload));
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      await this.store.refresh();
    } catch (error) {
      this.closeFormModal(true);
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
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

  // Populate the promotion form from a DTO. When `onlyPristine` is set (the
  // late detail patch), only controls the admin hasn't started editing are
  // filled, so the arriving server data never clobbers in-progress input.
  private applyPromotionFormValues(
    dto: PromotionRespDto,
    row: PromotionRow,
    onlyPristine = false
  ): void {
    const values = buildPromotionFormValues(dto, row, this.getCurrentLocale());

    if (!onlyPristine) {
      this.promotionForm.reset(values);
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.promotionForm.get(name);
      if (control?.pristine) {
        control.setValue(value);
      }
    }
  }

  private toPromotionPayload(): PromotionReqDto {
    return toPromotionPayload(this.promotionForm.getRawValue());
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
