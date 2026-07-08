import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminStatusDto,
  AdminTranslationCollection,
  AdminTranslationReqDto,
  PromotionReqDto,
  PromotionRespDto,
  getAdminTranslationDescription,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { PromotionsListStore } from './promotions-list.store';

const ROUND_TRIP_SLUG = 'round_trip';

interface PromotionRow {
  id: number;
  slug: string;
  code: string;
  discountTypeCode: string;
  discountTypeLabel: string;
  discountValue: number | null;
  maxDiscountAmount: number | null;
  minBookingAmount: number | null;
  startDateTime: string | null;
  endDateTime: string | null;
  usageLimit: number | null;
  currentUsage: number;
  statusCode: string;
  statusLabel: string;
  autoApply: boolean;
  isRoundTrip: boolean;
  translations?: AdminTranslationCollection;
}

interface Option {
  value: string;
  label: string;
}

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
    return statusCode.trim().toLowerCase() === 'active' ? 'is-success' : 'is-danger';
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.promotionForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected hasDateRangeError(): boolean {
    const raw = this.promotionForm.getRawValue();
    const start = this.toDateValue(raw.startDateTime);
    const end = this.toDateValue(raw.endDateTime);
    return !!start && !!end && end.getTime() < start.getTime();
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
    this.applyPromotionFormValues(this.toFallbackDto(row), row);
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
    this.rows = this.rawPromotions.map((promotion) => this.toRow(promotion));
  }

  private buildOptionLists(): void {
    this.discountTypeOptions = [
      {
        value: 'percentage',
        label: this.translate.instant('ADMIN.PROMOTIONS.DISCOUNT_TYPE_PERCENTAGE'),
      },
      {
        value: 'fixed_amount',
        label: this.translate.instant('ADMIN.PROMOTIONS.DISCOUNT_TYPE_FIXED_AMOUNT'),
      },
    ];
    this.statusOptions = [
      { value: 'active', label: this.translate.instant('ADMIN.PROMOTIONS.STATUS_ACTIVE') },
      { value: 'inactive', label: this.translate.instant('ADMIN.PROMOTIONS.STATUS_INACTIVE') },
    ];
    this.autoApplyOptions = [
      { value: 'true', label: this.translate.instant('ADMIN.PROMOTIONS.AUTO_APPLY_YES') },
      { value: 'false', label: this.translate.instant('ADMIN.PROMOTIONS.AUTO_APPLY_NO') },
    ];
  }

  private toRow(promotion: PromotionRespDto): PromotionRow {
    const discountType = this.parseStatus(promotion.discountType);
    const status = this.parseStatus(promotion.status);
    const slug = String(promotion.slug ?? '').trim();
    // Prefer the FE's own known-option label ("Percentage"/"Fixed Amount")
    // over parseAdminStatus's generic ALL-CAPS fallback, for a plain-string
    // discountType (see PromotionRespDto's comment on Jackson number/string
    // duality — discountType itself is always a lookup slug string here).
    const discountTypeLabel =
      this.discountTypeOptions.find((option) => option.value === discountType.code)?.label ??
      discountType.name;

    return {
      id: promotion.id,
      slug,
      code: promotion.code ?? '-',
      discountTypeCode: discountType.code,
      discountTypeLabel,
      discountValue: this.toNumber(promotion.discountValue),
      maxDiscountAmount: this.toNumber(promotion.maxDiscountAmount),
      minBookingAmount: this.toNumber(promotion.minBookingAmount),
      startDateTime: promotion.startDateTime ?? null,
      endDateTime: promotion.endDateTime ?? null,
      usageLimit: promotion.usageLimit ?? null,
      currentUsage: promotion.currentUsage ?? 0,
      statusCode: status.code,
      statusLabel: status.name,
      autoApply: !!promotion.autoApply,
      isRoundTrip: slug.toLowerCase() === ROUND_TRIP_SLUG,
      translations: promotion.translations,
    };
  }

  private toFallbackDto(row: PromotionRow): PromotionRespDto {
    return {
      id: row.id,
      slug: row.slug,
      code: row.code,
      discountType: row.discountTypeCode,
      status: row.statusCode,
      discountValue: row.discountValue ?? undefined,
      maxDiscountAmount: row.maxDiscountAmount,
      minBookingAmount: row.minBookingAmount ?? undefined,
      startDateTime: row.startDateTime,
      endDateTime: row.endDateTime,
      usageLimit: row.usageLimit,
      currentUsage: row.currentUsage,
      autoApply: row.autoApply,
      translations: row.translations,
    };
  }

  // Populate the promotion form from a DTO. When `onlyPristine` is set (the
  // late detail patch), only controls the admin hasn't started editing are
  // filled, so the arriving server data never clobbers in-progress input.
  private applyPromotionFormValues(
    dto: PromotionRespDto,
    row: PromotionRow,
    onlyPristine = false
  ): void {
    const discountType = this.parseStatus(dto.discountType ?? row.discountTypeCode);
    const status = this.parseStatus(dto.status ?? row.statusCode);

    const values = {
      slug: String(dto.slug ?? row.slug).trim(),
      code: String(dto.code ?? row.code).trim(),
      discountType: discountType.code,
      discountValue: this.toNumber(dto.discountValue) ?? row.discountValue,
      maxDiscountAmount: this.toNumber(dto.maxDiscountAmount) ?? row.maxDiscountAmount,
      minBookingAmount: this.toNumber(dto.minBookingAmount) ?? row.minBookingAmount,
      startDateTime: this.toDateValue(dto.startDateTime ?? row.startDateTime),
      endDateTime: this.toDateValue(dto.endDateTime ?? row.endDateTime),
      usageLimit: dto.usageLimit ?? row.usageLimit,
      status: status.code,
      autoApply: String(dto.autoApply ?? row.autoApply),
      enLabel: this.getTranslationLabel(dto.translations, 'en') ?? '',
      enDescription: this.getTranslationDescription(dto.translations, 'en') ?? '',
      thLabel: this.getTranslationLabel(dto.translations, 'th') ?? '',
      thDescription: this.getTranslationDescription(dto.translations, 'th') ?? '',
      zhLabel: this.getTranslationLabel(dto.translations, 'zh') ?? '',
      zhDescription: this.getTranslationDescription(dto.translations, 'zh') ?? '',
    };

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
    const raw = this.promotionForm.getRawValue();

    const translations: AdminTranslationReqDto[] = [
      {
        locale: 'en',
        label: String(raw.enLabel ?? '').trim(),
        description: String(raw.enDescription ?? '').trim() || undefined,
      },
    ];
    const thLabel = String(raw.thLabel ?? '').trim();
    if (thLabel) {
      translations.push({
        locale: 'th',
        label: thLabel,
        description: String(raw.thDescription ?? '').trim() || undefined,
      });
    }
    const zhLabel = String(raw.zhLabel ?? '').trim();
    if (zhLabel) {
      translations.push({
        locale: 'zh',
        label: zhLabel,
        description: String(raw.zhDescription ?? '').trim() || undefined,
      });
    }

    return {
      slug: String(raw.slug ?? '').trim().toLowerCase(),
      code: String(raw.code ?? '').trim(),
      discountType: String(raw.discountType ?? '').trim().toLowerCase(),
      discountValue: this.toNumber(raw.discountValue) ?? 0,
      maxDiscountAmount: this.toNumber(raw.maxDiscountAmount),
      // Backend @NotNull — blank means "no minimum" / "unlimited", not
      // absent, so default to 0 rather than sending null.
      minBookingAmount: this.toNumber(raw.minBookingAmount) ?? 0,
      startDateTime: this.toIsoString(raw.startDateTime),
      endDateTime: this.toIsoString(raw.endDateTime),
      usageLimit: this.toNumber(raw.usageLimit) ?? 0,
      status: String(raw.status ?? '').trim().toLowerCase(),
      autoApply: String(raw.autoApply ?? '').trim().toLowerCase() === 'true',
      translations,
    };
  }

  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  private toDateValue(value: string | Date | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return Number.isFinite(value.getTime()) ? value : null;
    }
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  private toIsoString(value: unknown): string | null {
    const date = this.toDateValue(value as string | Date | null | undefined);
    return date ? date.toISOString() : null;
  }

  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }

  private getTranslationLabel(
    translations: AdminTranslationCollection | null | undefined,
    locale?: string
  ): string | null {
    return getAdminTranslationLabel(translations, locale);
  }

  private getTranslationDescription(
    translations: AdminTranslationCollection | null | undefined,
    locale?: string
  ): string | null {
    return getAdminTranslationDescription(translations, locale);
  }

  private parseStatus(value: string | AdminStatusDto | null | undefined): {
    code: string;
    name: string;
  } {
    return parseAdminStatus(value, this.getCurrentLocale());
  }
}
