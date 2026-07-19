import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService, InspectionItemPayload } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  extractInspectionItemErrorCode,
  mapInspectionItemErrorCode,
} from '../../../../shared/lib/inspection-item-error';
import { InspectionItemsStore } from './inspection-items.store';
import {
  InspectionItemRow,
  moveRowDown,
  moveRowToBottom,
  moveRowToTop,
  moveRowUp,
  toInspectionItemRows,
  toReorderPayload,
} from './inspection-items.mappers';

/**
 * OBRS-509: owner-facing admin CRUD for the vehicle-inspection checklist
 * MASTER LIST. One smart page component, no dumb children — matches
 * `CargoCapacityPageComponent`/`LookupSettingsPageComponent`/
 * `JumpSeatConfigPageComponent` at this scale (UX spec §2).
 *
 * Reorder mechanism (UX spec §3.2.2): immediate `PUT /reorder` per click, no
 * debounce, no button disabling. Out-of-order RESPONSES are guarded by
 * `latestReorderSeq`, a monotonic counter — only the response matching the
 * most-recently-issued request is applied. `reorderPending` additionally
 * gates the store.data$ subscription below (§3.2.2a): while a reorder is
 * outstanding, an unrelated background emission (e.g. the tail of another
 * page action's `refresh()`) must NOT replace `rows`, or it would revert the
 * just-clicked local order before the reorder's own request resolves.
 *
 * The `translations` FormArray is a fixed 3-group array (en/th/zh), built
 * once in the constructor and only ever `reset()` (never rebuilt/torn down)
 * on modal open — and the `store.data$` subscription below touches only
 * `rows`, never `itemForm` — the direct fix for the OBRS-312 bug this same
 * feature already shipped once (UX spec §4.1.2).
 *
 * AC#4 (no delete, anywhere): `AdminApiService` gets no delete method for
 * this feature and the Actions column renders exactly Edit + Retire/Restore
 * — no trash icon, no delete-confirm modal, no `isDeleteModalOpen` member.
 */
