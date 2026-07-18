import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { classifyHttpFallback } from '../../../../shared/lib/http-error-fallback';
import {
  extractVehicleInspectionErrorCode,
  mapVehicleInspectionErrorCode,
} from '../../../../shared/lib/vehicle-inspection-error';
import { isWithinCurrentIsoWeekBangkok } from '../../../../shared/lib/inspection-week';
import {
  InspectionVerdict,
  MyInspectionDto,
  StaffApiService,
  VehicleInspectionItemDto,
} from '../../../../services/staff/staff-api.service';
import { VehicleInspectionItemsStore } from './vehicle-inspection-items.store';
import { InspectableVehiclesStore } from './inspectable-vehicles.store';
import { MyInspectionsStore } from './my-inspections.store';
import {
  InspectionItemRow,
  InspectionRowValue,
  Option,
  buildInspectionPayload,
  countCompletedRows,
  findFirstIncompleteRowIndex,
  findFirstMissingNoteRowIndex,
  mergeRowValues,
  toActiveItemRows,
  toVehicleOptions,
} from './inspection-page.mappers';

interface VerdictOption {
  value: InspectionVerdict;
  label: string;
}

/**
 * OBRS-312: driver weekly vehicle inspection form (`/staff/inspection`),
 * sibling of `/staff/driver` and `/staff/boarding/:scheduleId`. Phone-first
 * (375–414px primary viewport) — a sticky top strip (vehicle + odometer +
 * progress) and a sticky bottom submit bar keep both reachable through a
 * 23-row scroll.
 */
@Component({
  selector: 'app-inspection-page',
  templateUrl: './inspection-page.component.html',
  styleUrl: './inspection-page.component.scss',
})
export class InspectionPageComponent implements OnInit, OnDestroy {
  protected readonly form: FormGroup;
  protected itemRows: InspectionItemRow[] = [];
  protected vehicleOptions: Option[] = [];
  protected verdictOptions: VerdictOption[] = [];

