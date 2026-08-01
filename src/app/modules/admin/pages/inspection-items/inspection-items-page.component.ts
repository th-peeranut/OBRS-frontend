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
  InspectionItemLocale,
  InspectionItemRow,
  isCategoryHeaderRow,
  moveRowDown,
  moveRowToBottom,
  moveRowToTop,
  moveRowUp,
  resolveInspectionItemLabel,
  toInspectionItemRows,
  toReorderPayload,
} from './inspection-items.mappers';
import {
  VEHICLE_INSPECTION_CATEGORIES,
  categoryLabelKey,
} from '../../../../shared/lib/vehicle-inspection-category';

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
    standalone: false
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

  // OBRS-529: the list table's label column renders exactly ONE line — the
  // label for whichever locale is currently selected app-wide (design-system
  // review: the column header already says "ป้ายกำกับ" and the language
  // picker lives on the topbar, so a per-row TH/EN/ZH triple is redundant).
  // Set once at construction AND re-set on every `onLangChange` emission
  // (the `cargo-capacity-page.component.ts` precedent for a locale-dependent
  // view over already-loaded data) so the table re-renders IMMEDIATELY on a
  // topbar language switch — a field read only in the constructor/ngOnInit
  // would silently freeze at whatever locale was active on first load.
  protected currentLocale: InspectionItemLocale = 'th';

  /** OBRS-530: the 7-option category dropdown's options, `{code, label}`
   * (design-system §3.1 `app-admin-dropdown` contract) — labels are
   * translated client-side (ngx-translate), so unlike `currentLocale` above
   * this is rebuilt (not just re-derived) on every `onLangChange` emission,
   * the same "live, not captured-once" precedent. */
  protected categoryOptions: { code: string; label: string }[] = [];
  /** Bound in the template for the group header `<tr>`'s translated text —
   * the SAME key-builder the driver form's `groupRowsByCategory` uses, so the
   * two surfaces can never read a different i18n namespace for the same
   * category code. */
  protected readonly resolveCategoryLabelKey = categoryLabelKey;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: InspectionItemsStore
  ) {
    this.currentLocale = this.getCurrentLocale();
    this.buildCategoryOptions();
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.currentLocale = this.getCurrentLocale();
      this.buildCategoryOptions();
    });

    // Built once, fixed length (3), never rebuilt — see the class doc above
    // and UX spec §4.1.2. openCreateModal()/openEditModal() only `reset()`
    // this same FormGroup/FormArray with fresh values.
    // OBRS-529: `code` is no longer a form field — it is server-generated on
    // create and never edited here (§3.5 handoff). `en`/`zh` labels are no
    // longer `Validators.required` (owner decision) — Thai is the only
    // mandatory locale (`SNAPSHOT_LOCALE` above is why).
    // OBRS-530: `category` starts EMPTY (design-system §3.1 — no pre-seeded
    // default, forcing an explicit choice) and is `Validators.required`,
    // mirroring the backend's `@NotNull` client-side for a friendly message.
    this.itemForm = this.formBuilder.group({
      category: ['', Validators.required],
      // Thai first — see `localeLabelKeys` above; the two are index-aligned.
      translations: this.formBuilder.array([
        this.formBuilder.group({ locale: ['th'], label: ['', Validators.required] }),
        this.formBuilder.group({ locale: ['en'], label: [''] }),
        this.formBuilder.group({ locale: ['zh'], label: [''] }),
      ]),
    });
  }

  /** Rebuilt (not just re-derived) on every language switch — the option
   * labels are translated TEXT baked into the array at build time, so a
   * one-time construction would freeze the dropdown at whatever language was
   * active on first load (the exact bug class `onLangChange` handling
   * elsewhere in this file exists to avoid). */
  private buildCategoryOptions(): void {
    this.categoryOptions = VEHICLE_INSPECTION_CATEGORIES.map((code) => ({
      code,
      label: this.translate.instant(categoryLabelKey(code)),
    }));
  }

  ngOnInit(): void {
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      // §3.2.2a: while a reorder is outstanding, this subscription must NOT
      // replace `rows` — only the winning reorder success/error handlers may.
      // OBRS-506: a null emission (OBRS-467 shape — clear() DISCARDING the
      // cache, e.g. on logout) is NOT the same case as "reorder outstanding"
      // and must still clear `rows` rather than early-return and leave the
      // previous session's rows on screen; only the reorderPending gate skips
      // the replace now.
      if (this.reorderPending) {
        return;
      }
      this.rows = data === null ? [] : toInspectionItemRows(data);
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

  /** OBRS-530: group-scoped — a row at the top of its OWN category run can't
   * move up even if earlier groups exist above it in the table. */
  protected canMoveUp(index: number): boolean {
    return index > 0 && this.rows[index - 1].category === this.rows[index].category;
  }

  /** OBRS-530: group-scoped — a row at the bottom of its OWN category run
   * can't move down even if later groups exist below it in the table. */
  protected canMoveDown(index: number): boolean {
    return (
      index < this.rows.length - 1 && this.rows[index + 1].category === this.rows[index].category
    );
  }

  /** OBRS-530: is `this.rows[index]` the first row of a new category run? —
   * drives the group header `<tr>` inserted just before it in the template. */
  protected isGroupHeaderRow(index: number): boolean {
    return isCategoryHeaderRow(this.rows, index);
  }

  /** OBRS-529: the list table's single label cell AND the move-button aria-labels
   * — both read `this.currentLocale` (kept live by the `onLangChange` subscription
   * in the constructor), so every caller reacts to a topbar language switch
   * without re-subscribing. Falls back selected -> en -> code, mirroring the
   * backend's `TranslationUtil.resolveLabel` (never renders an empty cell). */
  protected displayLabel(row: InspectionItemRow): string {
    return resolveInspectionItemLabel(row, this.currentLocale);
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
      // design-system §3.1: no pre-seeded category — the owner must choose.
      category: '',
      translations: [
        { locale: 'th', label: '' },
        { locale: 'en', label: '' },
        { locale: 'zh', label: '' },
      ],
    });
    this.isFormModalOpen = true;
  }

  protected openEditModal(row: InspectionItemRow): void {
    this.isEditMode = true;
    this.selectedItem = row;
    this.itemForm.reset({
      category: row.category,
      translations: [
        { locale: 'th', label: row.labelTh },
        { locale: 'en', label: row.labelEn },
        { locale: 'zh', label: row.labelZh },
      ],
    });
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

  protected isTranslationInvalid(index: number): boolean {
    const control = this.translationsFormArray.at(index)?.get('label');
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  protected isCategoryInvalid(): boolean {
    const control = this.itemForm.get('category');
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
      category: string;
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

    // OBRS-529: `code` is server-generated and no longer a form field — CREATE
    // omits it entirely (nothing to send: the user never typed one). EDIT
    // still forwards the item's existing code (current row first, falling
    // back to the open-time snapshot) since it never changes here and the
    // backend request DTO may still declare it.
    const code = current?.code ?? original?.code;

    return {
      ...(code ? { code } : {}),
      // `active` is NOT a modal field (UX spec §4.2) — it is flipped only by
      // toggleActive(); create defaults true (SPEC §3.3's server default).
      active: current?.active ?? original?.active ?? true,
      // OBRS-530: required on BOTH create and update, always sourced from the
      // form (never carried forward from `original`/`current`) — editing
      // `category` on an existing item IS the cross-group move mechanism, so
      // this must always REPLACE, unlike `active`'s carry-forward above.
      category: raw.category,
      // OBRS-529: a locale the owner left blank is OMITTED from the payload, not
      // sent as `label: ''`. Two independent reasons, either one sufficient:
      //   1. `TranslationReqDto.label` carries an unconditional `@NotBlank`, and
      //      that DTO is shared with 7+ other domains (Lookup, Promotion, Province,
      //      Role, Route, Stop, VehicleType) where every locale really IS required.
      //      An empty string is rejected by bean validation before this feature's
      //      own `validateLocales` ever runs — so sending '' 400s the request and
      //      the Thai-only save this whole card exists for becomes impossible.
      //   2. Even if it were accepted, '' is the wrong thing to mean. An empty
      //      label is "no translation", not "a translation whose text is empty" —
      //      and the backend's update path already reads "locale absent from the
      //      payload" as "delete that translation row", which is exactly what
      //      clearing the field should do. A persisted empty row would instead
      //      shadow the `requested -> en -> code` fallback with a blank.
      translations: raw.translations
        .map((translation) => ({
          locale: translation.locale,
          label: translation.label.trim(),
        }))
        .filter((translation) => translation.label.length > 0),
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
        // OBRS-530: retire/restore never changes the item's group — carry the
        // row's own category forward unchanged (the backend requires it on
        // every PUT, but this action has no UI for changing it).
        category: row.category,
        // OBRS-530 (Scrutinize): a locale the owner left blank must be OMITTED
        // here for exactly the reasons `toPayload` above already documents —
        // `TranslationReqDto.label` carries an unconditional `@NotBlank`, so a
        // `label: ''` 400s the whole request. `toPayload` was fixed for this in
        // OBRS-529 but this SECOND payload builder was missed, leaving retire/
        // restore permanently broken (400 VALIDATION_FAILED) for any Thai-only
        // item — i.e. every item the OBRS-529 card exists to make creatable.
        // Invisible to the suite because every retire/restore spec's fixture is
        // a full en+th+zh item, a shape the real caller need not produce.
        translations: [
          { locale: 'en', label: row.labelEn },
          { locale: 'th', label: row.labelTh },
          { locale: 'zh', label: row.labelZh },
        ].filter((translation) => translation.label.trim().length > 0),
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