@Component({
  selector: 'app-inspection-items-page',
  templateUrl: './inspection-items-page.component.html',
  styleUrl: './inspection-items-page.component.scss',
})
export class InspectionItemsPageComponent implements OnInit, OnDestroy {
  protected rows: InspectionItemRow[] = [];

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 6 });

  protected isFormModalOpen = false;
  protected isSubmitting = false;
  protected isEditMode = false;
  protected selectedItem: InspectionItemRow | null = null;

  // Per-row Retire/Restore in-flight flag (cargo-capacity precedent) — keyed
  // by item id, NOT a FormArray/shared submit state.
  protected savingIds: Record<number, boolean> = {};

  // Reorder state (UX spec §3.2.2). `reorderPending` is read by the template
  // for the REORDER_SAVING caption and gates the store.data$ subscription —
  // it is NEVER used to disable a move button (deliberately: a click is a
  // deliberate act and is never blocked).
  protected reorderPending = false;
  private latestReorderSeq = 0;

  protected readonly itemForm: FormGroup;
  // OBRS-509 (owner review): Thai first. Thai is the only locale that is actually read here —
  // `VehicleInspectionService.SNAPSHOT_LOCALE` is hardcoded "th", so every history row is written
  // from the Thai label, and both audiences (drivers filling the form, the owner reading history)
  // are Thai. English is only the fallback in `TranslationUtil.resolveLabel`; Chinese is read by
  // essentially nobody on this screen. Index-aligned with the `translations` FormArray below —
  // reorder both together or the headings detach from their inputs.
  protected readonly localeLabelKeys = [
    'ADMIN.INSPECTION_ITEMS.LABEL_TH',
    'ADMIN.INSPECTION_ITEMS.LABEL_EN',
    'ADMIN.INSPECTION_ITEMS.LABEL_ZH',
  ];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: InspectionItemsStore
  ) {
    // Built once, fixed length (3), never rebuilt — see the class doc above
    // and UX spec §4.1.2. openCreateModal()/openEditModal() only `reset()`
    // this same FormGroup/FormArray with fresh values.
    this.itemForm = this.formBuilder.group({
      code: [
        '',
        [Validators.required, Validators.maxLength(50), Validators.pattern(/^[a-z0-9_-]+$/)],
      ],
      // Thai first — see `localeLabelKeys` above; the two are index-aligned.
      translations: this.formBuilder.array([
        this.formBuilder.group({ locale: ['th'], label: ['', Validators.required] }),
        this.formBuilder.group({ locale: ['en'], label: ['', Validators.required] }),
        this.formBuilder.group({ locale: ['zh'], label: ['', Validators.required] }),
      ]),
    });
  }

  ngOnInit(): void {
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      // §3.2.2a: while a reorder is outstanding, this subscription must NOT
      // replace `rows` — only the winning reorder success/error handlers may.
      if (data === null || this.reorderPending) {
        return;
      }
      this.rows = toInspectionItemRows(data);
    });

    this.store.refreshing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((refreshing) => (this.isRefreshing = refreshing));

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.refreshFailed = failed && this.store.hasValue;
      this.errorMessage =
        failed && !this.store.hasValue
          ? this.translate.instant('ADMIN.INSPECTION_ITEMS.LOAD_FAILED')
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

  protected get translationsFormArray(): FormArray {
    return this.itemForm.get('translations') as FormArray;
  }

  protected trackByRowId(_index: number, row: InspectionItemRow): number {
    return row.id;
  }

  protected isRowSaving(row: InspectionItemRow): boolean {
    return !!this.savingIds[row.id];
  }

  protected canMoveUp(index: number): boolean {
    return index > 0;
  }

  protected canMoveDown(index: number): boolean {
    return index < this.rows.length - 1;
  }

  protected currentLocaleLabel(row: InspectionItemRow): string {
    const locale = this.getCurrentLocale();
    if (locale === 'en') {
      return row.labelEn;
    }
    if (locale === 'zh') {
      return row.labelZh;
    }
    return row.labelTh;
  }

  // ── Reorder ──────────────────────────────────────────────────────────────

  protected moveUp(index: number): void {
    this.applyMove(moveRowUp(this.rows, index));
  }

  protected moveDown(index: number): void {
    this.applyMove(moveRowDown(this.rows, index));
  }

  protected moveToTop(index: number): void {
    this.applyMove(moveRowToTop(this.rows, index));
  }

  protected moveToBottom(index: number): void {
    this.applyMove(moveRowToBottom(this.rows, index));
  }

  private applyMove(nextRows: InspectionItemRow[]): void {
    if (nextRows === this.rows) {
      // Top/bottom edge — the mapper returned the same reference untouched.
      return;
    }
    // Apply locally IMMEDIATELY so the click never lags (UX spec §3.2.1),
    // then fire the PUT with no debounce (§3.2.2).
    this.rows = nextRows;
    this.sendReorder(nextRows);
  }

  private sendReorder(rows: InspectionItemRow[]): void {
    this.latestReorderSeq += 1;
    const seq = this.latestReorderSeq;
    this.reorderPending = true;

    const payload = toReorderPayload(rows);
    // NOTE: `takeUntil(this.destroy$)` here only detaches the Angular-side
    // observable on navigation — an in-flight PUT already sent to the
    // browser's network stack still reaches and commits on the server. This
    // is harmless (nothing here depends on that response landing; the next
    // `GET /manage` reflects whatever committed) — see UX spec §3.2.2.
    this.adminApiService
      .reorderInspectionItems(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // A response for a request superseded by a later click is dropped
          // unread — this is the ONLY guard against out-of-order responses.
          if (seq !== this.latestReorderSeq) {
            return;
          }
          // Order matters: flip the guard open BEFORE mutate() so the
          // data$ emission mutate() fires synchronously is accepted by the
          // subscription in ngOnInit (§3.2.2 step 4).
          this.reorderPending = false;
          const data = response?.data;
          if (data) {
            this.store.mutate(() => data);
          }
          // Trailing background refresh reconciles a server-commit-order
          // hazard the sequence guard alone can't close (§3.2.2 step 4).
          void this.store.refresh();
        },
        error: (error) => {
          if (seq !== this.latestReorderSeq) {
            return;
          }
          this.reorderPending = false;
          void this.store.refresh();
          const errorCode = extractInspectionItemErrorCode(error);
          void this.alertService.error(this.translate.instant(mapInspectionItemErrorCode(errorCode)));
        },
      });
  }

  // ── Create / edit modal ──────────────────────────────────────────────────

  protected openCreateModal(): void {
    this.isEditMode = false;
    this.selectedItem = null;
    this.itemForm.reset({
      code: '',
      translations: [
        { locale: 'th', label: '' },
        { locale: 'en', label: '' },
        { locale: 'zh', label: '' },
      ],
    });
    this.itemForm.get('code')?.enable();
    this.isFormModalOpen = true;
  }

  protected openEditModal(row: InspectionItemRow): void {
    this.isEditMode = true;
    this.selectedItem = row;
    this.itemForm.reset({
      code: row.code,
      translations: [
        { locale: 'th', label: row.labelTh },
        { locale: 'en', label: row.labelEn },
        { locale: 'zh', label: row.labelZh },
      ],
    });
    // SPEC §5.5 / UX §4.1.1: code is FE-only discouraged after create, not
    // backend-rejected — the PUT body below still carries it via getRawValue().
    this.itemForm.get('code')?.disable();
    this.isFormModalOpen = true;
  }

  protected closeFormModal(): void {
    if (this.isSubmitting) {
      return;
    }
    this.isFormModalOpen = false;
    this.selectedItem = null;
    this.itemForm.reset();
  }

  protected isCodeInvalid(): boolean {
    const field = this.itemForm.get('code');
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  /**
   * Scrutinize self-fix: `code` carries THREE validators (required / maxLength
   * / pattern) and the template rendered CODE_PATTERN_ERROR for all of them —
   * an empty code told the owner "lowercase letters, numbers, underscore, or
   * hyphen only", which describes neither the failure nor the fix. "A
   * validator covering multiple failure reasons needs one message each"
   * (OBRS-223). Both keys already exist; no new i18n key is added.
   */
  protected codeErrorKey(): string {
    return this.itemForm.get('code')?.hasError('required')
      ? 'ADMIN.VALIDATION.REQUIRED'
      : 'ADMIN.INSPECTION_ITEMS.CODE_PATTERN_ERROR';
  }

  protected isTranslationInvalid(index: number): boolean {
    const control = this.translationsFormArray.at(index)?.get('label');
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  protected async submitItem(): Promise<void> {
    if (this.itemForm.invalid) {
      this.itemForm.markAllAsTouched();
      await this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isSubmitting = true;
    const wasEdit = this.isEditMode;
    const original = this.selectedItem;
    const payload = this.toPayload(wasEdit ? original : null);

    try {
      if (wasEdit && original) {
        const response = await firstValueFrom(
          this.adminApiService.updateInspectionItem(original.id, payload)
        );
        const updated = response?.data;
        if (updated) {
          this.store.mutate((list) => list.map((item) => (item.id === original.id ? updated : item)));
        }
      } else {
        const response = await firstValueFrom(this.adminApiService.createInspectionItem(payload));
        const created = response?.data;
        if (created) {
          this.store.mutate((list) => [...list, created]);
        }
      }

      this.isSubmitting = false;
      this.closeFormModal();
      await this.alertService.success(
        this.translate.instant(wasEdit ? 'ADMIN.MESSAGES.UPDATED' : 'ADMIN.MESSAGES.CREATED')
      );
      void this.store.refresh();
    } catch (error) {
      const errorCode = extractInspectionItemErrorCode(error);
      await this.alertService.error(this.translate.instant(mapInspectionItemErrorCode(errorCode)));
    } finally {
      this.isSubmitting = false;
    }
  }

  private toPayload(original: InspectionItemRow | null): InspectionItemPayload {
    const raw = this.itemForm.getRawValue() as {
      code: string;
      translations: { locale: string; label: string }[];
    };

    // Scrutinize self-fix: `original` is the row snapshotted at modal-OPEN
    // time. `rows` is replaced by every accepted store.data$ emission while
    // the modal stays open (the trailing refresh() after any write, or another
    // owner's change), so the snapshot's `active` can be stale by save time —
    // and PUT sends the full shape, so a stale `true` silently UN-RETIRES an
    // item retired since the modal opened. That is exactly the F2 defect
    // SPEC §3.4.1 eliminated on the backend, re-entering through the client.
    // Re-read `active` from the current rows by id; fall back to the snapshot
    // only if the row is genuinely gone (create → default true, SPEC §3.3).
    const current = original ? this.rows.find((row) => row.id === original.id) : null;

    return {
      code: raw.code.trim().toLowerCase(),
      // `active` is NOT a modal field (UX spec §4.2) — it is flipped only by
      // toggleActive(); create defaults true (SPEC §3.3's server default).
      active: current?.active ?? original?.active ?? true,
      translations: raw.translations.map((translation) => ({
        locale: translation.locale,
        label: translation.label.trim(),
      })),
    };
  }

  // ── Retire / restore (AC#4 — the only "off" mechanism, never a delete) ──

  protected async toggleActive(row: InspectionItemRow): Promise<void> {
    if (row.active) {
      const confirmed = await this.alertService.confirm({
        title: this.translate.instant('ADMIN.INSPECTION_ITEMS.RETIRE_CONFIRM_TITLE'),
        text: this.translate.instant('ADMIN.INSPECTION_ITEMS.RETIRE_CONFIRM_TEXT'),
        confirmButtonText: this.translate.instant('ADMIN.INSPECTION_ITEMS.RETIRE_CONFIRM_BUTTON'),
        cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
      });
      if (!confirmed) {
        return;
      }
    }

    this.savingIds = { ...this.savingIds, [row.id]: true };
    try {
      const payload: InspectionItemPayload = {
        code: row.code,
        active: !row.active,
        translations: [
          { locale: 'en', label: row.labelEn },
          { locale: 'th', label: row.labelTh },
          { locale: 'zh', label: row.labelZh },
        ],
      };
      const response = await firstValueFrom(this.adminApiService.updateInspectionItem(row.id, payload));
      const updated = response?.data;
      if (updated) {
        this.store.mutate((list) => list.map((item) => (item.id === row.id ? updated : item)));
      }
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
    } catch (error) {
      const errorCode = extractInspectionItemErrorCode(error);
      await this.alertService.error(this.translate.instant(mapInspectionItemErrorCode(errorCode)));
    } finally {
      this.savingIds = { ...this.savingIds, [row.id]: false };
    }
  }

  private getCurrentLocale(): 'en' | 'th' | 'zh' {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    if (rawLocale.startsWith('en')) {
      return 'en';
    }
    if (rawLocale.startsWith('zh')) {
      return 'zh';
    }
    return 'th';
  }
}