  protected isItemsRefreshing = false;
  protected itemsErrorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 6 });

  protected isSubmitting = false;
  protected odometerServerError = '';
  protected highlightedItemId: number | null = null;

  protected showAlreadyInspectedBanner = false;
  protected isBannerDismissed = false;

  private rawItems: VehicleInspectionItemDto[] = [];
  private myInspections: MyInspectionDto[] = [];
  private readonly destroy$ = new Subject<void>();
  /** Fires immediately before each FormArray rebuild, unsubscribing the
   * outgoing generation of per-row verdict listeners. */
  private readonly rowSubscriptions$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    protected readonly itemsStore: VehicleInspectionItemsStore,
    protected readonly vehiclesStore: InspectableVehiclesStore,
    private readonly myInspectionsStore: MyInspectionsStore
  ) {
    this.form = this.fb.group({
      // design-system §3.1: no pre-seeded selection.
      vehicleId: [null, [Validators.required]],
      odometerKm: [null, [Validators.required]],
      notes: [''],
      items: this.fb.array([]),
    });

    this.buildVerdictOptions();
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.buildVerdictOptions();
    });

    this.form
      .get('odometerKm')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // A fresh edit invalidates the previous server-side odometer error.
        this.odometerServerError = '';
      });
  }

  ngOnInit(): void {
    this.itemsStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      if (data) {
        this.onItemsData(data);
      }
    });
    this.itemsStore.refreshing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((refreshing) => (this.isItemsRefreshing = refreshing));
    this.itemsStore.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.itemsErrorMessage =
        failed && !this.itemsStore.hasValue
          ? this.translate.instant('STAFF.INSPECTION.LOAD_FAILED')
          : '';
    });

    this.vehiclesStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.vehicleOptions = toVehicleOptions(data ?? []);
    });

    this.myInspectionsStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.myInspections = data ?? [];
      this.updateAlreadyInspectedBanner();
    });

    void this.itemsStore.refresh();
    void this.vehiclesStore.refresh();
    void this.myInspectionsStore.refresh();
  }

  ngOnDestroy(): void {
    this.rowSubscriptions$.next();
    this.rowSubscriptions$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get itemsFormArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  /** Loading skeleton only while refreshing with no cached value yet. */
  protected get isLoading(): boolean {
    return this.isItemsRefreshing && !this.itemsStore.hasValue;
  }

  /** 200 + [] (or every item inactive) — a misconfiguration, not a normal
   * state: full-page blocking empty state, Submit hidden. */
  protected get isEmpty(): boolean {
    return this.itemsStore.hasValue && !this.itemsErrorMessage && this.itemRows.length === 0;
  }

  protected get completedCount(): number {
    return countCompletedRows(this.currentRowValues());
  }

  protected get totalCount(): number {
    return this.itemRows.length;
  }

  protected trackByItemId(_index: number, row: InspectionItemRow): number {
    return row.itemId;
  }

  protected verdictAt(index: number): InspectionVerdict | null {
    const value = this.itemsFormArray.at(index)?.get('verdict')?.value;
    return (value ?? null) as InspectionVerdict | null;
  }

  protected isNoteInvalid(index: number): boolean {
    const control = this.itemsFormArray.at(index)?.get('note');
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  protected dismissBanner(): void {
    this.isBannerDismissed = true;
  }

  protected async onSubmit(): Promise<void> {
    if (this.isSubmitting) {
      return;
    }

    if (this.form.get('vehicleId')!.invalid || this.form.get('odometerKm')!.invalid) {
      this.form.get('vehicleId')!.markAsTouched();
      this.form.get('odometerKm')!.markAsTouched();
      this.alertService.toast(
        this.translate.instant('STAFF.INSPECTION.VALIDATION_INCOMPLETE'),
        'warning'
      );
      return;
    }

    const rows = this.currentRowValues();

    const incompleteIndex = findFirstIncompleteRowIndex(rows);
    if (incompleteIndex !== -1) {
      this.scrollToRow(rows[incompleteIndex].itemId);
      this.alertService.toast(
        this.translate.instant('STAFF.INSPECTION.VALIDATION_INCOMPLETE'),
        'warning'
      );
      return;
    }

    const missingNoteIndex = findFirstMissingNoteRowIndex(rows);
    if (missingNoteIndex !== -1) {
      this.itemsFormArray.at(missingNoteIndex).get('note')!.markAsTouched();
      this.scrollToRow(rows[missingNoteIndex].itemId);
      this.alertService.toast(
        this.translate.instant('STAFF.INSPECTION.VALIDATION_NOTE_REQUIRED'),
        'warning'
      );
      return;
    }

    const vehicleId = Number(this.form.get('vehicleId')!.value);
    const odometerKm = Number(this.form.get('odometerKm')!.value);
    const notes = String(this.form.get('notes')!.value ?? '');
    const payload = buildInspectionPayload(odometerKm, notes, rows);

    this.isSubmitting = true;
    try {
      const response = await firstValueFrom(
        this.staffApiService.submitVehicleInspection(vehicleId, payload)
      );
      const defectCount = response?.data?.defectCount ?? 0;
      this.alertService.toast(
        defectCount > 0
          ? this.translate.instant('STAFF.INSPECTION.SUCCESS_WITH_DEFECTS', { count: defectCount })
          : this.translate.instant('STAFF.INSPECTION.SUCCESS_NO_DEFECTS'),
        defectCount > 0 ? 'warning' : 'success'
      );
      this.resetToFreshForm();
      void this.myInspectionsStore.refresh();
    } catch (error) {
      // Error paths are NON-DESTRUCTIVE — never clear the form on a 4xx (this
      // deliberately deviates from AppVehicleMaintenancePanelComponent's
      // closeFormModal(true)-on-error precedent: this form can represent
      // many minutes of on-site work on a shaky mobile connection).
      this.handleSubmitError(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  private handleSubmitError(error: unknown): void {
    const errorCode = extractVehicleInspectionErrorCode(error);

    if (errorCode === 'ODOMETER_BELOW_LAST_RECORDED') {
      // Inline field error rendering the server's message verbatim — it
      // interpolates vehicle label / submitted km / last recorded km
      // server-side; there is no `args` field, so this never parses numbers
      // back out of the string.
      this.odometerServerError =
        extractApiErrorMessage(error) ||
        this.translate.instant('STAFF.INSPECTION.ERROR.ODOMETER_BELOW_LAST_RECORDED');
      return;
    }

    if (errorCode === 'INSPECTION_ITEM_INACTIVE') {
      void this.alertService.warning(
        this.translate.instant('STAFF.INSPECTION.ERROR.ITEM_INACTIVE')
      );
      // Silently refresh the items store — onItemsData() preserves
      // already-entered verdicts/notes for itemIds still active.
      void this.itemsStore.refresh();
      return;
    }

    if (errorCode === 'INSPECTION_ITEMS_INCOMPLETE' || errorCode === 'INSPECTION_NOTE_REQUIRED') {
      // Pre-empted client-side; a server round-trip is defensive only —
      // shown verbatim, never re-derived from the mapped i18n key.
      this.alertService.toast(
        extractApiErrorMessage(error) || this.translate.instant(mapVehicleInspectionErrorCode(errorCode)),
        'warning'
      );
      return;
    }

    const fallbackTier = classifyHttpFallback(error);
    void this.alertService.error(
      this.translate.instant(mapVehicleInspectionErrorCode(errorCode, fallbackTier))
    );
  }

  private onItemsData(items: VehicleInspectionItemDto[]): void {
    const previous = this.currentRowValuesMap();
    const merged = mergeRowValues(items, previous);
    this.rawItems = items;
    this.itemRows = toActiveItemRows(items);
    this.applyRowsToFormArray(merged);
  }

  private resetToFreshForm(): void {
    this.form.reset({ vehicleId: null, odometerKm: null, notes: '' });
    this.odometerServerError = '';
    const fresh = mergeRowValues(this.rawItems, new Map());
    this.applyRowsToFormArray(fresh);
  }

  private applyRowsToFormArray(rows: InspectionRowValue[]): void {
    // Tear down the PREVIOUS generation's per-row verdict subscriptions before
    // discarding their FormGroups — takeUntil(destroy$) alone would keep every
    // orphaned group's subscription alive for the component's whole lifetime,
    // and the array is rebuilt on every items-store emit + every submit.
    this.rowSubscriptions$.next();
    this.itemsFormArray.clear();
    for (const row of rows) {
      this.itemsFormArray.push(this.buildItemGroup(row));
    }
  }

  private buildItemGroup(row: InspectionRowValue): FormGroup {
    const group = this.fb.group({
      // Seed the note validator from the row's CARRIED-FORWARD verdict: the
      // valueChanges subscription below does not fire for a value supplied at
      // construction, so a rebuild (INSPECTION_ITEM_INACTIVE recovery, or any
      // items-store re-emit mid-edit) would otherwise resurrect a
      // needs_repair row with its mandatory-note validator silently dropped —
      // the inline "note required" error then never renders again.
      verdict: [row.verdict],
      note: [row.note, row.verdict === 'needs_repair' ? [Validators.required] : []],
    });

    group
      .get('verdict')!
      .valueChanges.pipe(takeUntil(this.rowSubscriptions$), takeUntil(this.destroy$))
      .subscribe((verdict: InspectionVerdict | null) => {
        const noteControl = group.get('note')!;
        if (verdict === 'needs_repair') {
          noteControl.setValidators([Validators.required]);
        } else {
          // Switching AWAY from needs_repair clears the note control's
          // VALUE (not just hiding the textarea) so stale text is never
          // silently resubmitted.
          noteControl.setValue('', { emitEvent: false });
          noteControl.clearValidators();
        }
        noteControl.updateValueAndValidity({ emitEvent: false });
      });

    return group;
  }

  private currentRowValues(): InspectionRowValue[] {
    return this.itemRows.map((meta, index) => {
      const group = this.itemsFormArray.at(index) as FormGroup;
      return {
        itemId: meta.itemId,
        verdict: (group.get('verdict')!.value ?? null) as InspectionVerdict | null,
        note: String(group.get('note')!.value ?? ''),
      };
    });
  }

  private currentRowValuesMap(): Map<number, InspectionRowValue> {
    return new Map(this.currentRowValues().map((row) => [row.itemId, row]));
  }

  private updateAlreadyInspectedBanner(): void {
    const hasThisWeek = this.myInspections.some((inspection) =>
      isWithinCurrentIsoWeekBangkok(inspection.inspectedAt)
    );
    if (hasThisWeek && !this.showAlreadyInspectedBanner) {
      // A newly-discovered reason to show it re-arms the dismiss state.
      this.isBannerDismissed = false;
    }
    this.showAlreadyInspectedBanner = hasThisWeek;
  }

  private scrollToRow(itemId: number): void {
    this.highlightedItemId = itemId;
    setTimeout(() => {
      document
        .getElementById(`inspection-row-${itemId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
    setTimeout(() => {
      if (this.highlightedItemId === itemId) {
        this.highlightedItemId = null;
      }
    }, 2500);
  }

  private buildVerdictOptions(): void {
    this.verdictOptions = [
      { value: 'ok', label: this.translate.instant('STAFF.INSPECTION.VERDICT_OK') },
      { value: 'needs_repair', label: this.translate.instant('STAFF.INSPECTION.VERDICT_NEEDS_REPAIR') },
    ];
  }
}
