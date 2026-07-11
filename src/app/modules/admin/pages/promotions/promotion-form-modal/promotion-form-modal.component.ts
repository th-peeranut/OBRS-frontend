import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  PromotionReqDto,
  PromotionRespDto,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import {
  Option,
  PromotionRow,
  buildPromotionFormValues,
  hasDateRangeError,
  toFallbackDto,
  toPromotionPayload,
} from '../promotions-page.mappers';

// Smart create/edit form modal, extracted from PromotionsPageComponent
// (OBRS-251, mirroring OBRS-212's RouteFormModalComponent /
// SegmentEditModalComponent pattern). Owns its FormGroup, the modal
// template, its own create/update/detail-fetch API calls, and validation.
//
// Driven by @Input (isOpen/mode/selectedPromotion) rather than ViewChild
// (unlike RouteFormModalComponent) since the parent already tracks that
// selection state for the sibling deactivate modal — ngOnChanges reacts only
// to `isOpen` transitions so a re-render with the same open modal never
// clobbers in-progress input (see AppVehicleMaintenancePanelComponent's
// single-owner ngOnChanges idiom).
//
// `reloadStructure` is a callback @Input (not an @Output) so the parent's
// store refresh can still be triggered from here without a round-trip
// through an @Output subscriber. Ordering is byte-for-byte parity with the
// pre-split PromotionsPageComponent.submitPromotion on dev (post-OBRS-241):
// API call -> emit closed (== the old closeFormModal(true)) -> await the
// success alert -> THEN reloadStructure() LAST. The modal does not stay open
// during the refresh — do not reorder this to await reloadStructure before
// the close/alert.
@Component({
  selector: 'app-promotion-form-modal',
  templateUrl: './promotion-form-modal.component.html',
  styleUrl: './promotion-form-modal.component.scss',
})
export class PromotionFormModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() selectedPromotion: PromotionRow | null = null;
  @Input() discountTypeOptions: Option[] = [];
  @Input() statusOptions: Option[] = [];
  @Input() autoApplyOptions: Option[] = [];
  @Input() reloadStructure!: () => Promise<void>;
  @Output() closed = new EventEmitter<void>();

  protected isSubmitting = false;
  protected isEditDetailLoading = false;

  protected readonly promotionForm: FormGroup;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
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
  }

  // Only `isOpen` transitions drive the form: the parent always sets
  // mode/selectedPromotion together with isOpen in the same synchronous
  // call (openCreateModal/openEditModal), so gating on isOpen alone mirrors
  // that call boundary without re-initializing the form on an unrelated
  // parent re-render (e.g. a background store refresh) while the modal
  // stays open.
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isOpen']) {
      return;
    }

    if (this.isOpen) {
      if (this.mode === 'edit' && this.selectedPromotion) {
        this.initEditForm(this.selectedPromotion);
      } else {
        this.initCreateForm();
      }
    } else {
      this.isEditDetailLoading = false;
      this.promotionForm.reset();
    }
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.promotionForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected hasDateRangeError(): boolean {
    const raw = this.promotionForm.getRawValue();
    return hasDateRangeError(raw.startDateTime, raw.endDateTime);
  }

  protected requestClose(): void {
    if (this.isSubmitting) {
      return;
    }
    this.closed.emit();
  }

  protected async submitPromotion(): Promise<void> {
    if (this.promotionForm.invalid || this.hasDateRangeError()) {
      this.promotionForm.markAllAsTouched();
      await this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = toPromotionPayload(this.promotionForm.getRawValue());

      if (this.mode === 'edit' && this.selectedPromotion) {
        await firstValueFrom(
          this.adminApiService.updatePromotion(this.selectedPromotion.id, payload)
        );
        this.closed.emit();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createPromotion(payload));
        this.closed.emit();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      await this.reloadStructure();
    } catch (error) {
      this.closed.emit();
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
  }

  // design-system.md §3.1: create starts every select empty (field-name
  // placeholder) — no pre-seeded default, unlike the round-trip card's
  // documented singleton-edit exception.
  private initCreateForm(): void {
    this.isEditDetailLoading = false;
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
  }

  // Open immediately with the row data already in hand, then patch in the
  // server detail once it arrives (pristine controls only) — same pattern
  // as VehiclesPageComponent.openEditModal / RouteFormModalComponent.openEdit.
  private async initEditForm(row: PromotionRow): Promise<void> {
    this.isEditDetailLoading = true;
    this.applyPromotionFormValues(toFallbackDto(row), row);

    try {
      const response = await firstValueFrom(this.adminApiService.getPromotionById(row.id));
      const detail = response?.data ?? null;
      // Ignore a stale response if the modal has since closed or moved on to
      // editing a different promotion.
      if (detail && this.isOpen && this.selectedPromotion?.id === row.id) {
        this.applyPromotionFormValues(detail, row, true);
      }
    } catch {
      // Keep the fallback values already shown in the open modal.
    } finally {
      if (this.isOpen && this.selectedPromotion?.id === row.id) {
        this.isEditDetailLoading = false;
      }
    }
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

  // NOTE: `||` short-circuit is deliberate — translate.getDefaultLang() must
  // only be called when currentLang is falsy (some TranslateService stubs
  // don't implement it).
  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }
}
