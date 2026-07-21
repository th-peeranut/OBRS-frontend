import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminStatusDto,
  PromotionRespDto,
  UpdateRoundTripPromotionPayload,
  parseAdminStatus,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { RoundTripPromotionStore } from '../promotions.store';

interface StatusOption {
  value: string;
  label: string;
}

// OBRS-109 (#37): extracted verbatim out of what used to be
// PromotionsPageComponent — the page now hosts this card at the top plus the
// general promotions list below (RoundTripPromotionStore and its
// partial-PATCH behavior are unchanged, just moved).
//
// Round-trip promotion is a singleton config row (design-system §3.1: the
// Status select is explicitly allowed to pre-seed the current value — this is
// the documented exception, not a violation).
@Component({
  selector: 'app-round-trip-promotion-card',
  templateUrl: './round-trip-promotion-card.component.html',
  styleUrl: './round-trip-promotion-card.component.scss',
})
export class RoundTripPromotionCardComponent implements OnInit, OnDestroy {
  protected promotion: PromotionRespDto | null = null;
  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected isSaving = false;
  protected statusOptions: StatusOption[] = [];

  protected readonly promotionForm: FormGroup;

  private readonly statusValues: Array<'active' | 'inactive'> = ['active', 'inactive'];
  // First store emission gets a full form reset; later emissions (a background
  // revalidate while the admin may be mid-edit) only patch pristine controls —
  // same contract as the schedules edit modal (design-system.md §6).
  private hasLoadedOnce = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: RoundTripPromotionStore,
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.promotionForm = this.formBuilder.group({
      discountValue: [null, [Validators.required, Validators.min(0)]],
      status: ['', [Validators.required]],
      startDateTime: [null],
      endDateTime: [null],
      minBookingAmount: [null, [Validators.min(0)]],
    });
  }

  ngOnInit(): void {
    this.buildStatusOptions();
    this.translate.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.buildStatusOptions());

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      if (data) {
        this.promotion = data;
        this.applyFormValues(data, this.hasLoadedOnce);
        this.hasLoadedOnce = true;
      } else {
        // OBRS-506: honor a null emission (OBRS-467 shape) — clear() (e.g.
        // logout) DISCARDS the cached value, so drop the cached reference.
        // Deliberately does NOT call applyFormValues(null, ...) or touch
        // hasLoadedOnce. Note this is NOT about preserving an in-progress edit:
        // the template gates the whole form on `*ngIf="!isLoading && promotion"`,
        // so once promotion is null the form is unmounted and anything typed into
        // it is unreachable either way. The reason to leave them alone is the
        // sweep's invariant — hasLoadedOnce must keep its value so the NEXT
        // non-null emission takes the same applyFormValues(data, true) branch it
        // takes today, leaving the success path byte-identical.
        this.promotion = null;
      }
    });

    this.store.refreshing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((refreshing) => (this.isRefreshing = refreshing));

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.refreshFailed = failed && this.store.hasValue;
      this.errorMessage =
        failed && !this.store.hasValue
          ? this.translate.instant('ADMIN.PROMOTIONS.LOAD_FAILED')
          : '';
    });

    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  protected get discountTypeLabel(): string {
    if (!this.promotion?.discountType) {
      return '-';
    }
    return this.parseStatus(this.promotion.discountType).name;
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

  protected async save(): Promise<void> {
    if (this.promotionForm.invalid || this.hasDateRangeError()) {
      this.promotionForm.markAllAsTouched();
      this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      return;
    }

    if (!this.promotion) {
      return;
    }

    const payload = this.buildPartialPayload();
    if (Object.keys(payload).length === 0) {
      return;
    }

    this.isSaving = true;
    // Optimistic: reflect the change locally before the background revalidate
    // lands, so re-entering this page (SWR cache) shows it immediately. The
    // store holds PromotionRespDto (status: string) while the wire payload
    // carries `active: boolean` (RoundTripPromotionReqDto) — translate here.
    const optimisticPatch = this.toOptimisticPatch(payload);
    this.store.mutate((current) => ({ ...current, ...optimisticPatch }));

    try {
      await firstValueFrom(this.adminApiService.updateRoundTripPromotion(payload));
      // Values now match what was just saved — clear dirty so the next
      // background refresh patches these controls again without a visual jump.
      this.promotionForm.markAsPristine();
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      await this.store.refresh();
    } catch (error) {
      // Revert the optimistic mutate; keep the admin's in-progress edits in
      // the form untouched so they don't have to retype anything to retry.
      this.store.mutate(() => this.promotion as PromotionRespDto);
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      this.alertService.error(message);
    } finally {
      this.isSaving = false;
    }
  }

  // Only a control the admin actually touched (dirty) is sent — the backend
  // PATCH is partial, so untouched fields must never be forced back to their
  // currently-displayed value. NOTE: the wire contract is
  // RoundTripPromotionReqDto, which reads `active: boolean` — NOT `status` —
  // so the Status dropdown's string value is translated to a boolean here.
  private buildPartialPayload(): UpdateRoundTripPromotionPayload {
    const raw = this.promotionForm.getRawValue();
    const payload: UpdateRoundTripPromotionPayload = {};

    if (this.promotionForm.get('discountValue')?.dirty) {
      payload.discountValue = this.toNumber(raw.discountValue) ?? 0;
    }
    if (this.promotionForm.get('status')?.dirty) {
      payload.active = String(raw.status ?? '').trim().toLowerCase() === 'active';
    }
    if (this.promotionForm.get('startDateTime')?.dirty) {
      payload.startDateTime = this.toIsoString(raw.startDateTime);
    }
    if (this.promotionForm.get('endDateTime')?.dirty) {
      payload.endDateTime = this.toIsoString(raw.endDateTime);
    }
    if (this.promotionForm.get('minBookingAmount')?.dirty) {
      payload.minBookingAmount = this.toNumber(raw.minBookingAmount) ?? 0;
    }

    return payload;
  }

  // The store holds PromotionRespDto (status: 'active' | 'inactive' string);
  // the wire payload holds RoundTripPromotionReqDto's `active: boolean`. This
  // translates the latter back to the former ONLY for the optimistic local
  // update — the real value is confirmed by the store.refresh() that follows.
  private toOptimisticPatch(
    payload: UpdateRoundTripPromotionPayload
  ): Partial<PromotionRespDto> {
    const { active, ...rest } = payload;
    const patch: Partial<PromotionRespDto> = { ...rest };
    if (active !== undefined) {
      patch.status = active ? 'active' : 'inactive';
    }
    return patch;
  }

  private applyFormValues(promotion: PromotionRespDto, onlyPristine: boolean): void {
    const status = this.parseStatus(promotion.status);
    const values = {
      discountValue: this.toNumber(promotion.discountValue),
      status: status.code,
      startDateTime: this.toDateValue(promotion.startDateTime),
      endDateTime: this.toDateValue(promotion.endDateTime),
      minBookingAmount: this.toNumber(promotion.minBookingAmount),
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

  private buildStatusOptions(): void {
    this.statusOptions = this.statusValues.map((value) => ({
      value,
      label: this.translate.instant(`ADMIN.PROMOTIONS.STATUS_${value.toUpperCase()}`),
    }));
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

  private parseStatus(value: string | AdminStatusDto | null | undefined): {
    code: string;
    name: string;
  } {
    return parseAdminStatus(value, this.getCurrentLocale());
  }

  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }
}
